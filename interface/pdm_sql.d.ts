/** Which PDM vault to read from, matching service/Interfaces/PDM.cs's "IT"/"BR" vault selection. */
export type PdmVault = "IT" | "BR";
export interface PdmSqlConfig {
    server: string;
    user: string;
    password: string;
    vault: PdmVault;
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
export interface VaultFile {
    documentId: number;
    filename: string;
    /** Full local path, e.g. "C:\_CavannaPDM\CAD\PARTI\73 - PARTI SEMPLICI\11 - CARTER E PROTEZIONI\731110143578.SLDPRT". */
    path: string;
}
/**
 * Read-only connector to the SOLIDWORKS PDM vault database.
 *
 * Only SELECT/WITH queries are allowed — this is intentionally read-only,
 * mirroring the "pdm.reader" account in credentials/creds.
 */
export declare class PdmSql {
    private readonly config;
    private pool;
    constructor(overrides?: Partial<PdmSqlConfig>);
    private getPool;
    connect(): Promise<void>;
    close(): Promise<void>;
    /** Runs a read-only (SELECT/WITH) parameterized query and returns the recordset. */
    query<T>(queryText: string, params?: Record<string, unknown>): Promise<T[]>;
    /**
     * Tasks from the Operations tab queue that haven't finished yet (queued or actively running).
     * A TaskInstances row with EndTime IS NULL means the task hasn't completed, regardless of
     * whether it's still waiting for a host or already executing. TaskInstanceID 1 is a permanent
     * placeholder row (TaskID/HostID/StartTime all NULL) that always has EndTime IS NULL, so rows
     * with no TaskID are excluded to avoid treating it as a stuck task.
     */
    getRunningTasks(): Promise<RunningTask[]>;
    /** True if any task is queued or running in the Operations tab queue. */
    hasRunningTasks(): Promise<boolean>;
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
    findFileByCode(code: string): Promise<VaultFile | null>;
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
    findApprovedCadFiles(pattern: string): Promise<VaultFile[]>;
}
//# sourceMappingURL=pdm_sql.d.ts.map