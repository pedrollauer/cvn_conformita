"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextRunEstimate = getNextRunEstimate;
exports.startHourlyScheduler = startHourlyScheduler;
const schedulerConfig_1 = require("./schedulerConfig");
const jobScheduler_1 = require("./jobScheduler");
const pdm_sql_1 = require("./interface/pdm_sql");
const script1_1 = require("./scripts/script1");
const SCRIPT_ID = 1;
// Was 1 hour, timed from server startup rather than from wall-clock boundaries - a window
// opening at e.g. 19:00 could go unnoticed for up to 59 minutes depending on when the server
// happened to start. Checking every minute instead keeps that gap under a minute.
const TICK_INTERVAL_MS = 60 * 1000;
const MAX_LOOKAHEAD_MINUTES = 7 * 24 * 60;
let lastIdleCheckAt = 0;
function weekMinutes(day, hour, minute = 0) {
    return day * 24 * 60 + hour * 60 + minute;
}
/** True if `nowMinutes` falls in [startMinutes, endMinutes), wrapping around if start > end. */
function isInWindow(nowMinutes, startMinutes, endMinutes) {
    if (startMinutes <= endMinutes) {
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
function isInWeekendWindow(now, weekend) {
    const nowMinutes = weekMinutes(now.getDay(), now.getHours(), now.getMinutes());
    const startMinutes = weekMinutes(weekend.startDay, weekend.startHour);
    const endMinutes = weekMinutes(weekend.endDay, weekend.endHour);
    return isInWindow(nowMinutes, startMinutes, endMinutes);
}
function isInWeekWindow(now, week) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return isInWindow(nowMinutes, week.startHour * 60, week.endHour * 60);
}
function isReadyToWork(now, config) {
    return isInWeekendWindow(now, config.weekend) || isInWeekWindow(now, config.week);
}
/** Minutes from `now` until isReadyToWork() next becomes true (0 if already true). */
function minutesUntilReady(now, config) {
    if (isReadyToWork(now, config)) {
        return 0;
    }
    const probe = new Date(now.getTime());
    for (let minutes = 1; minutes <= MAX_LOOKAHEAD_MINUTES; minutes++) {
        probe.setMinutes(probe.getMinutes() + 1);
        if (isReadyToWork(probe, config)) {
            return minutes;
        }
    }
    return MAX_LOOKAHEAD_MINUTES;
}
/**
 * Best estimate of when the scheduler will next actually attempt a run, for the dashboard's
 * countdown - see frontend/src/components/LiveStatusPane.tsx. If already inside a scheduled
 * window it's "now" (the next TICK_INTERVAL_MS tick will trigger it, same as tick() above). If
 * idle-server is off, it's just the next window open (minutesUntilReady). If idle-server is on,
 * it's whichever is sooner: the next window, or the next idle-PDM check (lastIdleCheckAt +
 * intervalMinutes) - the idle check only *maybe* runs something (only if PDM turns out idle at
 * that moment), but it's the earliest point something could happen.
 */
function getNextRunEstimate() {
    const config = (0, schedulerConfig_1.getSchedulerConfig)();
    const now = new Date();
    const nowMs = now.getTime();
    if (isReadyToWork(now, config)) {
        return { atMs: nowMs, source: "now" };
    }
    const windowAtMs = nowMs + minutesUntilReady(now, config) * 60 * 1000;
    if (!config.idleServer.activated) {
        return { atMs: windowAtMs, source: "window" };
    }
    const idleIntervalMs = config.idleServer.intervalMinutes * 60 * 1000;
    const idleAtMs = Math.max(nowMs, lastIdleCheckAt + idleIntervalMs);
    return idleAtMs <= windowAtMs ? { atMs: idleAtMs, source: "idleCheck" } : { atMs: windowAtMs, source: "window" };
}
async function isPdmIdle() {
    const pdmSql = new pdm_sql_1.PdmSql();
    try {
        return !(await pdmSql.hasRunningTasks());
    }
    finally {
        await pdmSql.close();
    }
}
let lastLoggedStatus = null;
/** Logs only when the status text actually changes, so a once-a-minute tick doesn't spam identical lines. */
function logStatusChange(message) {
    if (message !== lastLoggedStatus) {
        console.log(message);
        lastLoggedStatus = message;
    }
}
async function tick() {
    const config = (0, schedulerConfig_1.getSchedulerConfig)();
    const now = new Date();
    if (isReadyToWork(now, config)) {
        logStatusChange("[scheduler] inside a scheduled window");
        if (!(0, jobScheduler_1.isRunning)(SCRIPT_ID)) {
            (0, jobScheduler_1.runScript)(SCRIPT_ID, script1_1.MAX_PACK).catch((err) => {
                console.error("[scheduler] scheduled run failed:", err);
            });
        }
        return;
    }
    const hours = Math.ceil(minutesUntilReady(now, config) / 60);
    logStatusChange(`[scheduler] hours until ready to work: ${hours}`);
    // The idle-server path opens its own PDM SQL connection to check for running tasks - throttled
    // separately from TICK_INTERVAL_MS, at the interval set in the UI, so enabling idleServer
    // doesn't hit the PDM database every minute.
    const idleCheckIntervalMs = config.idleServer.intervalMinutes * 60 * 1000;
    if (config.idleServer.activated && !(0, jobScheduler_1.isRunning)(SCRIPT_ID) && now.getTime() - lastIdleCheckAt >= idleCheckIntervalMs) {
        lastIdleCheckAt = now.getTime();
        try {
            if (await isPdmIdle()) {
                console.log(`[scheduler] PDM is idle - running idle-server batch (maxPack=${config.idleServer.maxPack})`);
                (0, jobScheduler_1.runScript)(SCRIPT_ID, config.idleServer.maxPack).catch((err) => {
                    console.error("[scheduler] idle-server run failed:", err);
                });
            }
        }
        catch (err) {
            console.error("[scheduler] failed to check PDM running tasks:", err);
        }
    }
}
/** Starting point of the app: ticks immediately, then once every minute (see TICK_INTERVAL_MS). */
function startHourlyScheduler() {
    tick().catch((err) => console.error("[scheduler] initial tick failed:", err));
    setInterval(() => {
        tick().catch((err) => console.error("[scheduler] tick failed:", err));
    }, TICK_INTERVAL_MS);
}
//# sourceMappingURL=hourlyScheduler.js.map