import { DatabaseSync } from "node:sqlite";

const DB_PATH = "C:\\db\\conformita.db";

export interface PendingUpdateFlow {
    code: string;
    path: string;
}

interface UpdateFlowRow {
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
export class UpdateFlowSql {
    private readonly db: DatabaseSync;

    constructor() {
        this.db = new DatabaseSync(DB_PATH, { readOnly: true });
    }

    /**
     * Files the service has already started working (or finished working) but hasn't approved
     * yet, oldest first. The table is created and owned by the .NET service, not this app, so a
     * fresh DB without it yet just means "nothing pending" rather than an error.
     */
    notYetApproved(limit: number): PendingUpdateFlow[] {
        try {
            const rows = this.db
                .prepare("SELECT code, path FROM update_flow WHERE approve = 0 ORDER BY date ASC LIMIT ?")
                .all(limit) as unknown as UpdateFlowRow[];
            return rows.map((row) => ({ code: row.code, path: row.path }));
        } catch (err) {
            console.error("[UpdateFlowSql] failed to read update_flow (table may not exist yet):", err);
            return [];
        }
    }

    close(): void {
        this.db.close();
    }
}
