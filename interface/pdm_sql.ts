import sql from "mssql";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Which PDM vault to read from, matching service/Interfaces/PDM.cs's "IT"/"BR" vault selection. */
export type PdmVault = "IT" | "BR";

const VAULT_DATABASES: Record<PdmVault, string> = {
    IT: "_CavannaPDM",
    BR: "_CavannaPDM_BR",
};

export interface PdmSqlConfig {
    server: string;
    user: string;
    password: string;
    vault: PdmVault;
}

/** Reads the plaintext `account` / `pw` / `server` lines out of credentials/creds. */
function loadCredsFile(): { account: string; pw: string; server: string } {
    const path = join(__dirname, "..", "credentials", "creds");
    const text = readFileSync(path, "utf8");
    let account: string | undefined;
    let pw: string | undefined;
    let server: string | undefined;
    for (const rawLine of text.split(/\r?\n/)) {
        const match = /^(account|pw|server):\s*"(.*)"\s*$/.exec(rawLine.trim());
        if (!match) {
            continue;
        }
        const key = match[1]!;
        const value = match[2]!;
        if (key === "account") account = value;
        else if (key === "pw") pw = value;
        else if (key === "server") server = value;
    }
    if (!account || !pw || !server) {
        throw new Error(`Could not parse account/pw/server from ${path}`);
    }
    return { account, pw, server };
}

/** Resolves connection settings from env vars (PDM_SQL_*), falling back to credentials/creds. */
function resolveConfig(overrides: Partial<PdmSqlConfig>): PdmSqlConfig {
    const vault = overrides.vault ?? "IT";
    const server = overrides.server ?? process.env.PDM_SQL_SERVER;
    const user = overrides.user ?? process.env.PDM_SQL_USER;
    const password = overrides.password ?? process.env.PDM_SQL_PASSWORD;
    if (server && user && password) {
        return { server, user, password, vault };
    }
    const creds = loadCredsFile();
    return {
        server: server ?? creds.server,
        user: user ?? creds.account,
        password: password ?? creds.pw,
        vault,
    };
}

export interface RunningTask {
    taskInstanceId: number;
    taskId: number;
    taskName: string;
    taskStatus: number;
    attempt: number;
    startTime: Date | null;
    docString: string | null;
    host: string | null;
    initiatedBy: string | null;
}

interface RunningTaskRow {
    TaskInstanceID: number;
    TaskID: number;
    TaskName: string;
    TaskStatus: number;
    Attempt: number;
    StartTime: Date | null;
    DocString: string | null;
    HostName: string | null;
    Username: string | null;
}

export interface VaultFile {
    documentId: number;
    filename: string;
    /** Full local path, e.g. "C:\_CavannaPDM\CAD\PARTI\73 - PARTI SEMPLICI\11 - CARTER E PROTEZIONI\731110143578.SLDPRT". */
    path: string;
}

interface VaultFileRow {
    DocumentID: number;
    Filename: string;
    FolderPath: string;
}

/** Converts a glob-style pattern ("22*", "22?3") into a SQL LIKE pattern, escaping any literal %, _, or \ first. */
function globToSqlLike(pattern: string): string {
    const escaped = pattern.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    return escaped.replace(/\*/g, "%").replace(/\?/g, "_");
}

/**
 * Read-only connector to the SOLIDWORKS PDM vault database.
 *
 * Only SELECT/WITH queries are allowed — this is intentionally read-only,
 * mirroring the "pdm.reader" account in credentials/creds.
 */
export class PdmSql {
    private readonly config: PdmSqlConfig;
    private pool: sql.ConnectionPool | null = null;

    constructor(overrides: Partial<PdmSqlConfig> = {}) {
        this.config = resolveConfig(overrides);
    }

    private async getPool(): Promise<sql.ConnectionPool> {
        if (this.pool) {
            return this.pool;
        }
        const pool = new sql.ConnectionPool({
            server: this.config.server,
            user: this.config.user,
            password: this.config.password,
            database: VAULT_DATABASES[this.config.vault],
            // mssql's default requestTimeout is 15s, which "Add family"'s pattern scan over the
            // whole \CAD\ tree can legitimately exceed on a large vault - without this it fails
            // with an ETIMEOUT instead of just taking a while.
            requestTimeout: 60_000,
            connectionTimeout: 30_000,
            options: {
                encrypt: true,
                trustServerCertificate: true,
            },
        });
        this.pool = await pool.connect();
        return this.pool;
    }

