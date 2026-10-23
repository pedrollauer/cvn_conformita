"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivitySql = void 0;
const node_sqlite_1 = require("node:sqlite");
const DB_PATH = "C:\\db\\conformita.db";
function toLocalDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
/**
 * Read-only access to the `done` table's `timestamp` column in C:\db\conformita.db - one row
 * per file the service's Scripts.Approve marked approved, stamped with the approval moment
 * (unix seconds). Used for the "daily activity" dashboard pane.
 */
class ActivitySql {
    db;
    constructor() {
        this.db = new node_sqlite_1.DatabaseSync(DB_PATH, { readOnly: true });
    }
    /**
     * One entry per calendar day (local time), oldest first, for the trailing `days` days
     * including today. Zero-filled for days with no approvals, so a quiet day shows as a gap
     * rather than compressing the timeline.
     */
    getDailyCounts(days) {
        const rows = this.db
            .prepare(`SELECT date(timestamp, 'unixepoch', 'localtime') AS date, COUNT(*) AS count
                 FROM done
                 WHERE timestamp IS NOT NULL
                 GROUP BY date`)
            .all();
        const byDate = new Map(rows.map((row) => [row.date, row.count]));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(today.getDate() - i);
            const key = toLocalDateKey(day);
            result.push({ date: key, count: byDate.get(key) ?? 0 });
        }
        return result;
    }
    close() {
        this.db.close();
    }
}
exports.ActivitySql = ActivitySql;
//# sourceMappingURL=activity.js.map