import { useEffect, useRef, useState } from "react";
import { getRunningPdmTasks, getSchedulerStatus } from "../api";
import type { RunningTask, SchedulerStatus } from "../types";
import "./LiveStatusPane.css";

const STATUS_POLL_MS = 3000; // cheap, in-memory only - safe to poll often
const TASKS_POLL_MS = 10000; // hits the PDM SQL server - polled less often
const CLOCK_TICK_MS = 1000; // just re-renders the "Xs ago" labels

function formatElapsed(sinceMs: number, nowMs: number): string {
    const seconds = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

export function LiveStatusPane() {
    const [status, setStatus] = useState<SchedulerStatus | null>(null);
    const [tasks, setTasks] = useState<RunningTask[] | null>(null);
    const [tasksError, setTasksError] = useState<string | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const statusErrorLogged = useRef(false);

    useEffect(() => {
        let cancelled = false;

        function pollStatus() {
            getSchedulerStatus()
                .then((result) => {
                    if (!cancelled) setStatus(result);
                })
                .catch((err) => {
                    if (!statusErrorLogged.current) {
                        console.error("[LiveStatusPane] status poll failed:", err);
                        statusErrorLogged.current = true;
                    }
                });
        }

        pollStatus();
        const id = setInterval(pollStatus, STATUS_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        function pollTasks() {
            getRunningPdmTasks()
                .then((result) => {
                    if (!cancelled) {
                        setTasks(result);
                        setTasksError(null);
                    }
                })
                .catch((err) => {
                    if (!cancelled) {
                        setTasksError(err instanceof Error ? err.message : String(err));
                    }
                });
        }

        pollTasks();
        const id = setInterval(pollTasks, TASKS_POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, []);

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
        return () => clearInterval(id);
    }, []);

    const running = status?.running ?? false;
    const currentFile = status?.currentFile ?? null;

    return (
        <div className="live-status-pane">
            <h2>Live status</h2>

            <div className="live-status-badge">
                <span className={`live-status-dot${running ? " live-status-dot-running" : ""}`} />
                {running && currentFile ? (
                    <span>
                        Updating <code className="live-status-code">{currentFile.code}</code>
                        <span className="live-status-elapsed"> &middot; {formatElapsed(currentFile.startedAt, now)}</span>
                    </span>
                ) : running ? (
                    <span>Running&hellip;</span>
                ) : (
                    <span>Idle</span>
                )}
            </div>

            <h3>
                PDM tasks
                {tasks && tasks.length > 0 && <span className="live-status-count">{tasks.length}</span>}
            </h3>

            {tasksError && <p className="live-status-error">Failed to load PDM tasks: {tasksError}</p>}

            {!tasksError && (
                <ul className="live-status-tasks">
                    {tasks === null && <li className="live-status-muted">Loading&hellip;</li>}
                    {tasks !== null && tasks.length === 0 && <li className="live-status-muted">No tasks running</li>}
                    {tasks?.map((task) => (
                        <li key={task.taskInstanceId} className="live-status-task">
                            <div className="live-status-task-main">
                                <span className="live-status-task-name">{task.taskName}</span>
                                <span className="live-status-task-state">
                                    {task.startTime ? `Running ${formatElapsed(new Date(task.startTime).getTime(), now)}` : "Queued"}
                                </span>
                            </div>
                            {task.docString && <span className="live-status-task-doc">{task.docString}</span>}
                            <span className="live-status-task-meta">
                                {task.host ?? "unassigned host"}
                                {task.initiatedBy ? ` · ${task.initiatedBy}` : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
