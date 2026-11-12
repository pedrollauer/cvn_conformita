import { useEffect, useMemo, useState } from "react";
import {
    Bar,
    CartesianGrid,
    Cell,
    ComposedChart,
    Line,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { getDailyActivity } from "../api";
import type { DailyCount } from "../types";
import { ChartSpinner } from "./ChartSpinner";
import "./ChartPane.css";
import "./DailyActivityPane.css";

const WINDOW_DAYS = 30;

// The bars' own left axis is padded so the tallest real bar never occupies more than this
// fraction of the chart height - computed from the actual daily max (see `leftDomain` below)
// rather than a fixed ceiling, since a single spiky day (seen in practice: one day over 15,000)
// can otherwise blow straight past a fixed guess and defeat the whole point of padding.
const BAR_ZONE_FRACTION = 0.25;

// A small floor so a quiet window (daily counts near zero) doesn't zoom the axis in absurdly
// tight - unrelated to BAR_ZONE_FRACTION, which only matters once real counts get large.
const LEFT_AXIS_MIN_CEILING = 5000;

// How far up the chart (0 = bottom, 1 = top) the *smaller* of the two "right" axis values
// (always Done) should land - comfortably above BAR_ZONE_FRACTION, the guaranteed top of the
// bars.
const OVERLAY_FLOOR_FRACTION = 0.4;

// How much headroom computeOverlayDomain leaves above the *larger* of the two "right" axis
// values (First Wave) - i.e. the axis ceiling is this multiple of that value, not just +8%.
// CEILING_LINE_FRACTION below depends on this: with OVERLAY_FLOOR_FRACTION=0.4, the larger value
// can never land above (1-0.4)/OVERLAY_HEADROOM_MULTIPLIER + 0.4 of the chart height even in the
// extreme case (First Wave >> Done) - working out to 80% at this multiplier, comfortably under
// CEILING_LINE_FRACTION.
const OVERLAY_HEADROOM_MULTIPLIER = 1.5;

// Where the "Total to do" line sits, as a fixed fraction of the chart height - deliberately NOT
// proportional to its real value. It's typically 4-10x doneTotal/todoTotal; including it in the
// same compressed domain as those two (see computeOverlayDomain) squeezed the cumulative-done
// line's own rise down to a few % of the chart and made it look flat/broken. Drawn on its own
// fixed-scale axis instead - its label still carries the real number, just not its position.
// Must stay above the worst-case bound noted on OVERLAY_HEADROOM_MULTIPLIER, or First Wave can
// end up drawn above it.
const CEILING_LINE_FRACTION = 0.9;

interface DailyActivityPaneProps {
    /** Pie chart's all-time Done count: the cumulative-done line's own endpoint lands exactly
     * here, and it's also drawn as a reference line ("Done") so it's legible even when scrolled
     * away from the chart's right edge. Always the smallest of the three overlay values, so it
     * anchors the bottom of the overlay's dedicated band (see OVERLAY_FLOOR_FRACTION). */
    doneTotal?: number;
    /** Pie chart's currently-filtered Todo count - drawn as the "First Wave" reference line: a
     * flat line showing the size of the remaining (filtered) backlog against the same
     * cumulative-done scale. Todo has no per-file timestamp, so unlike Done it can't be its own
     * rising daily series. */
    todoTotal?: number;
    /** The grand, filter-independent Todo count (every part with an active error, regardless of
     * HV range/occurrence filter) - drawn as "Total to do", always above the other two since it
     * can only be >= the filtered todoTotal. */
    totalTodo?: number;
}

/** The right axis's domain is deliberately NOT a plain [0, max] - that would put `doneTotal`
 * (the smaller of the two reference values here) low enough to cross through the tall bars.
 * Instead the floor is pushed well below 0 so the real difference between the two values is
 * compressed into a band near the top, Done below First Wave, clear of the bars below. Tick
 * labels are hidden (see the right YAxis) since this floor is a large arbitrary negative number,
 * not a meaningful value - the reference lines' own inline labels carry the real numbers
 * instead. Deliberately NOT given `totalTodo` too - see CEILING_LINE_FRACTION. */
function computeOverlayDomain(values: number[]): [number, number] {
    const valid = values.filter((v): v is number => Number.isFinite(v));
    if (valid.length === 0) {
        return [0, 1];
    }
    const max = Math.max(...valid) * OVERLAY_HEADROOM_MULTIPLIER;
    const min = Math.min(...valid);
    const floor = (min - OVERLAY_FLOOR_FRACTION * max) / (1 - OVERLAY_FLOOR_FRACTION);
    return [floor, max];
}

interface DailyCountWithCumulative extends DailyCount {
    cumulative: number | null;
}

/** Running total of `count` across the window, offset so the last day's cumulative value lands
 * exactly on `doneTotal` - the all-time total - rather than just the sum of the visible window
 * (which would undercount once the done table has history older than WINDOW_DAYS). */
function withCumulative(daily: DailyCount[], doneTotal: number | undefined): DailyCountWithCumulative[] {
    if (doneTotal === undefined) {
        return daily.map((d) => ({ ...d, cumulative: null }));
    }
    const windowSum = daily.reduce((sum, d) => sum + d.count, 0);
    let running = Math.max(0, doneTotal - windowSum);
    return daily.map((d) => {
        running += d.count;
        return { ...d, cumulative: running };
    });
}

function formatDay(dateKey: string): string {
    const [, month, day] = dateKey.split("-");
    return `${Number(month)}/${Number(day)}`;
}

/** `date` is a local YYYY-MM-DD key (see interface/activity.ts) - parsed as y/m/d components
 * rather than handed to `new Date(string)`, which reads bare date strings as UTC and can shift
 * the weekday by a day depending on the viewer's timezone offset. */
function isWeekend(dateKey: string): boolean {
    const [year, month, day] = dateKey.split("-").map(Number);
    const dow = new Date(year, month - 1, day).getDay();
    return dow === 0 || dow === 6;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DailyCountWithCumulative }> }) {
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
            {entry.cumulative !== null && (
                <span className="chart-tooltip-label">{entry.cumulative.toLocaleString()} cumulative</span>
            )}
        </div>
    );
}

