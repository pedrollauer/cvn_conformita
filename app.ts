// Imported first so nothing logged during the rest of this file's module-load (or anything that
// runs on require.main like script1.ts, if that's ever imported) is missed by the ring buffer.
import { getConsoleBacklog, subscribeConsole } from "./consoleLog";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import compression from "compression";
import { isRunning, runScript } from "./jobScheduler";
import { getSchedulerConfig, updateSchedulerConfig } from "./schedulerConfig";
import { startHourlyScheduler, getNextRunEstimate } from "./hourlyScheduler";
import { getCurrentFile } from "./runState";
import { QueueSql } from "./interface/queue";
import { UpdateFlowSql } from "./interface/updateFlow";
import { JourneySql } from "./interface/journey_sql";
import { PdmSql } from "./interface/pdm_sql";
import { ActivitySql } from "./interface/activity";

// The only script jobScheduler.ts currently has registered (see hourlyScheduler.ts's SCRIPT_ID) -
// hardcoded here the same way, rather than generalizing a single-script status endpoint.
const SCRIPT_ID = 1;

const PORT = process.env.PORT ?? 3000;
const FRONTEND_DIST = path.join(__dirname, "frontend/dist");

const app = express();
// /api/parts/dataset ships the whole todo/done table as one JSON response (tens of MB
// uncompressed) so the frontend can filter it locally instead of re-querying per slider tick -
// gzip cuts that down a lot since it's mostly small repeated integers. /api/console/stream is
// excluded - compression buffers output looking for data worth compressing, which defeats an
// SSE stream that needs each line flushed to the client as soon as it's written.
app.use(compression({ filter: (req, res) => req.path !== "/api/console/stream" && compression.filter(req, res) }));
app.use(express.json());

const api = express.Router();

// Triggers a registered script (see jobScheduler.ts) to run in the background.
// Responds immediately since scripts can take a long time (MAX_PACK files per run).
api.post("/scheduler/run/:id", (req, res) => {
    const id = Number(req.params.id);
    if (isRunning(id)) {
        res.status(409).json({ error: `Script ${id} is already running` });
        return;
    }

    const maxPack = req.query.maxPack !== undefined ? Number(req.query.maxPack) : undefined;
    runScript(id, maxPack).catch((err) => {
        console.error(`Script ${id} failed:`, err);
    });

    res.status(202).json({ message: `Script ${id} started` });
});

// Live "is script1 running, on what file right now, and when's the next run" status for the
// dashboard - cheap, in-memory/config-file only (see runState.ts, hourlyScheduler.ts), safe to
// poll often.
api.get("/scheduler/status", (_req, res) => {
    res.json({ running: isRunning(SCRIPT_ID), currentFile: getCurrentFile(), nextRun: getNextRunEstimate() });
});

api.get("/scheduler/config", (_req, res) => {
    res.json(getSchedulerConfig());
});

// Partial update: body may include any subset of { weekend, week, idleServer }.
api.post("/scheduler/config", (req, res) => {
    try {
        const config = updateSchedulerConfig(req.body ?? {});
        res.json(config);
    } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
});

// Skips re-queuing a file that's either already sitting in `queue` (a literal duplicate row) or
// has already run all the way through update+checkin and been approved (queuing it again would
// just be a no-op for Scripts.Update that burns a maxPack slot). Returns the reason to report
// back, or null if it's fine to add.
function queueSkipReason(code: string, path: string): string | null {
    const queue = new QueueSql();
    try {
        if (queue.has(code, path)) {
            return "Already in queue";
        }
    } finally {
        queue.close();
    }

    const updateFlow = new UpdateFlowSql();
    try {
        if (updateFlow.isFullyDone(code, path)) {
            return "Already fully processed and approved";
        }
    } finally {
        updateFlow.close();
    }

    return null;
}

api.get("/queue", (_req, res) => {
    const queue = new QueueSql();
    try {
        res.json(queue.all());
    } finally {
        queue.close();
    }
});

api.post("/queue", (req, res) => {
    const { code, path } = req.body ?? {};
    if (typeof code !== "string" || !code.trim() || typeof path !== "string" || !path.trim()) {
        res.status(400).json({ error: "Both code and path are required strings" });
        return;
    }
    const trimmedCode = code.trim();
    const trimmedPath = path.trim();

    const skipReason = queueSkipReason(trimmedCode, trimmedPath);
    if (skipReason) {
        res.status(200).json({ skipped: true, code: trimmedCode, path: trimmedPath, reason: skipReason });
        return;
    }

    const queue = new QueueSql();
    try {
        res.status(201).json(queue.add(trimmedCode, trimmedPath));
    } finally {
        queue.close();
    }
});

