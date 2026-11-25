export interface DistintaQueueItem {
    id: number;
    file: string;
    path: string | null;
    checkedInAt: string | null;
}
/**
 * Read/write access to conformita's own distinta tracking DB (C:\db\distinta.db) - separate from
 * the shared C:\db\conformita.db, which the .NET PDM service also writes to. Holds:
 *   - `last_run`: a single row recording when the PDM checkins sync last ran, so each sync only
 *     has to ask PDM for what's been checked in since then instead of re-scanning everything.
 *   - `queue`: one row per checked-in file the sync has seen, append-only - the Distinta page
 *     reads this table directly instead of re-querying PDM on every page load.
 */
export declare class DistintaSql {
    private readonly db;
    constructor();
    /** The last time the sync ran, or null if it has never run before. */
    getLastRun(): Date | null;
    /** Records `when` as the new last-run time - there's only ever the one row. */
    setLastRun(when: Date): void;
    /** Appends one row per file to the queue, in a single transaction. */
    enqueue(files: Array<{
        file: string;
        path: string | null;
        checkedInAt: string | null;
    }>): void;
    /** Every file the sync has ever queued, oldest first. */
    all(): DistintaQueueItem[];
    close(): void;
}
//# sourceMappingURL=distinta_sql.d.ts.map