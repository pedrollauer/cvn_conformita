import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { setCurrentFile } from "../runState";

export const MAX_PACK = 50;

// The CLI replaces the old HTTP service (port 5000) - see service/Program.cs. One invocation is
// one whole batch: it drains the queue itself, runs Scripts.Update per file (falling back to
// not-yet-approved update_flow rows if the queue is empty, same as this file used to do), then
// one Scripts.Approve pass, exactly mirroring what this file's old fetch-based loop did - just
// now orchestrated in C# so SOLIDWORKS/PDM stay warm for the whole batch instead of restarting
// per request. Defaults to the Debug build output; override for a Release build or a different
// checkout layout.
const DEFAULT_CLI_PATH = path.join(__dirname, "..", "service", "bin", "Debug", "net10.0-windows", "PdmThumbnailService.exe");
const CLI_PATH = process.env.PDM_CLI_PATH ?? DEFAULT_CLI_PATH;

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
 * Spawns the CLI for one batch and waits for it to exit. stdout is newline-delimited - most
 * lines are plain log text (forwarded to console.log as-is), but per-file lines are JSON (see
 * service/Program.cs's ProcessFile): a "start" line before each file so setCurrentFile reflects
 * what's actually running right now (Conform() can take a while), and an "ok"/"error" result
 * line after. Resolves with the exit code; rejects only if the process itself fails to spawn.
 */
function runCli(maxPack: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(CLI_PATH, [String(maxPack)], { stdio: ["ignore", "pipe", "pipe"] });

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
                setCurrentFile({ code: parsed.code, path: parsed.path });
            } else {
                console.log(`script1: [${parsed.code}] ${parsed.status}`);
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
 * Script 1: runs one batch via the CLI (see runCli above). Defaults to MAX_PACK, but callers
 * (e.g. the idle-server scheduler) can pass a smaller pack size. A non-zero exit means the CLI
 * hit a hard failure (SOLIDWORKS/PDM never initialized, or an unhandled exception) - individual
 * file failures within a batch don't fail the run, they're just reported per-file and left
 * queued for retry on the C# side.
 */
export async function run(maxPack: number = MAX_PACK): Promise<void> {
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
