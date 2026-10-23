"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueSql = void 0;
const node_sqlite_1 = require("node:sqlite");
const DB_PATH = "C:\\db\\conformita.db";
/**
 * Read/write access to the `queue` table in the shared PDM service SQLite DB
 * (C:\db\conformita.db, see service/Interfaces/SQL.cs). Mirrors the `queue` model
 * in service/DB/queue.cs.
 */
class QueueSql {
    db;
    constructor() {
        this.db = new node_sqlite_1.DatabaseSync(DB_PATH);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT,
                path TEXT
            )
        `);
    }
    /** Takes up to `limit` jobs off the front of the queue (oldest first), without removing them. */
    take(limit) {
        const rows = this.db
            .prepare("SELECT id, code, path FROM queue ORDER BY id ASC LIMIT ?")
            .all(limit);
        return rows.map((row) => ({ id: row.id, code: row.code, path: row.path }));
    }
    /** Lists every job currently in the queue (oldest first). */
    all() {
        const rows = this.db
            .prepare("SELECT id, code, path FROM queue ORDER BY id ASC")
            .all();
        return rows.map((row) => ({ id: row.id, code: row.code, path: row.path }));
    }
    /** Adds a job to the back of the queue. */
    add(code, path) {
        this.db.prepare("INSERT INTO queue (code, path) VALUES (?, ?)").run(code, path);
        const row = this.db
            .prepare("SELECT id, code, path FROM queue WHERE id = last_insert_rowid()")
            .get();
        return { id: row.id, code: row.code, path: row.path };
    }
    /**
     * Adds many jobs in a single transaction (one commit/fsync total instead of one per row).
     * "Add family" can queue thousands of files at once; inserting them with separate `add()`
     * calls each commits individually, which is what made it feel like it hangs.
     */
    addMany(jobs) {
        const insert = this.db.prepare("INSERT INTO queue (code, path) VALUES (?, ?)");
        const selectLast = this.db.prepare("SELECT id, code, path FROM queue WHERE id = last_insert_rowid()");
        const results = [];
        this.db.exec("BEGIN");
        try {
            for (const job of jobs) {
                insert.run(job.code, job.path);
                const row = selectLast.get();
                results.push({ id: row.id, code: row.code, path: row.path });
            }
            this.db.exec("COMMIT");
        }
        catch (err) {
            this.db.exec("ROLLBACK");
            throw err;
        }
        return results;
    }
    /** Removes a job from the queue once it has been successfully processed. */
    remove(id) {
        this.db.prepare("DELETE FROM queue WHERE id = ?").run(id);
    }
    close() {
        this.db.close();
    }
}
exports.QueueSql = QueueSql;
//# sourceMappingURL=queue.js.map