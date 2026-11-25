"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPdmBom = getPdmBom;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const SERVICE_DIR = node_path_1.default.join(__dirname, "..", "service");
const DEFAULT_EXE = node_path_1.default.join(SERVICE_DIR, "bin", "Debug", "net10.0-windows", "PdmThumbnailService.exe");
/**
 * Runs `PdmThumbnailService.exe distinta <code>` (service/Program.cs's RunDistinta - prints the
 * SOLIDWORKS PDM "BOM" layout's computed, as-built BOM to stdout between "BOM START"/"BOM END"
 * markers) and parses it into (code, summed quantity) lines. Requires SOLIDWORKS + PDM to be
 * installed/licensed on this machine, same as the rest of service/.
 */
function getPdmBom(code) {
    const exe = process.env.PDM_SERVICE_EXE ?? DEFAULT_EXE;
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(exe, ["distinta", code], { cwd: SERVICE_DIR });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (exitCode) => {
            if (exitCode !== 0) {
                reject(new Error(`PdmThumbnailService.exe distinta ${code} exited with code ${exitCode}: ${stderr || stdout}`));
                return;
            }
            try {
                resolve(parseBomOutput(stdout, code));
            }
            catch (err) {
                reject(err);
            }
        });
    });
}
function parseBomOutput(output, code) {
    const startIdx = output.indexOf("BOM START");
    const endIdx = output.indexOf("BOM END");
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
        throw new Error(`Unexpected PDM BOM output for ${code}:\n${output}`);
    }
    const lines = output.slice(startIdx, endIdx).split(/\r?\n/).slice(1);
    const sums = new Map();
    let sawFirstRow = false;
    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) {
            continue;
        }
        // Quantity is always the last token; everything before it is the code - usually one
        // token ("290074216187"), but PDM numbers empty/unlinked BOM slots as two ("VUOTO 1",
        // "VUOTO 2", ...) to tell them apart, so the code can't be assumed to be a single token.
        const rawQty = parts[parts.length - 1];
        const rawCode = parts.slice(0, -1).join(" ");
        const qty = Number(rawQty);
        if (Number.isNaN(qty)) {
            continue;
        }
        // PDM's BOM always lists the queried assembly itself as its first row (quantity 1) -
        // distinta.sql's LN side never includes the top-level item among its own components, so
        // drop it here to compare like for like.
        if (!sawFirstRow) {
            sawFirstRow = true;
            if (rawCode.toUpperCase() === code.toUpperCase()) {
                continue;
            }
        }
        // "VUOTO" = an empty/unlinked BOM row in PDM (a BOM position with no item assigned) -
        // kept rather than dropped: it's exactly the kind of PDM-only line the compare table
        // should flag red, since LN can never have a "VUOTO" code of its own.
        sums.set(rawCode, (sums.get(rawCode) ?? 0) + qty);
    }
    return [...sums].map(([bomCode, quantity]) => ({ code: bomCode, quantity }));
}
//# sourceMappingURL=pdmBomCli.js.map