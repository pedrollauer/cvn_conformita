export interface PdmBomLine {
    code: string;
    quantity: number;
}
/**
 * Runs `PdmThumbnailService.exe distinta <code>` (service/Program.cs's RunDistinta - prints the
 * SOLIDWORKS PDM "BOM" layout's computed, as-built BOM to stdout between "BOM START"/"BOM END"
 * markers) and parses it into (code, summed quantity) lines. Requires SOLIDWORKS + PDM to be
 * installed/licensed on this machine, same as the rest of service/.
 */
export declare function getPdmBom(code: string): Promise<PdmBomLine[]>;
//# sourceMappingURL=pdmBomCli.d.ts.map