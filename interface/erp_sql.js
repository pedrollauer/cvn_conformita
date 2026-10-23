"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErpSql = void 0;
const mssql_1 = __importDefault(require("mssql"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
/** Reads the `server` / `db` / `user` / `pass` lines out of credentials/erp_creds. */
function loadCredsFile() {
    const path = (0, node_path_1.join)(__dirname, "..", "credentials", "erp_creds");
    const text = (0, node_fs_1.readFileSync)(path, "utf8");
    let server;
    let db;
    let user;
    let pass;
    for (const rawLine of text.split(/\r?\n/)) {
        const match = /^(server|db|user|pass)\s*=\s*@?"(.*)"\s*$/.exec(rawLine.trim());
        if (!match) {
            continue;
        }
        const key = match[1];
        const value = match[2];
        if (key === "server")
            server = value;
        else if (key === "db")
            db = value;
        else if (key === "user")
            user = value;
        else if (key === "pass")
            pass = value;
    }
    if (!server || !db || !user || !pass) {
        throw new Error(`Could not parse server/db/user/pass from ${path}`);
    }
    return { server, db, user, pass };
}
/** Resolves connection settings from env vars (ERP_SQL_*), falling back to credentials/erp_creds. */
function resolveConfig(overrides) {
    const server = overrides.server ?? process.env.ERP_SQL_SERVER;
    const database = overrides.database ?? process.env.ERP_SQL_DATABASE;
    const user = overrides.user ?? process.env.ERP_SQL_USER;
    const password = overrides.password ?? process.env.ERP_SQL_PASSWORD;
    if (server && database && user && password) {
        return { server, database, user, password };
    }
    const creds = loadCredsFile();
    return {
        server: server ?? creds.server,
        database: database ?? creds.db,
        user: user ?? creds.user,
        password: password ?? creds.pass,
    };
}
/**
 * Read-only connector to the ERP SQL Server database (`erpdb`, the Infor LN / Baan tables
 * queried by data_raw/script.sql - ttibom010100, ttipcs025100, tticpr007100, ...).
 *
 * Only SELECT/WITH queries are allowed, matching the "ERP_RO" read-only account in
 * credentials/erp_creds.
 */
class ErpSql {
    config;
    pool = null;
    constructor(overrides = {}) {
        this.config = resolveConfig(overrides);
    }
    async getPool() {
        if (this.pool) {
            return this.pool;
        }
        // Named instances come as "HOST\INSTANCE" in erp_creds; mssql/tedious wants the
        // instance name split out separately rather than embedded in `server`.
        const [host, instanceName] = this.config.server.split("\\");
        const pool = new mssql_1.default.ConnectionPool({
            server: host,
            user: this.config.user,
            password: this.config.password,
            database: this.config.database,
            options: {
                encrypt: true,
                trustServerCertificate: true,
                ...(instanceName ? { instanceName } : {}),
            },
            // The recursive BOM explosion in scripts/syncProjects.ts legitimately takes 1-2 minutes.
            requestTimeout: 5 * 60 * 1000,
        });
        this.pool = await pool.connect();
        return this.pool;
    }
    async connect() {
        await this.getPool();
    }
    async close() {
        if (this.pool) {
            await this.pool.close();
            this.pool = null;
        }
    }
    /**
     * Runs a read-only query batch and returns the final recordset. Batches may include
     * SET NOCOUNT ON / DECLARE / WITH ... SELECT (needed for the recursive BOM queries in
     * scripts/syncProjects.ts); any data-modifying statement is rejected outright.
     */
    async query(queryText, params = {}) {
        if (/\b(insert|update|delete|drop|truncate|alter|merge|exec)\b/i.test(queryText)) {
            throw new Error("ErpSql is read-only: query must not contain data-modifying statements.");
        }
        const pool = await this.getPool();
        const request = pool.request();
        for (const [name, value] of Object.entries(params)) {
            request.input(name, value);
        }
        const result = await request.query(queryText);
        return result.recordset;
    }
}
exports.ErpSql = ErpSql;
//# sourceMappingURL=erp_sql.js.map