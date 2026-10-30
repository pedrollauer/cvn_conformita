"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateFlowSql = void 0;
const node_sqlite_1 = require("node:sqlite");
const DB_PATH = "C:\\db\\conformita.db";
/**
 * Read-only access to the `update_flow` table in the shared PDM service SQLite DB
 * (C:\db\conformita.db, see service/Interfaces/SQL.cs). Mirrors the `update_flow` model
 * in service/DB/update_flow.cs, which tracks each file's progress through the
 * review -> checkout -> update -> checkin -> approve state machine driven by the service's
 * Scripts.Update/Scripts.Approve.
 */
class UpdateFlowSql {
    db;
    constructor() {
        this.db = new node_sqlite_1.DatabaseSync(DB_PATH, { readOnly: true });
    }
    /**
     * Files the service has already started working (or finished working) but hasn't approved
     * yet, oldest first. The table is created and owned by the .NET service, not this app, so a
     * fresh DB without it yet just means "nothing pending" rather than an error.
     */
    notYetApproved(limit) {
        try {
            const rows = this.db
                .prepare("SELECT code, path FROM update_flow WHERE approve = 0 ORDER BY date ASC LIMIT ?")
                .all(limit);
            return rows.map((row) => ({ code: row.code, path: row.path }));
        }
        catch (err) {
            console.error("[UpdateFlowSql] failed to read update_flow (table may not exist yet):", err);
            return [];
        }
    }
    /**
     * True if `code`+`path` has already run all the way through the service's
     * review -> checkout -> update -> checkin state machine AND been approved - i.e. queuing it
     * again would be a pure no-op (Scripts.Update's currentState is already 4, so its while loop
     * never executes any PDM/SOLIDWORKS step) with nothing left for Scripts.Approve to do either.
     * Used by the /api/queue add-flows to skip re-queuing files that have nothing left to do.
     */
    isFullyDone(code, path) {
        try {
            const row = this.db
                .prepare(`SELECT review, checkout, "update", checkin, approve
                     FROM update_flow
                     WHERE code = ? AND path = ?`)
                .get(code, path);
            if (!row) {
                return false;
            }
            return row.review === 1 && row.checkout === 1 && row.update === 1 && row.checkin === 1 && row.approve === 1;
        }
        catch (err) {
            console.error("[UpdateFlowSql] failed to check update_flow status (table may not exist yet):", err);
            return false;
        }
    }
    close() {
        this.db.close();
    }
}
exports.UpdateFlowSql = UpdateFlowSql;
//# sourceMappingURL=updateFlow.js.map