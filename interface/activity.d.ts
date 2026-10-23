export interface DailyCount {
    date: string;
    count: number;
}
/**
 * Read-only access to the `done` table's `timestamp` column in C:\db\conformita.db - one row
 * per file the service's Scripts.Approve marked approved, stamped with the approval moment
 * (unix seconds). Used for the "daily activity" dashboard pane.
 */
export declare class ActivitySql {
    private readonly db;
    constructor();
    /**
     * One entry per calendar day (local time), oldest first, for the trailing `days` days
     * including today. Zero-filled for days with no approvals, so a quiet day shows as a gap
     * rather than compressing the timeline.
     */
    getDailyCounts(days: number): DailyCount[];
    close(): void;
}
//# sourceMappingURL=activity.d.ts.map