// Looks up `code` (an exact filename, e.g. "731110143578.SLDPRT") in the PDM vault and queues
// its resolved path, so script1 (see jobScheduler.ts) can run /update on it without the caller
// having to already know where the file lives in the vault.
api.post("/queue/from-code", async (req, res) => {
    const { code } = req.body ?? {};
    if (typeof code !== "string" || !code.trim()) {
        res.status(400).json({ error: "code is required" });
        return;
    }
    const trimmedCode = code.trim();

    const pdm = new PdmSql();
    let file;
    try {
        file = await pdm.findFileByCode(trimmedCode);
    } catch (err) {
        res.status(502).json({ error: `PDM lookup failed: ${err instanceof Error ? err.message : String(err)}` });
        return;
    } finally {
        await pdm.close();
    }

    if (!file) {
        res.status(404).json({ error: `No file named "${trimmedCode}" found in the PDM vault` });
        return;
    }

    const skipReason = queueSkipReason(trimmedCode, file.path);
    if (skipReason) {
        res.status(200).json({ skipped: true, code: trimmedCode, path: file.path, reason: skipReason });
        return;
    }

    const queue = new QueueSql();
    try {
        res.status(201).json(queue.add(trimmedCode, file.path));
    } finally {
        queue.close();
    }
});

// "Add family": `pattern` is a glob (e.g. "22*"); queues every file under the vault's \CAD\
// folder whose filename matches it and whose current PDM status is "Approvato". `hvFrom`/`hvTo`
// are optional - when given, the match is further restricted to files with an HV project link
// (from code_project, the same data the dashboard's HV slider filters by) inside that range,
// so "Add family" queues only what's currently in view on the dashboard rather than every
// approved file PDM finds for the pattern.
api.post("/queue/by-pattern", async (req, res) => {
    const { pattern, hvFrom, hvTo } = req.body ?? {};
    if (typeof pattern !== "string" || !pattern.trim()) {
        res.status(400).json({ error: "pattern is required" });
        return;
    }
    const trimmedPattern = pattern.trim();
    const hasRange = typeof hvFrom === "number" && typeof hvTo === "number";

    const pdm = new PdmSql();
    let files;
    try {
        files = await pdm.findApprovedCadFiles(trimmedPattern);
    } catch (err) {
        res.status(502).json({ error: `PDM search failed: ${err instanceof Error ? err.message : String(err)}` });
        return;
    } finally {
        await pdm.close();
    }

    if (hasRange) {
        const journey = new JourneySql();
        let inRange: Set<string>;
        try {
            inRange = journey.getCodesWithProjectInRange(hvFrom, hvTo);
        } finally {
            journey.close();
        }
        files = files.filter((file) => inRange.has(file.filename.toUpperCase()));
    }

    if (files.length === 0) {
        res.status(404).json({
            error: hasRange
                ? `No approved CAD files matched "${trimmedPattern}" within HV${hvFrom}-HV${hvTo}`
                : `No approved CAD files matched "${trimmedPattern}"`,
        });
        return;
    }

    const queue = new QueueSql();
    const updateFlow = new UpdateFlowSql();
    try {
        // Queue membership is checked against one snapshot rather than once per file - "Add
        // family" can match thousands of files, and a has() query per file would be thousands of
        // round-trips for what's really one question ("which of these are already queued?").
        const alreadyQueued = new Set(queue.all().map((job) => `${job.code}\u0000${job.path}`));
        const eligible = files.filter(
            (file) => !alreadyQueued.has(`${file.filename}\u0000${file.path}`) && !updateFlow.isFullyDone(file.filename, file.path),
        );
        const skippedCount = files.length - eligible.length;

        const jobs = queue.addMany(eligible.map((file) => ({ code: file.filename, path: file.path })));
        res.status(201).json({ queued: jobs, skippedCount });
    } finally {
        queue.close();
        updateFlow.close();
    }
});

