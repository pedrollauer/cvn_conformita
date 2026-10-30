"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_IDLE_SERVER_INTERVAL_MINUTES = exports.DEFAULT_IDLE_SERVER_MAX_PACK = void 0;
exports.getSchedulerConfig = getSchedulerConfig;
exports.updateSchedulerConfig = updateSchedulerConfig;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const WEEKDAY_NAMES = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
};
function parseWeekday(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (/^[0-6]$/.test(trimmed)) {
            return Number(trimmed);
        }
        const day = WEEKDAY_NAMES[trimmed.toLowerCase()];
        if (day !== undefined) {
            return day;
        }
    }
    throw new Error(`Invalid weekday (expected 0-6 or a weekday name): ${JSON.stringify(value)}`);
}
function parseHour(value, field) {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 23) {
        return n;
    }
    throw new Error(`Invalid ${field} (expected an integer 0-23): ${JSON.stringify(value)}`);
}
function parsePositiveInt(value, field) {
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n === "number" && Number.isInteger(n) && n > 0) {
        return n;
    }
    throw new Error(`Invalid ${field} (expected a positive integer): ${JSON.stringify(value)}`);
}
function parseBoolean(value, field) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string" && (value.trim() === "true" || value.trim() === "false")) {
        return value.trim() === "true";
    }
    throw new Error(`Invalid ${field} (expected a boolean): ${JSON.stringify(value)}`);
}
exports.DEFAULT_IDLE_SERVER_MAX_PACK = 20;
exports.DEFAULT_IDLE_SERVER_INTERVAL_MINUTES = 5;
const DEFAULT_CONFIG = {
    weekend: { startDay: 6, startHour: 0, endDay: 0, endHour: 18 }, // Saturday 00:00 -> Sunday 18:00
    week: { startHour: 19, endHour: 6 }, // every night, 19:00 -> 06:00
    idleServer: {
        activated: false,
        maxPack: exports.DEFAULT_IDLE_SERVER_MAX_PACK,
        intervalMinutes: exports.DEFAULT_IDLE_SERVER_INTERVAL_MINUTES,
    },
};
// Plain-text key=value file in the project root, so the schedule survives server restarts
// (previously in-memory only, reset to DEFAULT_CONFIG on every restart) and can also be hand-
// edited. Read fresh on every getSchedulerConfig() call rather than cached, so an external edit
// takes effect without restarting the server.
const CONFIG_FILE_PATH = (0, node_path_1.join)(__dirname, "scheduler-config.txt");
const FIELD_PARSERS = {
    "weekend.startDay": parseWeekday,
    "weekend.startHour": (v) => parseHour(v, "weekend.startHour"),
    "weekend.endDay": parseWeekday,
    "weekend.endHour": (v) => parseHour(v, "weekend.endHour"),
    "week.startHour": (v) => parseHour(v, "week.startHour"),
    "week.endHour": (v) => parseHour(v, "week.endHour"),
    "idleServer.activated": (v) => parseBoolean(v, "idleServer.activated"),
    "idleServer.maxPack": (v) => parsePositiveInt(v, "idleServer.maxPack"),
    "idleServer.intervalMinutes": (v) => parsePositiveInt(v, "idleServer.intervalMinutes"),
};
function serializeConfig(config) {
    return ([
        `weekend.startDay = ${config.weekend.startDay}`,
        `weekend.startHour = ${config.weekend.startHour}`,
        `weekend.endDay = ${config.weekend.endDay}`,
        `weekend.endHour = ${config.weekend.endHour}`,
        `week.startHour = ${config.week.startHour}`,
        `week.endHour = ${config.week.endHour}`,
        `idleServer.activated = ${config.idleServer.activated}`,
        `idleServer.maxPack = ${config.idleServer.maxPack}`,
        `idleServer.intervalMinutes = ${config.idleServer.intervalMinutes}`,
    ].join("\n") + "\n");
}
function writeConfigFile(config) {
    (0, node_fs_1.writeFileSync)(CONFIG_FILE_PATH, serializeConfig(config), "utf8");
}
/** Splits the key=value file into raw string fields; unknown lines/keys are ignored. Validation happens separately, per field, in readConfigFile(). */
function parseConfigFile(text) {
    const fields = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eq = line.indexOf("=");
        if (eq === -1) {
            continue;
        }
        const key = line.slice(0, eq).trim();
        if (!(key in FIELD_PARSERS)) {
            continue;
        }
        fields[key] = line.slice(eq + 1).trim();
    }
    return fields;
}
/**
 * Reads scheduler-config.txt, falling back to DEFAULT_CONFIG for any field that's missing or
 * fails to parse (and logging why), so a partially hand-edited or corrupted file never crashes
 * the scheduler tick or the API - it just falls back field-by-field instead.
 */
