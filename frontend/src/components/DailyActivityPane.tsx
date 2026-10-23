import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDailyActivity } from "../api";
import type { DailyCount } from "../types";
import "./ChartPane.css";
import "./DailyActivityPane.css";

const WINDOW_DAYS = 30;

function formatDay(dateKey: string): string {
    const [, month, day] = dateKey.split("-");
    return `${Number(month)}/${Number(day)}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyCount }> }) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const entry = payload[0]?.payload;
    if (!entry) {
        return null;
    }
    return (
        <div className="chart-tooltip">
            <span className="chart-tooltip-value">{entry.count.toLocaleString()}</span>
            <span className="chart-tooltip-label">{formatDay(entry.date)}</span>
        </div>
    );
}

export function DailyActivityPane() {
    const [daily, setDaily] = useState<DailyCount[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        getDailyActivity(WINDOW_DAYS)
            .then((data) => {
                console.log("[DailyActivityPane] loaded:", data.length, "day(s)");
                setDaily(data);
                setLoadError(null);
            })
            .catch((err) => {
                console.error("[DailyActivityPane] load failed:", err);
                setLoadError(err instanceof Error ? err.message : String(err));
            });
    }, []);

    const stats = useMemo(() => {
        if (!daily || daily.length === 0) {
            return null;
        }
        const today = daily[daily.length - 1].count;
        const yesterday = daily.length > 1 ? daily[daily.length - 2].count : 0;
        const last7 = daily.slice(-7);
        const avg7 = last7.reduce((sum, d) => sum + d.count, 0) / last7.length;
        return { today, delta: today - yesterday, avg7 };
    }, [daily]);

    return (
        <div className="chart-pane">
            <div className="chart-pane-header">
                <h2>Daily activity</h2>
                <span className="chart-pane-caption">Files approved, last {WINDOW_DAYS} days</span>
            </div>

            {loadError && <p className="parts-view-error">Failed to load activity: {loadError}</p>}

            {stats ? (
                <div className="activity-stats">
                    <div className="activity-stat-tile">
                        <span className="activity-stat-label">Done today</span>
                        <span className="activity-stat-value">{stats.today.toLocaleString()}</span>
                        {stats.delta !== 0 && (
                            <span className="activity-stat-delta">
                                {stats.delta > 0 ? "+" : ""}
                                {stats.delta.toLocaleString()} vs yesterday
                            </span>
                        )}
                    </div>
                    <div className="activity-stat-tile">
                        <span className="activity-stat-label">7-day average</span>
                        <span className="activity-stat-value">{stats.avg7.toFixed(1)}</span>
                    </div>
                </div>
            ) : (
                !loadError && <span className="parts-view-filters-loading">Loading activity...</span>
            )}

            <ResponsiveContainer width="100%" height={200}>
                <BarChart data={daily ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--gridline)" />
                    <XAxis
                        dataKey="date"
                        tickFormatter={formatDay}
                        tickLine={false}
                        axisLine={{ stroke: "var(--baseline)" }}
                        tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                        interval={Math.ceil(WINDOW_DAYS / 10)}
                    />
                    <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={{ stroke: "var(--baseline)" }}
                        tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                        width={32}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--gridline)" }} />
                    <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