export function DailyActivityPane({ doneTotal, todoTotal, totalTodo }: DailyActivityPaneProps) {
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

    const dataWithCumulative = useMemo(() => (daily ? withCumulative(daily, doneTotal) : []), [daily, doneTotal]);

    const leftDomain = useMemo((): [number, number] => {
        const dailyMax = dataWithCumulative.reduce((max, d) => Math.max(max, d.count), 0);
        // Padding to keep the tallest bar at BAR_ZONE_FRACTION of the height, not a fixed
        // multiple of dailyMax - a fixed multiple doesn't adapt if the max itself moves around.
        return [0, Math.max(LEFT_AXIS_MIN_CEILING, dailyMax / BAR_ZONE_FRACTION)];
    }, [dataWithCumulative]);

    const rightDomain = useMemo(
        () => computeOverlayDomain([doneTotal, todoTotal].filter((v): v is number => v !== undefined)),
        [doneTotal, todoTotal],
    );

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

            <div className="chart-legend">
                <span className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: "var(--series-1)" }} />
                    Weekday
                </span>
                <span className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: "var(--series-4)" }} />
                    Weekend
                </span>
                <span className="chart-legend-item">
                    <span className="chart-legend-swatch chart-legend-swatch-line" style={{ background: "var(--series-1)" }} />
                    Cumulative done
                </span>
                <span className="chart-legend-item">
                    <span className="chart-legend-swatch chart-legend-swatch-line" style={{ background: "var(--series-3)" }} />
                    First Wave
                </span>
                <span className="chart-legend-item">
                    <span className="chart-legend-swatch chart-legend-swatch-line" style={{ background: "var(--status-critical)" }} />
                    Total to do
                </span>
            </div>

            {daily === null ? (
                <ChartSpinner height={200} />
            ) : (
                <ResponsiveContainer width="100%" height={200}>
                    {/* Extra top margin (vs. the other three sides) so the "Total to do" label -
                        pinned near the very top of the chart via CEILING_LINE_FRACTION - has
                        room to render above its line instead of being clipped by the SVG edge. */}
                    <ComposedChart data={dataWithCumulative} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--gridline)" />
                        <XAxis
                            dataKey="date"
                            tickFormatter={formatDay}
                            tickLine={false}
                            axisLine={{ stroke: "var(--baseline)" }}
                            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                            interval={Math.ceil(WINDOW_DAYS / 10)}
                        />
                        {/* Daily bars keep this scale, just padded up to LEFT_AXIS_MIN_CEILING so
                            real counts (currently in the low thousands) stay confined to a band
                            near the bottom, leaving the overlay's band above clearly separate. */}
                        <YAxis
                            yAxisId="left"
                            domain={leftDomain}
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={{ stroke: "var(--baseline)" }}
                            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                            tickFormatter={(v: number) => v.toLocaleString()}
                            width={44}
                        />
                        {/* The overlay's scale - see computeOverlayDomain(). Its domain's floor is
                            an arbitrary large negative number (not a real value), so its own tick
                            labels would be meaningless; the ReferenceLine labels below carry the
                            real numbers instead. */}
                        <YAxis yAxisId="right" domain={rightDomain} hide />
                        {/* Fixed [0,1] scale solely for the "Total to do" line - see
                            CEILING_LINE_FRACTION. Not data-driven, so it can't distort the
                            cumulative-done line's own scale on the "right" axis above. */}
                        <YAxis yAxisId="ceiling" domain={[0, 1]} hide />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--gridline)" }} />
                        {/* SVG paints document order back-to-front, and Recharts renders each
                            element here in JSX order - so the overlay (Line + ReferenceLine) must
                            come after Bar, or the opaque bars paint over it wherever they cross. */}
                        <Bar yAxisId="left" dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={16}>
                            {dataWithCumulative.map((entry) => (
                                <Cell
                                    key={entry.date}
                                    fill={isWeekend(entry.date) ? "var(--series-4)" : "var(--series-1)"}
                                />
                            ))}
                        </Bar>
                        <Line
                            yAxisId="right"
                            dataKey="cumulative"
                            type="monotone"
                            stroke="var(--series-1)"
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                        />
                        {doneTotal !== undefined && (
                            <ReferenceLine
                                yAxisId="right"
                                y={doneTotal}
                                stroke="var(--series-1)"
                                strokeDasharray="4 4"
                                label={{
                                    value: `Done ${doneTotal.toLocaleString()}`,
                                    position: "insideBottomRight",
                                    fill: "var(--series-1)",
                                    fontSize: 11,
                                }}
                            />
                        )}
                        {todoTotal !== undefined && (
                            <ReferenceLine
                                yAxisId="right"
                                y={todoTotal}
                                stroke="var(--series-3)"
                                strokeDasharray="4 4"
                                label={{
                                    value: `First Wave ${todoTotal.toLocaleString()}`,
                                    position: "insideBottomRight",
                                    fill: "var(--series-3)",
                                    fontSize: 11,
                                }}
                            />
                        )}
                        {totalTodo !== undefined && (
                            <ReferenceLine
                                yAxisId="ceiling"
                                y={CEILING_LINE_FRACTION}
                                stroke="var(--status-critical)"
                                strokeDasharray="4 4"
                                label={{
                                    value: `Total to do ${totalTodo.toLocaleString()}`,
                                    position: "top",
                                    fill: "var(--status-critical)",
                                    fontSize: 11,
                                }}
                            />
                        )}
                    </ComposedChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