    async connect(): Promise<void> {
        await this.getPool();
    }

    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
        }
    }

    /** Runs a read-only (SELECT/WITH) parameterized query and returns the recordset. */
    async query<T>(queryText: string, params: Record<string, unknown> = {}): Promise<T[]> {
        if (!/^\s*(select|with)\b/i.test(queryText)) {
            throw new Error("PdmSql is read-only: only SELECT/WITH queries are allowed.");
        }
        const pool = await this.getPool();
        const request = pool.request();
        for (const [name, value] of Object.entries(params)) {
            request.input(name, value);
        }
        const result = await request.query<T>(queryText);
        return result.recordset;
    }

    /**
     * Tasks from the Operations tab queue that haven't finished yet (queued or actively running).
     * A TaskInstances row with EndTime IS NULL means the task hasn't completed, regardless of
     * whether it's still waiting for a host or already executing. TaskInstanceID 1 is a permanent
     * placeholder row (TaskID/HostID/StartTime all NULL) that always has EndTime IS NULL, so rows
     * with no TaskID are excluded to avoid treating it as a stuck task.
     */
    async getRunningTasks(): Promise<RunningTask[]> {
        const rows = await this.query<RunningTaskRow>(`
            SELECT
                ti.TaskInstanceID,
                ti.TaskID,
                t.TaskName,
                ti.TaskStatus,
                ti.Attempt,
                ti.StartTime,
                ti.DocString,
                h.HostName,
                u.Username
            FROM TaskInstances ti
            JOIN Tasks t ON t.TaskID = ti.TaskID
            LEFT JOIN Hosts h ON h.HostID = ti.HostID
            LEFT JOIN Users u ON u.UserID = ti.InitUserID
            WHERE ti.EndTime IS NULL AND ti.TaskID IS NOT NULL
            ORDER BY ti.TaskInstanceID DESC
        `);
        return rows.map((row) => ({
            taskInstanceId: row.TaskInstanceID,
            taskId: row.TaskID,
            taskName: row.TaskName,
            taskStatus: row.TaskStatus,
            attempt: row.Attempt,
            startTime: row.StartTime,
            docString: row.DocString,
            host: row.HostName,
            initiatedBy: row.Username,
        }));
    }

    /** True if any task is queued or running in the Operations tab queue. */
    async hasRunningTasks(): Promise<boolean> {
        const rows = await this.query<{ TaskInstanceID: number }>(
            "SELECT TOP 1 TaskInstanceID FROM TaskInstances WHERE EndTime IS NULL AND TaskID IS NOT NULL",
        );
        return rows.length > 0;
    }

    /**
     * Looks up a file by its exact filename (e.g. "731110143578.SLDPRT") and resolves its full
     * local path from Documents/DocumentsInProjects/Projects.Path - Projects.Path already stores
     * the vault-relative folder (e.g. "\CAD\PARTI\73 - PARTI SEMPLICI\11 - CARTER E PROTEZIONI\"),
     * so the local path is just the vault root + that + the filename. Validated against
     * data_raw/5.csv, which lists this exact file under this exact path.
     *
     * Returns null if the file doesn't exist, is deleted, or isn't linked into a (non-deleted)
     * folder.
     */
    async findFileByCode(code: string): Promise<VaultFile | null> {
        const rows = await this.query<VaultFileRow>(
            `SELECT TOP 1 d.DocumentID AS DocumentID, d.Filename AS Filename, p.Path AS FolderPath
             FROM Documents d
             JOIN DocumentsInProjects dp ON dp.DocumentID = d.DocumentID AND dp.Deleted = 0
             JOIN Projects p ON p.ProjectID = dp.ProjectID AND p.Deleted = 0
             WHERE d.Filename = @code AND d.Deleted = 0
             ORDER BY d.DocumentID`,
            { code },
        );
        const row = rows[0];
        if (!row) {
            return null;
        }
        const vaultRoot = `C:\\${VAULT_DATABASES[this.config.vault]}`;
        return {
            documentId: row.DocumentID,
            filename: row.Filename,
            path: `${vaultRoot}${row.FolderPath}${row.Filename}`,
        };
    }

    /**
     * Finds every file under the vault's \CAD\ folder whose filename matches `pattern` (glob
     * style, e.g. "22*") and whose current lifecycle status is "Approvato", in any workflow
     * (EPDM scopes statuses per workflow, so "Approvato" can be several different StatusIDs -
     * matched here by name, not by a single hardcoded id). Validated against the live vault:
     * "22*" returns exactly the 2340 approved files actually filed under \CAD\NORM-COMM\22 -...
     *
     * One row per matching file, deduplicated by DocumentID (a file shared into more than one
     * folder would otherwise appear once per folder link).
     */
    async findApprovedCadFiles(pattern: string): Promise<VaultFile[]> {
        const rows = await this.query<VaultFileRow>(
            `SELECT d.DocumentID AS DocumentID, d.Filename AS Filename, p.Path AS FolderPath
             FROM Documents d
             JOIN DocumentsInProjects dp ON dp.DocumentID = d.DocumentID AND dp.Deleted = 0
             JOIN Projects p ON p.ProjectID = dp.ProjectID AND p.Deleted = 0
             JOIN Status s ON s.StatusID = d.CurrentStatusID
             WHERE d.Filename LIKE @pattern ESCAPE '\\'
               AND p.Path LIKE '\\CAD\\%'
               AND s.Name = 'Approvato'
               AND d.Deleted = 0
             ORDER BY d.Filename`,
            { pattern: globToSqlLike(pattern) },
        );

        const vaultRoot = `C:\\${VAULT_DATABASES[this.config.vault]}`;
        const seen = new Set<number>();
        const files: VaultFile[] = [];
        for (const row of rows) {
            if (seen.has(row.DocumentID)) {
                continue;
            }
            seen.add(row.DocumentID);
            files.push({
                documentId: row.DocumentID,
                filename: row.Filename,
                path: `${vaultRoot}${row.FolderPath}${row.Filename}`,
            });
        }
        return files;
    }
}
