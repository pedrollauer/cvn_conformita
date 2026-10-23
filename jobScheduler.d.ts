export declare function isRunning(id: number): boolean;
/** Runs a registered script by id, optionally overriding its pack size. Throws if the id is unknown or already running. */
export declare function runScript(id: number, maxPack?: number): Promise<void>;
//# sourceMappingURL=jobScheduler.d.ts.map