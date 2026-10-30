export interface ProjectRange {
    min: number;
    max: number;
}
/** One row per todo/done part, with everything the frontend needs to filter locally. */
export interface PartRecord {
    code: string;
    /** Distinct HV project numbers this part is linked to (from code_project). */
    projects: number[];
    /** Distinct active error codes from `todo` (empty for a part that's only in `done`). */
    errors: number[];
    todo: boolean;
    done: boolean;
}
export interface ErrorLabel {
    code: number;
    label: string;
    /** Severity weight from the Errors catalog - null when the error hasn't been rated yet. */
    weight: number | null;
}
export interface PartsDataset {
    parts: PartRecord[];
    errorLabels: ErrorLabel[];
}
/**
 * Read-only access to the `todo`/`done` per-(part, error) tables (filled by the data_raw import
 * and, for `done`, by the service's Scripts.Approve), the `Errors` catalog, and the
 * `code_project`/`part_usage` tables built by scripts/syncProjects.ts - all merged into
 * C:\db\conformita.db (previously journey.db, now retired).
 */
export declare class JourneySql {
    private readonly db;
    constructor();
    /**
     * Everything the frontend needs to compute the pie/bar charts for *any* HV range and
     * occurrence filter without going back to the server - see frontend/src/pages/PartsView.tsx.
     * Every todo/done code is included, even ones with no code_project link at all - those just
     * come back with an empty `projects` array (previously they were dropped here entirely, which
     * silently hid most of todo/done from the dashboard rather than just from the HV-range filter).
     * `projectRows` is still scoped with EXISTS rather than a JOIN so SQLite drives the scan from
     * the small todo/done tables instead of the 1M+ row code_project table.
     */
    getFullDataset(): PartsDataset;
    /**
     * The real span of HV project numbers currently known (from code_project), so the frontend
     * can size its slider correctly instead of guessing. proj_num = 0 is a rare parsing artifact
     * from malformed ERP item codes (see scripts/syncProjects.ts), not a real project, so it's
     * excluded from the bounds.
     */
    getProjectRange(): ProjectRange;
    close(): void;
}
//# sourceMappingURL=journey_sql.d.ts.map