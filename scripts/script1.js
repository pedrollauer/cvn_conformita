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
// The CLI replaces the old HTTP service (port 5000) - see service/Program.cs. It has two
// independent commands, "update" and "approve", each its own process invocation (so each can be
// run/tested on its own) - run() below calls them sequentially to match this file's old combined
// update-then-approve behavior. Defaults to the Debug build output; override for a Release build
// or a different checkout layout.
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
 * Spawns the CLI for one command ("update" or "approve") and waits for it to exit. stdout is
 * newline-delimited - most lines are plain log text (forwarded to console.log as-is), but
 * per-file lines are JSON (see service/Program.cs): "update" emits a "start" line before each
 * file so setCurrentFile reflects what's actually running right now (Conform() can take a
 * while), then an "ok"/"error" result line; "approve" only emits result lines (there's no
 * meaningful "start" moment for an approval). Resolves with the exit code; rejects only if the
 * process itself fails to spawn.
 */
function runCli(command, maxPack) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(CLI_PATH, [command, String(maxPack)], { stdio: ["ignore", "pipe", "pipe"] });
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
                console.log(`script1: [${command}] [${parsed.code}] ${parsed.status}`);
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
 * Script 1: runs "update" then "approve" via the CLI (see runCli above) - two separate process
 * invocations, same net effect as this file's old combined fetch-based loop. Defaults to
 * MAX_PACK, but callers (e.g. the idle-server scheduler) can pass a smaller pack size. A
 * non-zero exit from either command means a hard failure (SOLIDWORKS/PDM never initialized, or
 * an unhandled exception) - individual file failures don't fail the run, they're just reported
 * per-file and left for retry on the C# side. If "update" hard-fails, "approve" still runs -
 * there may be older files already sitting ready for approval independent of this update attempt.
 */
async function run(maxPack = exports.MAX_PACK) {
    console.log(`script1: starting update (maxPack=${maxPack})`);
    const updateExit = await runCli("update", maxPack);
    if (updateExit !== 0) {
        console.error(`script1: update exited with code ${updateExit}`);
    }
    console.log(`script1: starting approve (maxPack=${maxPack})`);
    const approveExit = await runCli("approve", maxPack);
    if (approveExit !== 0) {
        console.error(`script1: approve exited with code ${approveExit}`);
    }
    if (updateExit !== 0 || approveExit !== 0) {
        throw new Error(`PdmThumbnailService CLI failed (update=${updateExit}, approve=${approveExit})`);
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