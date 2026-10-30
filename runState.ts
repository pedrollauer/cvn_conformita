/**
 * In-memory "what is script1 doing right now" state, set by scripts/script1.ts as it works
 * through a batch, and read by the /api/scheduler/status endpoint for the dashboard's live
 * update indicator. Intentionally not persisted - it only describes the current process's
 * in-flight work, which is meaningless after a restart anyway.
 */
export interface CurrentFile {
    code: string;
    path: string;
    startedAt: number; // ms epoch
}

let currentFile: CurrentFile | null = null;

export function setCurrentFile(file: { code: string; path: string } | null): void {
    currentFile = file ? { ...file, startedAt: Date.now() } : null;
}

export function getCurrentFile(): CurrentFile | null {
    return currentFile;
}
