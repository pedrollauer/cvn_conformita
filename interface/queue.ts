import { DatabaseSync } from "node:sqlite";

const DB_PATH = "C:\\db\\conformita.db";

export interface QueueJob {
    id: number;
    code: string;
    path: string;
}

interface QueueRow {
    id: number;
    code: string;
    path: string;
}

/**
 * Read/write access to the `queue` table in the shared PDM service SQLite DB
 * (C:\db\conformita.db, see service/Interfaces/SQL.cs). Mirrors the `queue` model
 * in service/DB/queue.cs.
 */
export class QueueSql {
    private readonly db: DatabaseSync;

    constructor() {
        this.db = new DatabaseSync(DB_PATH);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT,
                path TEXT
            )
        `);
    }

    /** Takes up to `limit` jobs off the front of the queue (oldest first), without removing them. */
    take(limit: number): QueueJob[] {
        const rows = this.db
            .prepare("SELECT id, code, path FROM queue ORDER BY id ASC LIMIT ?")
            .all(limit) as unknown as QueueRow[];
        return rows.map((row) => ({ id: row.id, code: row.code, path: row.path }));
    }

    /** Lists every job currently in the queue (oldest first). */
    all(): QueueJob[] {
        const rows = this.db
            .prepare("SELECT id, code, path FROM queue ORDER BY id ASC")
            .all() as unknown as QueueRow[];
        return rows.map((row) => ({ id: row.id, code: row.code, path: row.path }));
    }

    /** True if `code`+`path` already has a row in the queue, regardless of how many. Used by the
     * /api/queue add-flows to skip re-queuing something that's already waiting to be processed. */
    has(code: string, path: string): boolean {
        const row = this.db.prepare("SELECT 1 FROM queue WHERE code = ? AND path = ? LIMIT 1").get(code, path);
        return row !== undefined;
    }

    /** Adds a job to the back of the queue. */
    add(code: string, path: string): QueueJob {
        this.db.prepare("INSERT INTO queue (code, path) VALUES (?, ?)").run(code, path);
        const row = this.db
            .prepare("SELECT id, code, path FROM queue WHERE id = last_insert_rowid()")
            .get() as unknown as QueueRow;
        return { id: row.id, code: row.code, path: row.path };
    }

    /**
     * Adds many jobs in a single transaction (one commit/fsync total instead of one per row).
     * "Add family" can queue thousands of files at once; inserting them with separate `add()`
     * calls each commits individually, which is what made it feel like it hangs.
     */
    addMany(jobs: Array<{ code: string; path: string }>): QueueJob[] {
        const insert = this.db.prepare("INSERT INTO queue (code, path) VALUES (?, ?)");
        const selectLast = this.db.prepare("SELECT id, code, path FROM queue WHERE id = last_insert_rowid()");
        const results: QueueJob[] = [];
        this.db.exec("BEGIN");
        try {
            for (const job of jobs) {
                insert.run(job.code, job.path);
                const row = selectLast.get() as unknown as QueueRow;
                results.push({ id: row.id, code: row.code, path: row.path });
            }
            this.db.exec("COMMIT");
        } catch (err) {
            this.db.exec("ROLLBACK");
            throw err;
        }
        return results;
    }

    /** Removes a job from the queue once it has been successfully processed. */
    remove(id: number): void {
        this.db.prepare("DELETE FROM queue WHERE id = ?").run(id);
    }

    close(): void {
        this.db.close();
    }
}
