type Listener = (line: string) => void;
export declare function getConsoleBacklog(): string[];
/** Returns an unsubscribe function. */
export declare function subscribeConsole(listener: Listener): () => void;
export {};
//# sourceMappingURL=consoleLog.d.ts.map