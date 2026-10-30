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
    intervalMinutes: number;
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

// Returned instead of a QueueJob by the /api/queue add-flows when the file has already run all
// the way through update+checkin and been approved - queuing it again would be a no-op.
export interface QueueSkipResult {
    skipped: true;
    code: string;
    path: string;
    reason: string;
}

// POST /api/queue/by-pattern's response shape.
export interface QueueFamilyResult {
    queued: QueueJob[];
    skippedCount: number;
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

// Mirrors backend/runState.ts's CurrentFile.
export interface CurrentFile {
    code: string;
    path: string;
    startedAt: number; // ms epoch
}

// Mirrors backend/hourlyScheduler.ts's NextRunEstimate.
export type NextRunSource = "window" | "idleCheck" | "now";

export interface NextRunEstimate {
    atMs: number;
    source: NextRunSource;
}

// GET /api/scheduler/status.
export interface SchedulerStatus {
    running: boolean;
    currentFile: CurrentFile | null;
    nextRun: NextRunEstimate;
}

// Mirrors backend/interface/pdm_sql.ts's RunningTask - a PDM Operations tab task that's queued
// or actively running (EndTime IS NULL).
export interface RunningTask {
    taskInstanceId: number;
    taskId: number;
    taskName: string;
    taskStatus: number;
    attempt: number;
    startTime: string | null; // ISO timestamp, null if still queued (not yet picked up by a host)
    docString: string | null;
    host: string | null;
    initiatedBy: string | null;
}
