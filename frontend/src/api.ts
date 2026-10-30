import type {
    SchedulerConfig,
    QueueJob,
    QueueSkipResult,
    QueueFamilyResult,
    ProjectRange,
    PartsDataset,
    DailyCount,
    SchedulerStatus,
    RunningTask,
} from "./types";

const API_BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const method = init?.method ?? "GET";
    console.log(`[api] -> ${method} ${API_BASE}${path}`, init?.body ?? "");
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...init,
    });
    if (!response.ok) {
        const body = await response.text();
        console.error(`[api] <- ${method} ${path} FAILED: ${response.status}`, body);
        throw new Error(`${method} ${path} failed: ${response.status} ${body}`);
    }
    const data = (await response.json()) as T;
    console.log(`[api] <- ${method} ${path} ${response.status}`, data);
    return data;
}

export function getSchedulerConfig(): Promise<SchedulerConfig> {
    return request<SchedulerConfig>("/scheduler/config");
}

export function updateSchedulerConfig(patch: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
    return request<SchedulerConfig>("/scheduler/config", {
        method: "POST",
        body: JSON.stringify(patch),
    });
}

/** Kicks off script 1 (see jobScheduler.ts/hourlyScheduler.ts) outside its normal schedule/idle
 * check. 409s if it's already running. */
export function runSchedulerNow(maxPack?: number): Promise<{ message: string }> {
    return request<{ message: string }>(`/scheduler/run/1${maxPack ? `?maxPack=${maxPack}` : ""}`, {
        method: "POST",
    });
}

export function listQueue(): Promise<QueueJob[]> {
    return request<QueueJob[]>("/queue");
}

/** Returns a QueueSkipResult instead of a QueueJob if the file's already fully processed and
 * approved - queuing it again would be a no-op. */
export function addToQueue(job: { code: string; path: string }): Promise<QueueJob | QueueSkipResult> {
    return request<QueueJob | QueueSkipResult>("/queue", {
        method: "POST",
        body: JSON.stringify(job),
    });
}

/** Looks up `code` in the PDM vault and queues its resolved path - no path needed from the
 * caller. Same already-done skip as addToQueue. */
export function addToQueueByCode(code: string): Promise<QueueJob | QueueSkipResult> {
    return request<QueueJob | QueueSkipResult>("/queue/from-code", {
        method: "POST",
        body: JSON.stringify({ code }),
    });
}

/** Queues every approved file under \CAD\ whose filename matches `pattern` (glob, e.g. "22*") -
 * minus any already fully processed and approved (reported in skippedCount). */
export function addFamilyToQueue(pattern: string): Promise<QueueFamilyResult> {
    return request<QueueFamilyResult>("/queue/by-pattern", {
        method: "POST",
        body: JSON.stringify({ pattern }),
    });
}

export function getProjectRange(): Promise<ProjectRange> {
    return request<ProjectRange>("/parts/range");
}

/** Fetched once; the frontend filters it locally by HV range + occurrence range from then on. */
export function getPartsDataset(): Promise<PartsDataset> {
    return request<PartsDataset>("/parts/dataset");
}

/** Daily count of files approved, oldest first, for the trailing `days` days (default 30). */
export function getDailyActivity(days?: number): Promise<DailyCount[]> {
    return request<DailyCount[]>(`/activity/daily${days ? `?days=${days}` : ""}`);
}

/** Raw row count of the `done` table - the dashboard's headline "Done" total. */
export function getDoneTotal(): Promise<{ count: number }> {
    return request<{ count: number }>("/activity/done-total");
}

/** Whether script1 is running right now, and which file it's on - cheap, safe to poll often. */
export function getSchedulerStatus(): Promise<SchedulerStatus> {
    return request<SchedulerStatus>("/scheduler/status");
}

/** Snapshot of the PDM Operations tab queue (tasks queued or actively running). */
export function getRunningPdmTasks(): Promise<RunningTask[]> {
    return request<RunningTask[]>("/pdm/running-tasks");
}
