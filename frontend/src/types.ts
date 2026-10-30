// Mirrors backend/schedulerConfig.ts and backend/interface/queue.ts.
// Kept in sync by hand for now - there's no shared package boundary yet.

export interface WeekendConfig {
    startDay: number; // 0 = Sunday ... 6 = Saturday
    startHour: number;
    endDay: number;
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

export interface QueueJob {
    id: number;
    code: string;
    path: string;
}

export interface PartsStatusSummary {
    done: number;
    inQueue: number;
    todo: number;
}

// Parts that pass the occurrence filter but have no project inside the selected HV range -
// previously silently excluded from the pie chart; surfaced separately so that data isn't lost.
export interface OutsideRangeSummary {
    done: number;
    todo: number;
    total: number;
}

export interface ErrorCount {
    code: number;
    label: string;
    count: number;
    weight: number | null;
}

export interface OccurrenceRange {
    min: number;
    max: number | null; // null = no upper bound
}

export interface ProjectRange {
    min: number;
    max: number;
}

// Mirrors backend/interface/activity.ts's DailyCount.
export interface DailyCount {
    date: string; // YYYY-MM-DD, local day
    count: number;
}

// Mirrors backend/interface/journey_sql.ts's PartRecord/ErrorLabel/PartsDataset - fetched once
// and filtered locally by HV range + occurrence range instead of re-querying per slider tick.
export interface PartRecord {
    code: string;
    projects: number[];
    errors: number[];
    todo: boolean;
    done: boolean;
}

export interface ErrorLabel {
    code: number;
    label: string;
    weight: number | null;
}

export interface PartsDataset {
    parts: PartRecord[];
    errorLabels: ErrorLabel[];
}
