"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
const node_sqlite_1 = require("node:sqlite");
const erp_sql_1 = require("../interface/erp_sql");
const DB_PATH = "C:\\db\\conformita.db";
/**
 * Explodes the BOM of every currently-active HV%% project down to its leaf items, the same
 * recursive walk as data_raw/script.sql's RecursiveBOM CTE, but without the per-family WHERE
 * filter or the Excel-style pivot - we just want every (leaf item, project number) pair.
 * Validated against data_raw/29-example.csv (exact match for code 290015110177 -> 19 projects).
 */
async function fetchLeafProjectPairs(erp) {
    return erp.query(`
        SET NOCOUNT ON;
        DECLARE @MaxLevel INT = 7;
        DECLARE @DataRef DATETIME = DATEADD(DAY, -1, GETDATE());

        WITH Seed AS (
            SELECT DISTINCT p.t_item AS t_mitm
            FROM [erpdb].[dbo].[ttipcs025100] AS p
            WHERE p.t_cprj >= 'HV00000' AND p.t_cprj < 'HW00000'
        ),
        RecursiveBOM AS (
            SELECT
                CAST(b.t_mitm AS VARCHAR(100)) AS Lv0_mitm,
                b.t_sitm AS t_sitm,
                CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                        WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                        WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                        ELSE LTRIM(b.t_sitm) END AS VARCHAR(50)) AS sitm_clean,
                d.t_kitm AS kitm_num,
                1 AS t_hielv
            FROM [erpdb].[dbo].[ttibom010100] AS b
            INNER JOIN Seed AS s ON s.t_mitm = b.t_mitm
            LEFT JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
            WHERE b.t_exdt > @DataRef

            UNION ALL

            SELECT
                p.Lv0_mitm,
                b.t_sitm,
                CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                        WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                        WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                        ELSE LTRIM(b.t_sitm) END AS VARCHAR(50)),
                d.t_kitm,
                p.t_hielv + 1
            FROM RecursiveBOM AS p
            INNER JOIN [erpdb].[dbo].[ttibom010100] AS b ON b.t_mitm = p.t_sitm
            INNER JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
            WHERE p.t_hielv < @MaxLevel
              AND b.t_exdt > @DataRef
              AND p.kitm_num = 2
        )
        SELECT DISTINCT
             LTRIM(RTRIM(r.sitm_clean))                  AS code,
             TRY_CAST(SUBSTRING(r.Lv0_mitm, 3, 5) AS INT) AS projNum
        FROM RecursiveBOM AS r
        INNER JOIN [erpdb].[dbo].[tticpr007100] AS k ON k.t_item = r.t_sitm
        OPTION (MAXRECURSION 50);
    `);
}
function stripExtension(code) {
    const idx = code.lastIndexOf(".");
    return idx === -1 ? code : code.slice(0, idx);
}
/**
 * Builds a lookup from normalized PDM file code -> set of project numbers it was found under.
 * Tries the code as-is first; if that misses, also tries with one leading zero stripped, matching
 * the leading-zero cleanup rule ERP applies to its own sitm_clean (see script.sql).
 */
function buildErpLookup(rows) {
    const byExact = new Map();
    for (const row of rows) {
        if (row.projNum === null)
            continue;
        const key = row.code.toUpperCase();
        let set = byExact.get(key);
        if (!set) {
            set = new Set();
            byExact.set(key, set);
        }
        set.add(row.projNum);
    }
    return byExact;
}
function lookupProjects(erpLookup, pdmCode) {
    const base = stripExtension(pdmCode).toUpperCase();
    const direct = erpLookup.get(base);
    if (direct)
        return direct;
    if (base.startsWith("0")) {
        return erpLookup.get(base.slice(1));
    }
    return undefined;
}
async function run() {
    const dryRun = process.argv.includes("--dry-run");
    const db = new node_sqlite_1.DatabaseSync(DB_PATH);
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS code_project (
                code TEXT,
                proj_num INTEGER
            )
        `);
        db.exec("CREATE INDEX IF NOT EXISTS idx_code_project_code ON code_project(code)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_code_project_projnum ON code_project(proj_num)");
        db.exec("DROP VIEW IF EXISTS part_usage"); // superseded by the real, indexed table below -
        // must drop before CREATE TABLE IF NOT EXISTS, which no-ops if a view already owns the name.
        db.exec(`
            CREATE TABLE IF NOT EXISTS part_usage (
                code TEXT PRIMARY KEY,
                use_count INTEGER
            )
        `);
        // todo/done aren't owned by this script, but the frontend API joins against them by
        // code on every request, so make sure the lookup stays indexed regardless of how/when
        // those tables were populated.
        db.exec("CREATE INDEX IF NOT EXISTS idx_todo_code ON todo(code)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_todo_error ON todo(error)");
        db.exec("CREATE INDEX IF NOT EXISTS idx_done_code ON done(code)");
        const codes = db
            .prepare("SELECT DISTINCT code FROM todo UNION SELECT DISTINCT code FROM done")
            .all();
        console.log(`syncProjects: ${codes.length} distinct code(s) across todo/done`);
        console.log("syncProjects: exploding BOM for all active HV%% projects (this can take ~2 minutes)...");
        const erp = new erp_sql_1.ErpSql();
        let leafRows;
        try {
            leafRows = await fetchLeafProjectPairs(erp);
        }
        finally {
            await erp.close();
        }
        console.log(`syncProjects: got ${leafRows.length} (leaf item, project) pairs from erpdb`);
        const erpLookup = buildErpLookup(leafRows);
        const links = [];
        let matchedCodes = 0;
        for (const { code } of codes) {
            const projects = lookupProjects(erpLookup, code);
            if (!projects || projects.size === 0)
                continue;
            matchedCodes++;
            for (const projNum of projects) {
                links.push({ code, projNum });
            }
        }
        console.log(`syncProjects: matched ${matchedCodes}/${codes.length} code(s) to a project, ${links.length} (code, project) link(s) total`);
        if (dryRun) {
            console.log("syncProjects: --dry-run, not writing to conformita.db");
            return;
        }
        db.exec("BEGIN");
        try {
            db.exec("DELETE FROM code_project");
            db.exec("DELETE FROM part_usage");
            const insertLink = db.prepare("INSERT INTO code_project (code, proj_num) VALUES (?, ?)");
            for (const link of links) {
                insertLink.run(link.code, link.projNum);
            }
            // part_usage.use_count = how many distinct projects a part was used in (one part,
            // many projects - see code_project). A real table, not a view, so looking it up from
            // the API doesn't re-aggregate 1M+ rows on every request.
            const insertUsage = db.prepare("INSERT INTO part_usage (code, use_count) VALUES (?, ?)");
            for (const { code } of codes) {
                const projects = lookupProjects(erpLookup, code);
                if (projects && projects.size > 0) {
                    insertUsage.run(code, projects.size);
                }
            }
            db.exec("COMMIT");
        }
        catch (err) {
            db.exec("ROLLBACK");
            throw err;
        }
        console.log(`syncProjects: wrote ${links.length} row(s) into code_project and ${matchedCodes} row(s) into part_usage`);
    }
    finally {
        db.close();
    }
}
if (require.main === module) {
    run().catch((err) => {
        console.error("syncProjects failed:", err);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=syncProjects.js.map