export interface PendingUpdateFlow {
    code: string;
    path: string;
}
/**
 * Read-only access to the `update_flow` table in the shared PDM service SQLite DB
 * (C:\db\conformita.db, see service/Interfaces/SQL.cs). Mirrors the `update_flow` model
 * in service/DB/update_flow.cs, which tracks each file's progress through the
 * review -> checkout -> update -> checkin -> approve state machine driven by the service's
 * Scripts.Update/Scripts.Approve.
 */
export declare class UpdateFlowSql {
    private readonly db;
    constructor();
    /**
     * Files the service has already started working (or finished working) but hasn't approved
     * yet, oldest first. The table is created and owned by the .NET service, not this app, so a
     * fresh DB without it yet just means "nothing pending" rather than an error.
     */
    notYetApproved(limit: number): PendingUpdateFlow[];
    close(): void;
}
//# sourceMappingURL=updateFlow.d.ts.map