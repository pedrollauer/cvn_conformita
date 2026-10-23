import { useEffect, useState } from "react";
import { getSchedulerConfig, updateSchedulerConfig } from "../api";
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

            <section>
                <h3>Week</h3>
                <div className="scheduler-row">
                    <span>Start</span>
                    <HourInput value={week.startHour} onChange={(startHour) => setWeek({ startHour })} />
                    <span>End</span>
                    <HourInput value={week.endHour} onChange={(endHour) => setWeek({ endHour })} />
                    <button type="button" onClick={() => save({ week }, "Week")}>
                        Save
                    </button>
                </div>
            </section>

            <section>
                <h3>Weekend</h3>
                <div className="scheduler-row">
                    <span>Start</span>
                    <DaySelect value={weekend.startDay} onChange={(startDay) => setWeekend({ startDay })} />
                    <HourInput value={weekend.startHour} onChange={(startHour) => setWeekend({ startHour })} />
                    <span>End</span>
                    <DaySelect value={weekend.endDay} onChange={(endDay) => setWeekend({ endDay })} />
                    <HourInput value={weekend.endHour} onChange={(endHour) => setWeekend({ endHour })} />
                    <button type="button" onClick={() => save({ weekend }, "Weekend")}>
                        Save
                    </button>
                </div>
            </section>

            <section>
                <h3>Continuous (idle)</h3>
                <div className="scheduler-row">
                    <label className="scheduler-checkbox">
                        <input
                            type="checkbox"
                            checked={idleServer.activated}
                            onChange={(e) => setIdleServer({ activated: e.target.checked })}
                        />
                        Activated
                    </label>
                    <span>Max pack</span>
                    <input
                        type="number"
                        min={1}
                        value={idleServer.maxPack}
                        onChange={(e) => setIdleServer({ maxPack: Number(e.target.value) })}
                        className="scheduler-hour-input"
                    />
                    <button type="button" onClick={() => save({ idleServer }, "Idle server")}>
                        Save
                    </button>
                </div>
            </section>

            {status && <p className="scheduler-status">{status}</p>}
        </div>
    );
}
