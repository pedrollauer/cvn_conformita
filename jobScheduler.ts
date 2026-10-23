import { run as script1 } from "./scripts/script1";

const scripts: Record<number, (maxPack?: number) => Promise<void>> = {
    1: script1,
};

const running = new Set<number>();

export function isRunning(id: number): boolean {
    return running.has(id);
}

/** Runs a registered script by id, optionally overriding its pack size. Throws if the id is unknown or already running. */
export async function runScript(id: number, maxPack?: number): Promise<void> {
    const script = scripts[id];
    if (!script) {
        throw new Error(`No script registered for id ${id}`);
    }
    if (running.has(id)) {
        throw new Error(`Script ${id} is already running`);
    }

    running.add(id);
    try {
        await script(maxPack);
    } finally {
        running.delete(id);
    }
}
