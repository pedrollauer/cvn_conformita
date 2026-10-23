export interface ErpSqlConfig {
    server: string;
    database: string;
    user: string;
    password: string;
}
/**
 * Read-only connector to the ERP SQL Server database (`erpdb`, the Infor LN / Baan tables
 * queried by data_raw/script.sql - ttibom010100, ttipcs025100, tticpr007100, ...).
 *
 * Only SELECT/WITH queries are allowed, matching the "ERP_RO" read-only account in
 * credentials/erp_creds.
 */
export declare class ErpSql {
    private readonly config;
    private pool;
    constructor(overrides?: Partial<ErpSqlConfig>);
    private getPool;
    connect(): Promise<void>;
    close(): Promise<void>;
    /**
     * Runs a read-only query batch and returns the final recordset. Batches may include
     * SET NOCOUNT ON / DECLARE / WITH ... SELECT (needed for the recursive BOM queries in
     * scripts/syncProjects.ts); any data-modifying statement is rejected outright.
     */
    query<T>(queryText: string, params?: Record<string, unknown>): Promise<T[]>;
}
//# sourceMappingURL=erp_sql.d.ts.map