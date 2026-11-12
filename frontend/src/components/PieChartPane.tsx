import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { OutsideRangeSummary, PartsStatusSummary } from "../types";
import { ChartSpinner } from "./ChartSpinner";
import "./ChartPane.css";

interface PieChartPaneProps {
    status: PartsStatusSummary;
    noProjectLink?: OutsideRangeSummary;
    /** The currently selected HV range, shown next to the "Todo" label so the figure below it is
     * never read as the all-time total - it's scoped to this range. */
    hvRange?: [number, number];
    loading?: boolean;
}

// Done/In queue/Todo, matching the order `data` is built in below. Todo uses the same red as
// the rest of the app's "most remaining/critical" indicators (DailyActivityPane's "Total to do"
// line, FamilyMatrixPane's top tier) rather than the neutral aqua it used before.
const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--status-critical)"];

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
    if (!active || !payload || payload.length === 0) {
        return null;
    }
    const entry = payload[0];
    if (!entry) {
        return null;
    }
    return (
        <div className="chart-tooltip">
            <span className="chart-tooltip-value">{entry.value.toLocaleString()}</span>
            <span className="chart-tooltip-label">{entry.name}</span>
        </div>
    );
}

export function PieChartPane({ status, noProjectLink, hvRange, loading }: PieChartPaneProps) {
    const data = [
        { name: "Done", value: status.done },
        { name: "In queue", value: status.inQueue },
        { name: "Todo", value: status.todo },
    ];

    return (
        <div className="chart-pane">
            <div className="chart-pane-header">
                <h2>Parts status</h2>
            </div>
            <div className="chart-pane-body chart-pane-body-split">
                <div className="chart-pane-pie">
                    {loading ? (
                        <ChartSpinner height={220} />
                    ) : (
                    <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                            <Pie
                                data={data}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={2}
                                label={false}
                                labelLine={false}
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={entry.name}
                                        fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                                        stroke="var(--surface-1)"
                                        strokeWidth={2}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend verticalAlign="bottom" height={28} />
                        </PieChart>
                    </ResponsiveContainer>
                    )}
                </div>
                <dl className="chart-pane-stats">
                    <div>
                        <dt>Done</dt>
                        <dd style={{ color: "var(--series-1)" }}>{status.done.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>In queue</dt>
                        <dd>{status.inQueue.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>Todo {hvRange && `[HV${hvRange[0]} - HV${hvRange[1]}]`}</dt>
                        <dd style={{ color: "var(--status-critical)" }}>{status.todo.toLocaleString()}</dd>
                    </div>
                    {noProjectLink && (
                        <div>
                            <dt>No HV project link</dt>
                            <dd>{noProjectLink.total.toLocaleString()}</dd>
                            {noProjectLink.total > 0 && (
                                <span className="chart-pane-stats-note">
                                    {noProjectLink.done.toLocaleString()} done, {noProjectLink.todo.toLocaleString()} todo
                                </span>
                            )}
                        </div>
                    )}
                </dl>
            </div>
        </div>
    );
}
