import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { setCurrentFile } from "../runState";

export const MAX_PACK = 50;

// The CLI replaces the old HTTP service (port 5000) - see service/Program.cs. It has two
// independent commands, "update" and "approve", each its own process invocation (so each can be
// run/tested on its own) - run() below calls them sequentially to match this file's old combined
// update-then-approve behavior. Defaults to the Debug build output; override for a Release build
// or a different checkout layout.
const DEFAULT_CLI_PATH = path.join(__dirname, "..", "service", "bin", "Debug", "net10.0-windows", "PdmThumbnailService.exe");
const CLI_PATH = process.env.PDM_CLI_PATH ?? DEFAULT_CLI_PATH;

type CliCommand = "update" | "approve";

interface FileStatusLine {
    code: string;
    path: string;
    status: "start" | "ok" | "error";
}

function isFileStatusLine(value: unknown): value is FileStatusLine {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as FileStatusLine).code === "string" &&
        typeof (value as FileStatusLine).path === "string" &&
        (value as FileStatusLine).status !== undefined
    );
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
function runCli(command: CliCommand, maxPack: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(CLI_PATH, [command, String(maxPack)], { stdio: ["ignore", "pipe", "pipe"] });

        const stdout = readline.createInterface({ input: child.stdout });
        stdout.on("line", (line) => {
            let parsed: unknown;
            try {
                parsed = JSON.parse(line);
            } catch {
                console.log(`script1: ${line}`);
                return;
            }

            if (!isFileStatusLine(parsed)) {
                console.log(`script1: ${line}`);
                return;
            }

            if (parsed.status === "start") {
                console.log(`script1: [${command}] [${parsed.code}] start`);
                setCurrentFile({ code: parsed.code, path: parsed.path });
            } else {
                console.log(`script1: [${command}] [${parsed.code}] ${parsed.status}`);
                setCurrentFile(null);
            }
        });

        const stderr = readline.createInterface({ input: child.stderr });
        stderr.on("line", (line) => console.error(`script1 (cli stderr): ${line}`));

        child.on("error", (err) => {
            setCurrentFile(null);
            reject(err);
        });

        child.on("close", (code) => {
            setCurrentFile(null);
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
export async function run(maxPack: number = MAX_PACK): Promise<void> {
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
