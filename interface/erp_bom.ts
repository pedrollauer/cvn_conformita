import { ErpSql } from "./erp_sql";

export interface LnBomLine {
    code: string;
    quantity: number;
}

interface LnBomRow {
    code: string;
    quantity: number;
}

/**
 * Flat (leaf-level) BOM for a single ERP item code - ported from distinta.sql, which hardcoded
 * the item in a @Lista list (@SelectionOption = 1, single-item case only). Same recursive
 * explosion as scripts/syncProjects.ts's fetchLeafProjectPairs, scoped to one code and returning
 * (code, summed quantity) instead of (code, project number).
 *
 * Written as one SELECT ... WITH batch (no temp tables/INSERT/DROP, unlike distinta.sql) so it
 * stays inside ErpSql.query's read-only statement check.
 */
export async function getLnBom(erp: ErpSql, code: string): Promise<LnBomLine[]> {
    return erp.query<LnBomRow>(
        `SET NOCOUNT ON;
        DECLARE @MaxLevel INT = 7;
        DECLARE @DataRef DATETIME = DATEADD(DAY, -1, GETDATE());

        WITH Seed AS (
            SELECT DISTINCT i.t_item AS t_mitm
            FROM [erpdb].[dbo].[ttcibd001100] AS i
            WHERE i.t_item IN (@code, SPACE(9) + @code)
        ),
        RecursiveBOM AS (
            SELECT
                CAST(b.t_mitm AS VARCHAR(100)) AS Lv0_mitm,
                b.t_sitm AS t_sitm,
                CAST(CASE LEFT(LTRIM(b.t_sitm),1)
                        WHEN '0' THEN STUFF(LTRIM(b.t_sitm),1,1,'')
                        WHEN 'H' THEN SUBSTRING(LTRIM(b.t_sitm),10,100)
                        ELSE LTRIM(b.t_sitm) END AS VARCHAR(50)) AS sitm_clean,
                b.t_qana AS t_qtot,
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
                b.t_qana * p.t_qtot,
                d.t_kitm,
                p.t_hielv + 1
            FROM RecursiveBOM AS p
            INNER JOIN [erpdb].[dbo].[ttibom010100] AS b ON b.t_mitm = p.t_sitm
            INNER JOIN [erpdb].[dbo].[ttcibd001100] AS d ON d.t_item = b.t_sitm
            WHERE p.t_hielv < @MaxLevel
              AND b.t_exdt > @DataRef
              AND p.kitm_num = 2
        ),
        Leaves AS (
            -- Same "IsFolha" rule as distinta.sql: a "Pro" (sub-assembly) row that still had
            -- children below @MaxLevel was exploded further, so it isn't itself a final BOM line.
            SELECT
                r.sitm_clean,
                r.t_qtot,
                CAST(CASE WHEN r.kitm_num = 2 AND r.t_hielv < @MaxLevel AND EXISTS (
                        SELECT 1
                        FROM [erpdb].[dbo].[ttibom010100] AS x
                        INNER JOIN [erpdb].[dbo].[ttcibd001100] AS xd ON xd.t_item = x.t_sitm
                        WHERE x.t_mitm = r.t_sitm AND x.t_exdt > @DataRef
                    ) THEN 0 ELSE 1 END AS BIT) AS IsFolha
            FROM RecursiveBOM AS r
        )
        SELECT
            LTRIM(RTRIM(sitm_clean)) AS code,
            SUM(t_qtot) AS quantity
        FROM Leaves
        WHERE IsFolha = 1
        GROUP BY sitm_clean
        ORDER BY code
        OPTION (MAXRECURSION 50);`,
        { code },
    );
}
