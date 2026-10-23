export declare const MAX_PACK = 50;
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
export declare function run(maxPack?: number): Promise<void>;
//# sourceMappingURL=script1.d.ts.map