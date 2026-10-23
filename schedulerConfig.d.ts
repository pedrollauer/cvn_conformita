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
}
export interface SchedulerConfig {
    weekend: WeekendConfig;
    week: WeekConfig;
    idleServer: IdleServerConfig;
}
export declare const DEFAULT_IDLE_SERVER_MAX_PACK = 20;
export declare function getSchedulerConfig(): SchedulerConfig;
export interface SchedulerConfigPatch {
    weekend?: Partial<Record<"startDay" | "startHour" | "endDay" | "endHour", unknown>>;
    week?: Partial<Record<"startHour" | "endHour", unknown>>;
    idleServer?: Partial<Record<"activated" | "maxPack", unknown>>;
}
/** Applies a partial update to whichever of the three config sections are present, validating each field, and persists the result to scheduler-config.txt. */
export declare function updateSchedulerConfig(patch: SchedulerConfigPatch): SchedulerConfig;
//# sourceMappingURL=schedulerConfig.d.ts.map