import { QueueSql } from "../interface/queue";
import { UpdateFlowSql } from "../interface/updateFlow";

export const MAX_PACK = 50;
const SERVICE_BASE_URL = process.env.PDM_SERVICE_URL ?? "http://localhost:5000";

/**
 * Calls /update for a single path and waits for the response. The service's /update
 * endpoint runs the file's full update state machine synchronously, so the HTTP
 * response only arrives once that file is actually done - that's what lets this
 * loop send the next path only after the current one has finished.
 */
async function callUpdate(path: string): Promise<boolean> {
    const url = `${SERVICE_BASE_URL}/update?path=${encodeURIComponent(path)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`/update failed for ${path}: HTTP ${response.status}`);
            return false;
        }
        return true;
    } catch (err) {
        console.error(`/update request failed for ${path}:`, err);
        return false;
    }
}

async function callApprove(num: number): Promise<void> {
    const url = `${SERVICE_BASE_URL}/approve?num=${num}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`/approve failed: HTTP ${response.status}`);
        }
    } catch (err) {
        console.error("/approve request failed:", err);
    }
}

/**
 * Script 1: drains up to `maxPack` jobs from the queue, running /update on each path
 * one at a time (removing jobs that succeed, leaving failures queued for retry), then
 * calls /approve once for the whole batch. Defaults to MAX_PACK, but callers (e.g. the
 * idle-server scheduler) can pass a smaller pack size.
 *
 * If the queue comes up empty, this run is still inside an allowed update window (that's
 * the only way run() gets called - see hourlyScheduler.ts), so rather than doing nothing it
 * falls back to update_flow: any file the service already started but hasn't approved yet
 * gets another /update pass, so it keeps moving toward approval instead of being stuck
 * until something new happens to land in the queue.
 */
export async function run(maxPack: number = MAX_PACK): Promise<void> {
    const queue = new QueueSql();
    try {
        const jobs = queue.take(maxPack);
        console.log(`script1: picked up ${jobs.length} job(s) (maxPack=${maxPack})`);

        for (const job of jobs) {
            console.log(`script1: updating [${job.code}] ${job.path}`);
            const ok = await callUpdate(job.path);
            if (ok) {
                queue.remove(job.id);
            }
        }

        if (jobs.length === 0) {
            const pending = new UpdateFlowSql();
            let notYetApproved: ReturnType<UpdateFlowSql["notYetApproved"]>;
            try {
                notYetApproved = pending.notYetApproved(maxPack);
            } finally {
                pending.close();
            }
            console.log(`script1: queue empty - ${notYetApproved.length} not-yet-approved file(s) to follow up on`);

            for (const file of notYetApproved) {
                console.log(`script1: updating [${file.code}] ${file.path}`);
                await callUpdate(file.path);
            }
        }

        await callApprove(maxPack);
        console.log("script1: done");
    } finally {
        queue.close();
    }
}

if (require.main === module) {
    run().catch((err) => {
        console.error("script1 failed:", err);
        process.exitCode = 1;
    });
}
