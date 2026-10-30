"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCurrentFile = setCurrentFile;
exports.getCurrentFile = getCurrentFile;
let currentFile = null;
function setCurrentFile(file) {
    currentFile = file ? { ...file, startedAt: Date.now() } : null;
}
function getCurrentFile() {
    return currentFile;
}
//# sourceMappingURL=runState.js.map