// Snapshot of the PDM Operations tab queue - tasks that are queued or actively running (EndTime
// IS NULL). Hits the PDM SQL server directly, so it's a real-time read, not cached.
api.get("/pdm/running-tasks", async (_req, res) => {
    const pdm = new PdmSql();
    try {
        res.json(await pdm.getRunningTasks());
    } catch (err) {
        res.status(502).json({ error: `PDM query failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
        await pdm.close();
    }
});

// The real span of known HV project numbers, so the frontend can size its slider correctly.
api.get("/parts/range", (_req, res) => {
    const journey = new JourneySql();
    try {
        res.json(journey.getProjectRange());
    } finally {
        journey.close();
    }
});

// One-shot snapshot of every todo/done part with its project links and (for todo) its active
// error codes. The frontend fetches this once and does all HV-range/occurrence filtering locally
// instead of re-querying per slider tick - see frontend/src/pages/PartsView.tsx. "In queue" isn't
// included here since it comes from the separate, much smaller queue DB and isn't scoped by range.
api.get("/parts/dataset", (_req, res) => {
    const journey = new JourneySql();
    try {
        res.json(journey.getFullDataset());
    } finally {
        journey.close();
    }
});

// Daily throughput (files approved per day) for the dashboard's activity pane - zero-filled so
// quiet days are visible rather than skipped. Defaults to the trailing 30 days.
api.get("/activity/daily", (req, res) => {
    const days = Number(req.query.days) || 30;
    const activity = new ActivitySql();
    try {
        res.json(activity.getDailyCounts(days));
    } finally {
        activity.close();
    }
});

// Raw total of the `done` table - the dashboard's headline "Done" count, deliberately a flat DB
// row count rather than the distinct-part count the todo/done dataset below would give.
api.get("/activity/done-total", (_req, res) => {
    const activity = new ActivitySql();
    try {
        res.json({ count: activity.getTotalCount() });
    } finally {
        activity.close();
    }
});

// Live tail of everything logged via console.log/console.error (see consoleLog.ts) - the
// backing store for the /console page's "script console as it's running" view. Sends the
// existing backlog immediately, then streams new lines as they're logged for as long as the
// client stays connected.
api.get("/console/stream", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
    });

    // send() is called from subscribeConsole's listener - an event-emitter callback, not a
    // middleware Express can catch exceptions from. Writing to a socket the client has already
    // torn down throws there, which previously went uncaught and crashed the whole process.
    const send = (line: string): void => {
        if (res.writableEnded || res.destroyed) {
            return;
        }
        try {
            res.write(`data: ${JSON.stringify(line)}\n\n`);
        } catch (err) {
            console.error("[console/stream] write failed, dropping subscriber:", err);
            unsubscribe();
        }
    };

    // Subscribed before replaying the backlog - send() can call unsubscribe() on a failed
    // write, so unsubscribe must already be assigned before send's first call below.
    const unsubscribe = subscribeConsole(send);
    req.on("close", unsubscribe);

    for (const line of getConsoleBacklog()) {
        send(line);
    }
});

// Plain polling fallback for the same backlog - the /console page uses this instead of the SSE
// stream above. A simple finite JSON response sidesteps whatever in this environment (proxy,
// browser, or devtools instrumentation attached to it) was leaving the long-lived SSE connection
// stuck in a perpetual "connecting" state despite the stream itself working fine for any plain
// HTTP client that isn't a browser tab under active automation/inspection.
api.get("/console/snapshot", (_req, res) => {
    res.json({ lines: getConsoleBacklog() });
});

app.use("/api", api);

if (fs.existsSync(FRONTEND_DIST)) {
    app.use(express.static(FRONTEND_DIST));
    // SPA fallback: any non-API, non-static route serves index.html so client-side routing works.
    app.get(/^(?!\/api).*/, (_req, res) => {
        res.sendFile(path.join(FRONTEND_DIST, "index.html"));
    });
} else {
    app.get("/", (_req, res) => {
        res.send("conformita backend running (frontend not built — run `npm run build` in frontend/)");
    });
}

// Logs any route exception (captured by consoleLog.ts too, so it shows up in /console) instead
// of letting it disappear into Express's default handler - that's what made the /console
// route's own bug hard to diagnose from outside the server process.
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(`[app] unhandled error on ${req.method} ${req.originalUrl}:`, err);
    if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`conformita backend listening on port ${PORT}`);
    startHourlyScheduler();
});