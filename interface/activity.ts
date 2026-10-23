import { DatabaseSync } from "node:sqlite";

const DB_PATH = "C:\\db\\conformita.db";

export interface DailyCount {
    date: string; // YYYY-MM-DD, local day
    count: number;
}

interface DoneDateRow {
    date: string;
    count: number;
}

function toLocalDateKey(d: Date): string {
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
export class ActivitySql {
    private readonly db: DatabaseSync;

    constructor() {
        this.db = new DatabaseSync(DB_PATH, { readOnly: true });
    }

    /**
     * One entry per calendar day (local time), oldest first, for the trailing `days` days
     * including today. Zero-filled for days with no approvals, so a quiet day shows as a gap
     * rather than compressing the timeline.
     */
    getDailyCounts(days: number): DailyCount[] {
        const rows = this.db
            .prepare(
                `SELECT date(timestamp, 'unixepoch', 'localtime') AS date, COUNT(*) AS count
                 FROM done
                 WHERE timestamp IS NOT NULL
                 GROUP BY date`,
            )
            .all() as unknown as DoneDateRow[];
        const byDate = new Map(rows.map((row) => [row.date, row.count]));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const result: DailyCount[] = [];
        for (let i = days - 1; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(today.getDate() - i);
            const key = toLocalDateKey(day);
            result.push({ date: key, count: byDate.get(key) ?? 0 });
        }
        return result;
    }

    close(): void {
        this.db.close();
    }
}
