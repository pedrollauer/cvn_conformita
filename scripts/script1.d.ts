export declare const MAX_PACK = 50;
/**
 * Script 1: runs one batch via the CLI (see runCli above). Defaults to MAX_PACK, but callers
 * (e.g. the idle-server scheduler) can pass a smaller pack size. A non-zero exit means the CLI
 * hit a hard failure (SOLIDWORKS/PDM never initialized, or an unhandled exception) - individual
 * file failures within a batch don't fail the run, they're just reported per-file and left
 * queued for retry on the C# side.
 */
export declare function run(maxPack?: number): Promise<void>;
//# sourceMappingURL=script1.d.ts.map