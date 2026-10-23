import path from "node:path";
import fs from "node:fs";
import express from "express";
import compression from "compression";
import { isRunning, runScript } from "./jobScheduler";
import { getSchedulerConfig, updateSchedulerConfig } from "./schedulerConfig";
import { startHourlyScheduler } from "./hourlyScheduler";
import { QueueSql } from "./interface/queue";
import { JourneySql } from "./interface/journey_sql";
import { PdmSql } from "./interface/pdm_sql";
import { ActivitySql } from "./interface/activity";

const PORT = process.env.PORT ?? 3000;
const FRONTEND_DIST = path.join(__dirname, "frontend/dist");

const app = express();
// /api/parts/dataset ships the whole todo/done table as one JSON response (tens of MB
// uncompressed) so the frontend can filter it locally instead of re-querying per slider tick -
// gzip cuts that down a lot since it's mostly small repeated integers.
app.use(compression());
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

    const queue = new QueueSql();
    try {
        res.status(201).json(queue.add(code.trim(), path.trim()));
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

    const queue = new QueueSql();
    try {
        res.status(201).json(queue.add(trimmedCode, file.path));
    } finally {
        queue.close();
    }
});

// "Add family": `pattern` is a glob (e.g. "22*"); queues every file under the vault's \CAD\
// folder whose filename matches it and whose current PDM status is "Approvato".
api.post("/queue/by-pattern", async (req, res) => {
    const { pattern } = req.body ?? {};
    if (typeof pattern !== "string" || !pattern.trim()) {
        res.status(400).json({ error: "pattern is required" });
        return;
    }
    const trimmedPattern = pattern.trim();

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

    if (files.length === 0) {
        res.status(404).json({ error: `No approved CAD files matched "${trimmedPattern}"` });
        return;
    }

    const queue = new QueueSql();
    try {
        const jobs = queue.addMany(files.map((file) => ({ code: file.filename, path: file.path })));
        res.status(201).json(jobs);
    } finally {
        queue.close();
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

app.listen(PORT, () => {
    console.log(`conformita backend listening on port ${PORT}`);
    startHourlyScheduler();
});