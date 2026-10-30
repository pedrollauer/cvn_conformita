export declare const MAX_PACK = 50;
/**
 * Script 1: runs "update" then "approve" via the CLI (see runCli above) - two separate process
 * invocations, same net effect as this file's old combined fetch-based loop. Defaults to
 * MAX_PACK, but callers (e.g. the idle-server scheduler) can pass a smaller pack size. A
 * non-zero exit from either command means a hard failure (SOLIDWORKS/PDM never initialized, or
 * an unhandled exception) - individual file failures don't fail the run, they're just reported
 * per-file and left for retry on the C# side. If "update" hard-fails, "approve" still runs -
 * there may be older files already sitting ready for approval independent of this update attempt.
 */
export declare function run(maxPack?: number): Promise<void>;
//# sourceMappingURL=script1.d.ts.map