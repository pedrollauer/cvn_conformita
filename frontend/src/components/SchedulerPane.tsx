import { useEffect, useState } from "react";
import { getSchedulerConfig, runSchedulerNow, updateSchedulerConfig } from "../api";
import type { IdleServerConfig, SchedulerConfig, WeekConfig, WeekendConfig } from "../types";
import "./SchedulerPane.css";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function HourInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    return (
        <input
            type="number"
            min={0}
            max={23}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="scheduler-hour-input"
        />
    );
}

function DaySelect({ value, onChange }: { value: number; onChange: (value: number) => void }) {
    return (
        <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
            {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                    {name}
                </option>
            ))}
        </select>
    );
}

export function SchedulerPane() {
    const [config, setConfig] = useState<SchedulerConfig | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [runningNow, setRunningNow] = useState(false);

    useEffect(() => {
        getSchedulerConfig()
            .then(setConfig)
            .catch((err) => setStatus(`Failed to load config: ${err instanceof Error ? err.message : String(err)}`));
    }, []);

    async function save(patch: Partial<SchedulerConfig>, label: string) {
        try {
            const updated = await updateSchedulerConfig(patch);
            setConfig(updated);
            setStatus(`${label} saved.`);
        } catch (err) {
            setStatus(`Failed to save ${label.toLowerCase()}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    async function runNow(maxPack: number) {
        setRunningNow(true);
        setStatus(null);
        try {
            const result = await runSchedulerNow(maxPack);
            setStatus(result.message);
        } catch (err) {
            setStatus(`Failed to start run: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setRunningNow(false);
        }
    }

    if (!config) {
        return (
            <div className="scheduler-pane">
                <h2>Scheduler</h2>
                <p className="scheduler-status">{status ?? "Loading..."}</p>
            </div>
        );
    }

    const { weekend, week, idleServer } = config;

    function setWeekend(patch: Partial<WeekendConfig>) {
        setConfig((current) => (current ? { ...current, weekend: { ...current.weekend, ...patch } } : current));
    }

    function setWeek(patch: Partial<WeekConfig>) {
        setConfig((current) => (current ? { ...current, week: { ...current.week, ...patch } } : current));
    }

    function setIdleServer(patch: Partial<IdleServerConfig>) {
        setConfig((current) => (current ? { ...current, idleServer: { ...current.idleServer, ...patch } } : current));
    }

    return (
        <div className="scheduler-pane">
            <h2>Scheduler</h2>

            <div className="scheduler-grid">
                <section className="scheduler-card">
                    <h3>Week</h3>
                    <div className="scheduler-fields">
                        <label className="scheduler-field">
                            <span>Start</span>
                            <HourInput value={week.startHour} onChange={(startHour) => setWeek({ startHour })} />
                        </label>
                        <label className="scheduler-field">
                            <span>End</span>
                            <HourInput value={week.endHour} onChange={(endHour) => setWeek({ endHour })} />
                        </label>
                    </div>
                    <div className="scheduler-card-actions">
                        <button type="button" onClick={() => save({ week }, "Week")}>
                            Save
                        </button>
                    </div>
                </section>

                <section className="scheduler-card">
                    <h3>Weekend</h3>
                    <div className="scheduler-fields">
                        <label className="scheduler-field">
                            <span>Start day</span>
                            <DaySelect value={weekend.startDay} onChange={(startDay) => setWeekend({ startDay })} />
                        </label>
                        <label className="scheduler-field">
                            <span>Start hour</span>
                            <HourInput value={weekend.startHour} onChange={(startHour) => setWeekend({ startHour })} />
                        </label>
                        <label className="scheduler-field">
                            <span>End day</span>
                            <DaySelect value={weekend.endDay} onChange={(endDay) => setWeekend({ endDay })} />
                        </label>
                        <label className="scheduler-field">
                            <span>End hour</span>
                            <HourInput value={weekend.endHour} onChange={(endHour) => setWeekend({ endHour })} />
                        </label>
                    </div>
                    <div className="scheduler-card-actions">
                        <button type="button" onClick={() => save({ weekend }, "Weekend")}>
                            Save
                        </button>
                    </div>
                </section>

                <section className="scheduler-card scheduler-card-wide">
                    <h3>Continuous (idle)</h3>
                    <div className="scheduler-fields">
                        <label className="scheduler-field scheduler-field-checkbox">
                            <input
                                type="checkbox"
                                checked={idleServer.activated}
                                onChange={(e) => setIdleServer({ activated: e.target.checked })}
                            />
                            <span>Activated</span>
                        </label>
                        <label className="scheduler-field">
                            <span>Max pack</span>
                            <input
                                type="number"
                                min={1}
                                value={idleServer.maxPack}
                                onChange={(e) => setIdleServer({ maxPack: Number(e.target.value) })}
                                className="scheduler-hour-input"
                            />
                        </label>
                        <label className="scheduler-field">
                            <span>Check every (min)</span>
                            <input
                                type="number"
                                min={1}
                                value={idleServer.intervalMinutes}
                                onChange={(e) => setIdleServer({ intervalMinutes: Number(e.target.value) })}
                                className="scheduler-hour-input"
                            />
                        </label>
                    </div>
                    <div className="scheduler-card-actions">
                        <button type="button" onClick={() => save({ idleServer }, "Idle server")}>
                            Save
                        </button>
                        <button
                            type="button"
                            className="scheduler-run-now"
                            onClick={() => runNow(idleServer.maxPack)}
                            disabled={runningNow}
                        >
                            {runningNow ? "Starting…" : "Update now"}
                        </button>
                    </div>
                </section>
            </div>

            {status && <p className="scheduler-status">{status}</p>}
        </div>
    );
}
