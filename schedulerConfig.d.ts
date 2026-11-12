export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface WeekendConfig {
    startDay: Weekday;
    startHour: number;
    endDay: Weekday;
    endHour: number;
}
export interface WeekConfig {
    startHour: number;
    endHour: number;
}
export interface IdleServerConfig {
    activated: boolean;
    maxPack: number;
    /** Minutes to wait between idle-PDM checks - see hourlyScheduler.ts's IDLE_CHECK_INTERVAL_MS. */
    intervalMinutes: number;
}
/** A daily blackout window (same clock time every day, regardless of weekday) during which the
 * update cycle must not start a new run - see hourlyScheduler.ts's isInMaintenanceWindow(). */
export interface MaintenanceWindow {
    startHour: number;
    startMinute: number;
    durationMinutes: number;
}
export interface MaintenanceConfig {
    /** Nightly DB index rebuild - defaults to 02:30 for 1 hour. */
    dbIndex: MaintenanceWindow;
    /** Nightly DB backup - defaults to 05:10 for 1 hour. */
    backup: MaintenanceWindow;
}
export interface SchedulerConfig {
    maxPack: number;
    weekend: WeekendConfig;
    week: WeekConfig;
    idleServer: IdleServerConfig;
    maintenance: MaintenanceConfig;
}
export declare const DEFAULT_MAX_PACK = 50;
export declare const DEFAULT_IDLE_SERVER_MAX_PACK = 20;
export declare const DEFAULT_IDLE_SERVER_INTERVAL_MINUTES = 5;
export declare function getSchedulerConfig(): SchedulerConfig;
type MaintenanceWindowPatch = Partial<Record<"startHour" | "startMinute" | "durationMinutes", unknown>>;
export interface SchedulerConfigPatch {
    maxPack?: unknown;
    weekend?: Partial<Record<"startDay" | "startHour" | "endDay" | "endHour", unknown>>;
    week?: Partial<Record<"startHour" | "endHour", unknown>>;
    idleServer?: Partial<Record<"activated" | "maxPack" | "intervalMinutes", unknown>>;
    maintenance?: Partial<Record<"dbIndex" | "backup", MaintenanceWindowPatch>>;
}
/** Applies a partial update to whichever of the config sections/fields are present, validating each field, and persists the result to scheduler-config.txt. */
export declare function updateSchedulerConfig(patch: SchedulerConfigPatch): SchedulerConfig;
export {};
//# sourceMappingURL=schedulerConfig.d.ts.map