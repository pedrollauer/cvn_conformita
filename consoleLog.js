"use strict";
// Captures everything written via console.log/console.error (script1's run output, the
// scheduler's status lines, etc. - there's no separate "script log" stream today, they all go
// through the same console) into an in-memory ring buffer, and lets /api/console/stream (see
// app.ts) tail it live. Import this before anything else in app.ts so nothing logged at startup
// is missed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConsoleBacklog = getConsoleBacklog;
exports.subscribeConsole = subscribeConsole;
const MAX_LINES = 1000;
const buffer = [];
const listeners = new Set();
function record(line) {
    buffer.push(line);
    if (buffer.length > MAX_LINES) {
        buffer.shift();
    }
    for (const listener of listeners) {
        listener(line);
    }
}
function formatArgs(args) {
    return args
        .map((arg) => {
        if (typeof arg === "string")
            return arg;
        if (arg instanceof Error)
            return arg.stack ?? arg.message;
        try {
            return JSON.stringify(arg);
        }
        catch {
            return String(arg);
        }
    })
        .join(" ");
}
function wrap(original, prefix) {
    return (...args) => {
        original(...args);
        record(`${new Date().toISOString()} ${prefix}${formatArgs(args)}`);
    };
}
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
console.log = wrap(originalLog, "");
console.error = wrap(originalError, "[error] ");
function getConsoleBacklog() {
    return [...buffer];
}
/** Returns an unsubscribe function. */
function subscribeConsole(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
//# sourceMappingURL=consoleLog.js.map