function readConfigFile() {
    if (!(0, node_fs_1.existsSync)(CONFIG_FILE_PATH)) {
        writeConfigFile(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
    }
    let fields;
    try {
        fields = parseConfigFile((0, node_fs_1.readFileSync)(CONFIG_FILE_PATH, "utf8"));
    }
    catch (err) {
        console.error(`[schedulerConfig] failed to read ${CONFIG_FILE_PATH}, using defaults:`, err);
        return DEFAULT_CONFIG;
    }
    const field = (key, fallback) => {
        if (!(key in fields)) {
            return fallback;
        }
        try {
            return FIELD_PARSERS[key](fields[key]);
        }
        catch (err) {
            console.error(`[schedulerConfig] invalid ${key} in ${CONFIG_FILE_PATH}, using default:`, err);
            return fallback;
        }
    };
    return {
        weekend: {
            startDay: field("weekend.startDay", DEFAULT_CONFIG.weekend.startDay),
            startHour: field("weekend.startHour", DEFAULT_CONFIG.weekend.startHour),
            endDay: field("weekend.endDay", DEFAULT_CONFIG.weekend.endDay),
            endHour: field("weekend.endHour", DEFAULT_CONFIG.weekend.endHour),
        },
        week: {
            startHour: field("week.startHour", DEFAULT_CONFIG.week.startHour),
            endHour: field("week.endHour", DEFAULT_CONFIG.week.endHour),
        },
        idleServer: {
            activated: field("idleServer.activated", DEFAULT_CONFIG.idleServer.activated),
            maxPack: field("idleServer.maxPack", DEFAULT_CONFIG.idleServer.maxPack),
            intervalMinutes: field("idleServer.intervalMinutes", DEFAULT_CONFIG.idleServer.intervalMinutes),
        },
    };
}
function getSchedulerConfig() {
    return readConfigFile();
}
/** Applies a partial update to whichever of the three config sections are present, validating each field, and persists the result to scheduler-config.txt. */
function updateSchedulerConfig(patch) {
    const current = readConfigFile();
    const next = {
        weekend: { ...current.weekend },
        week: { ...current.week },
        idleServer: { ...current.idleServer },
    };
    if (patch.weekend) {
        const { startDay, startHour, endDay, endHour } = patch.weekend;
        if (startDay !== undefined)
            next.weekend.startDay = parseWeekday(startDay);
        if (startHour !== undefined)
            next.weekend.startHour = parseHour(startHour, "weekend.startHour");
        if (endDay !== undefined)
            next.weekend.endDay = parseWeekday(endDay);
        if (endHour !== undefined)
            next.weekend.endHour = parseHour(endHour, "weekend.endHour");
    }
    if (patch.week) {
        const { startHour, endHour } = patch.week;
        if (startHour !== undefined)
            next.week.startHour = parseHour(startHour, "week.startHour");
        if (endHour !== undefined)
            next.week.endHour = parseHour(endHour, "week.endHour");
    }
    if (patch.idleServer) {
        const { activated, maxPack, intervalMinutes } = patch.idleServer;
        if (activated !== undefined) {
            if (typeof activated !== "boolean") {
                throw new Error(`Invalid idleServer.activated (expected boolean): ${JSON.stringify(activated)}`);
            }
            next.idleServer.activated = activated;
        }
        if (maxPack !== undefined) {
            next.idleServer.maxPack = parsePositiveInt(maxPack, "idleServer.maxPack");
        }
        if (intervalMinutes !== undefined) {
            next.idleServer.intervalMinutes = parsePositiveInt(intervalMinutes, "idleServer.intervalMinutes");
        }
    }
    writeConfigFile(next);
    return next;
}
//# sourceMappingURL=schedulerConfig.js.map