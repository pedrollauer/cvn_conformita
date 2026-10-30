"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PACK = void 0;
exports.run = run;
const node_child_process_1 = require("node:child_process");
const node_path_1 = __importDefault(require("node:path"));
const node_readline_1 = __importDefault(require("node:readline"));
const runState_1 = require("../runState");
exports.MAX_PACK = 50;
// The CLI replaces the old HTTP service (port 5000) - see service/Program.cs. One invocation is
// one whole batch: it drains the queue itself, runs Scripts.Update per file (falling back to
// not-yet-approved update_flow rows if the queue is empty, same as this file used to do), then
// one Scripts.Approve pass, exactly mirroring what this file's old fetch-based loop did - just
// now orchestrated in C# so SOLIDWORKS/PDM stay warm for the whole batch instead of restarting
// per request. Defaults to the Debug build output; override for a Release build or a different
// checkout layout.
const DEFAULT_CLI_PATH = node_path_1.default.join(__dirname, "..", "service", "bin", "Debug", "net10.0-windows", "PdmThumbnailService.exe");
const CLI_PATH = process.env.PDM_CLI_PATH ?? DEFAULT_CLI_PATH;
function isFileStatusLine(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.code === "string" &&
        typeof value.path === "string" &&
        value.status !== undefined);
}
/**
 * Spawns the CLI for one batch and waits for it to exit. stdout is newline-delimited - most
 * lines are plain log text (forwarded to console.log as-is), but per-file lines are JSON (see
 * service/Program.cs's ProcessFile): a "start" line before each file so setCurrentFile reflects
 * what's actually running right now (Conform() can take a while), and an "ok"/"error" result
 * line after. Resolves with the exit code; rejects only if the process itself fails to spawn.
 */
function runCli(maxPack) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(CLI_PATH, [String(maxPack)], { stdio: ["ignore", "pipe", "pipe"] });
        const stdout = node_readline_1.default.createInterface({ input: child.stdout });
        stdout.on("line", (line) => {
            let parsed;
            try {
                parsed = JSON.parse(line);
            }
            catch {
                console.log(`script1: ${line}`);
                return;
            }
            if (!isFileStatusLine(parsed)) {
                console.log(`script1: ${line}`);
                return;
            }
            if (parsed.status === "start") {
                (0, runState_1.setCurrentFile)({ code: parsed.code, path: parsed.path });
            }
            else {
                console.log(`script1: [${parsed.code}] ${parsed.status}`);
                (0, runState_1.setCurrentFile)(null);
            }
        });
        const stderr = node_readline_1.default.createInterface({ input: child.stderr });
        stderr.on("line", (line) => console.error(`script1 (cli stderr): ${line}`));
        child.on("error", (err) => {
            (0, runState_1.setCurrentFile)(null);
            reject(err);
        });
        child.on("close", (code) => {
            (0, runState_1.setCurrentFile)(null);
            resolve(code ?? 1);
        });
    });
}
/**
 * Script 1: runs one batch via the CLI (see runCli above). Defaults to MAX_PACK, but callers
 * (e.g. the idle-server scheduler) can pass a smaller pack size. A non-zero exit means the CLI
 * hit a hard failure (SOLIDWORKS/PDM never initialized, or an unhandled exception) - individual
 * file failures within a batch don't fail the run, they're just reported per-file and left
 * queued for retry on the C# side.
 */
async function run(maxPack = exports.MAX_PACK) {
    console.log(`script1: starting batch (maxPack=${maxPack})`);
    const exitCode = await runCli(maxPack);
    if (exitCode !== 0) {
        throw new Error(`PdmThumbnailService CLI exited with code ${exitCode}`);
    }
    console.log("script1: done");
}
if (require.main === module) {
    run().catch((err) => {
        console.error("script1 failed:", err);
        process.exitCode = 1;
    });
}
//# sourceMappingURL=script1.js.map