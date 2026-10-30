import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ErrorCount } from "../types";
import "./ChartPane.css";

interface BarChartPaneProps {
    errors: ErrorCount[];
}

/** Gravity tiers from the Errors catalog's `weight` column. Unrated errors (weight null) get
 * their own neutral tier rather than being folded into "Low" - an unrated error isn't known to
 * be minor, it just hasn't been triaged yet. */
function severityTier(weight: number | null): "unrated" | "low" | "medium" | "high" {
    if (weight === null) return "unrated";
    if (weight <= 1) return "low";
    if (weight === 2) return "medium";
    return "high";
}

const SEVERITY_COLOR: Record<ReturnType<typeof severityTier>, string> = {
    unrated: "var(--status-unknown)",
    low: "var(--status-warning)",
    medium: "var(--status-serious)",
    high: "var(--status-critical)",
};

const SEVERITY_LABEL: Record<ReturnType<typeof severityTier>, string> = {
    unrated: "Unrated",
    low: "Low",
    medium: "Medium",
    high: "High",
};

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
            <span className="chart-tooltip-label">
                {entry.label} &middot; {SEVERITY_LABEL[severityTier(entry.weight)]} gravity
            </span>
        </div>
    );
}

export function BarChartPane({ errors }: BarChartPaneProps) {
    return (
        <div className="chart-pane">
            <div className="chart-pane-header">
                <h2>Files with errors</h2>
                <span className="chart-pane-caption">Colored by error gravity</span>
            </div>

            <div className="chart-legend">
                {(["high", "medium", "low", "unrated"] as const).map((tier) => (
                    <span className="chart-legend-item" key={tier}>
                        <span className="chart-legend-swatch" style={{ background: SEVERITY_COLOR[tier] }} />
                        {SEVERITY_LABEL[tier]}
                    </span>
                ))}
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
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={24}>
                        {errors.map((entry) => (
                            <Cell key={entry.code} fill={SEVERITY_COLOR[severityTier(entry.weight)]} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
