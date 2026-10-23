export interface QueueJob {
    id: number;
    code: string;
    path: string;
}
/**
 * Read/write access to the `queue` table in the shared PDM service SQLite DB
 * (C:\db\conformita.db, see service/Interfaces/SQL.cs). Mirrors the `queue` model
 * in service/DB/queue.cs.
 */
export declare class QueueSql {
    private readonly db;
    constructor();
    /** Takes up to `limit` jobs off the front of the queue (oldest first), without removing them. */
    take(limit: number): QueueJob[];
    /** Lists every job currently in the queue (oldest first). */
    all(): QueueJob[];
    /** Adds a job to the back of the queue. */
    add(code: string, path: string): QueueJob;
    /**
     * Adds many jobs in a single transaction (one commit/fsync total instead of one per row).
     * "Add family" can queue thousands of files at once; inserting them with separate `add()`
     * calls each commits individually, which is what made it feel like it hangs.
     */
    addMany(jobs: Array<{
        code: string;
        path: string;
    }>): QueueJob[];
    /** Removes a job from the queue once it has been successfully processed. */
    remove(id: number): void;
    close(): void;
}
//# sourceMappingURL=queue.d.ts.map