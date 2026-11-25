"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DistintaSql = void 0;
const node_sqlite_1 = require("node:sqlite");
const DB_PATH = "C:\\db\\distinta.db";
/**
 * Read/write access to conformita's own distinta tracking DB (C:\db\distinta.db) - separate from
 * the shared C:\db\conformita.db, which the .NET PDM service also writes to. Holds:
 *   - `last_run`: a single row recording when the PDM checkins sync last ran, so each sync only
 *     has to ask PDM for what's been checked in since then instead of re-scanning everything.
 *   - `queue`: one row per checked-in file the sync has seen, append-only - the Distinta page
 *     reads this table directly instead of re-querying PDM on every page load.
 */
class DistintaSql {
    db;
    constructor() {
        this.db = new node_sqlite_1.DatabaseSync(DB_PATH, { timeout: 5000 });
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file TEXT NOT NULL,
                path TEXT
            )
        `);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS last_run (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                ran_at TEXT NOT NULL
            )
        `);
        // Added after the table above already existed in deployed DBs - CREATE TABLE IF NOT
        // EXISTS won't retrofit it, so add it by hand when missing. Rows queued before this
        // migration keep checked_in_at = NULL (see "Today"/"This week" filtering on the frontend).
        const hasCheckedInAt = this.db.prepare("PRAGMA table_info(queue)").all().some((col) => col.name === "checked_in_at");
        if (!hasCheckedInAt) {
            this.db.exec("ALTER TABLE queue ADD COLUMN checked_in_at TEXT");
        }
    }
    /** The last time the sync ran, or null if it has never run before. */
    getLastRun() {
        const row = this.db.prepare("SELECT ran_at FROM last_run WHERE id = 1").get();
        return row ? new Date(row.ran_at) : null;
    }
    /** Records `when` as the new last-run time - there's only ever the one row. */
    setLastRun(when) {
        this.db
            .prepare(`INSERT INTO last_run (id, ran_at) VALUES (1, ?)
                 ON CONFLICT(id) DO UPDATE SET ran_at = excluded.ran_at`)
            .run(when.toISOString());
    }
    /** Appends one row per file to the queue, in a single transaction. */
    enqueue(files) {
        if (files.length === 0) {
            return;
        }
        const insert = this.db.prepare("INSERT INTO queue (file, path, checked_in_at) VALUES (?, ?, ?)");
        this.db.exec("BEGIN");
        try {
            for (const f of files) {
                insert.run(f.file, f.path, f.checkedInAt);
            }
            this.db.exec("COMMIT");
        }
        catch (err) {
            this.db.exec("ROLLBACK");
            throw err;
        }
    }
    /** Every file the sync has ever queued, oldest first. */
    all() {
        const rows = this.db
            .prepare("SELECT id, file, path, checked_in_at FROM queue ORDER BY id ASC")
            .all();
        return rows.map((row) => ({ id: row.id, file: row.file, path: row.path, checkedInAt: row.checked_in_at }));
    }
    close() {
        this.db.close();
    }
}
exports.DistintaSql = DistintaSql;
//# sourceMappingURL=distinta_sql.js.map