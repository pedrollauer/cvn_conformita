import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ErrorCount } from "../types";
import "./ChartPane.css";

interface BarChartPaneProps {
    errors: ErrorCount[];
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ErrorCount }> }) {
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
            <span className="chart-tooltip-label">{entry.label}</span>
        </div>
    );
}

export function BarChartPane({ errors }: BarChartPaneProps) {
    return (
        <div className="chart-pane">
            <div className="chart-pane-header">
                <h2>Files with errors</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={errors} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--gridline)" />
                    <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={{ stroke: "var(--baseline)" }}
                        tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                    />
                    <YAxis
                        allowDecimals={false}
                        label={{ value: "# Files", angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 12 }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--baseline)" }}
                        tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--gridline)" }} />
                    <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
