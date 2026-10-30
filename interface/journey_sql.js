"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JourneySql = void 0;
const node_sqlite_1 = require("node:sqlite");
const DB_PATH = "C:\\db\\conformita.db";
/**
 * Read-only access to the `todo`/`done` per-(part, error) tables (filled by the data_raw import
 * and, for `done`, by the service's Scripts.Approve), the `Errors` catalog, and the
 * `code_project`/`part_usage` tables built by scripts/syncProjects.ts - all merged into
 * C:\db\conformita.db (previously journey.db, now retired).
 */
class JourneySql {
    db;
    constructor() {
        this.db = new node_sqlite_1.DatabaseSync(DB_PATH, { readOnly: true });
    }
    /**
     * Everything the frontend needs to compute the pie/bar charts for *any* HV range and
     * occurrence filter without going back to the server - see frontend/src/pages/PartsView.tsx.
     * Every todo/done code is included, even ones with no code_project link at all - those just
     * come back with an empty `projects` array (previously they were dropped here entirely, which
     * silently hid most of todo/done from the dashboard rather than just from the HV-range filter).
     * `projectRows` is still scoped with EXISTS rather than a JOIN so SQLite drives the scan from
     * the small todo/done tables instead of the 1M+ row code_project table.
     */
    getFullDataset() {
        const projectRows = this.db
            .prepare(`SELECT cp.code AS code, cp.proj_num AS projNum
                 FROM code_project cp
                 WHERE EXISTS (SELECT 1 FROM todo t WHERE t.code = cp.code)
                    OR EXISTS (SELECT 1 FROM done d WHERE d.code = cp.code)`)
            .all();
        const todoRows = this.db.prepare(`SELECT code, error FROM todo`).all();
        const doneRows = this.db.prepare(`SELECT DISTINCT code FROM done`).all();
        const errorLabelRows = this.db
            .prepare("SELECT code, description, weight FROM Errors")
            .all();
        const byCode = new Map();
        const record = (code) => {
            let rec = byCode.get(code);
            if (!rec) {
                rec = { code, projects: [], errors: [], todo: false, done: false };
                byCode.set(code, rec);
            }
            return rec;
        };
        for (const row of projectRows) {
            record(row.code).projects.push(row.projNum);
        }
        for (const row of todoRows) {
            const rec = record(row.code);
            rec.todo = true;
            if (row.error !== null) {
                rec.errors.push(row.error);
            }
        }
        for (const row of doneRows) {
            record(row.code).done = true;
        }
        return {
            parts: [...byCode.values()],
            errorLabels: errorLabelRows.map((row) => ({
                code: row.code,
                label: row.description ?? `Error ${row.code}`,
                weight: row.weight,
            })),
        };
    }
    /**
     * The real span of HV project numbers currently known (from code_project), so the frontend
     * can size its slider correctly instead of guessing. proj_num = 0 is a rare parsing artifact
     * from malformed ERP item codes (see scripts/syncProjects.ts), not a real project, so it's
     * excluded from the bounds.
     */
    getProjectRange() {
        const row = this.db
            .prepare("SELECT MIN(proj_num) AS lo, MAX(proj_num) AS hi FROM code_project WHERE proj_num > 0")
            .get();
        return { min: row.lo ?? 0, max: row.hi ?? 0 };
    }
    close() {
        this.db.close();
    }
}
exports.JourneySql = JourneySql;
//# sourceMappingURL=journey_sql.js.map