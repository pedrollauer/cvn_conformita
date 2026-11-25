import { ErpSql } from "./erp_sql";
export interface LnBomLine {
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
export declare function getLnBom(erp: ErpSql, code: string): Promise<LnBomLine[]>;
//# sourceMappingURL=erp_bom.d.ts.map