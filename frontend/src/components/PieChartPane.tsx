import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PartsStatusSummary } from "../types";
import "./ChartPane.css";

interface PieChartPaneProps {
    status: PartsStatusSummary;
}

const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

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

export function PieChartPane({ status }: PieChartPaneProps) {
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
                </div>
                <dl className="chart-pane-stats">
                    <div>
                        <dt>Done</dt>
                        <dd>{status.done.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>In queue</dt>
                        <dd>{status.inQueue.toLocaleString()}</dd>
                    </div>
                    <div>
                        <dt>Todo</dt>
                        <dd>{status.todo.toLocaleString()}</dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
