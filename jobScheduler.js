"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRunning = isRunning;
exports.runScript = runScript;
const script1_1 = require("./scripts/script1");
const scripts = {
    1: script1_1.run,
};
const running = new Set();
function isRunning(id) {
    return running.has(id);
}
/** Runs a registered script by id, optionally overriding its pack size. Throws if the id is unknown or already running. */
async function runScript(id, maxPack) {
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
    }
    finally {
        running.delete(id);
    }
}
//# sourceMappingURL=jobScheduler.js.map