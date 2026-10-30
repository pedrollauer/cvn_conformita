export type NextRunSource = "window" | "idleCheck" | "now";
export interface NextRunEstimate {
    atMs: number;
    source: NextRunSource;
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
export declare function getNextRunEstimate(): NextRunEstimate;
/** Starting point of the app: ticks immediately, then once every minute (see TICK_INTERVAL_MS). */
export declare function startHourlyScheduler(): void;
//# sourceMappingURL=hourlyScheduler.d.ts.map