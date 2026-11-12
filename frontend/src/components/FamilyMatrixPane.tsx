import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FamilyCount } from "../types";
import { ChartSpinner } from "./ChartSpinner";
import "./ChartPane.css";
import "./FamilyMatrixPane.css";

interface FamilyMatrixPaneProps {
    families: FamilyCount[];
    loading?: boolean;
}

type Tier = "done" | "good" | "warning" | "serious" | "critical";

const TIER_COLOR: Record<Tier, string> = {
    done: "var(--series-1)",
    good: "var(--status-good)",
    warning: "var(--status-warning)",
    serious: "var(--status-serious)",
    critical: "var(--status-critical)",
};

const TIER_LABEL: Record<Tier, string> = {
    done: "Done",
    good: "Closest to done",
    warning: "Some left",
    serious: "More left",
    critical: "Most remaining",
};

/** Quartile among only the families with outstanding work, by rank rather than an absolute
 * count - `families` is already sorted ascending by `count`, so the bottom quarter (closest to
 * done) is always "good" and the top quarter is always "critical", regardless of how the HV
 * range/occurrence filter changes the overall scale. A family with 0 left is "done" instead - a
 * distinct category, not the bottom of this scale, so it doesn't shift the quartile boundaries. */
function tierOf(indexAmongOutstanding: number, outstandingTotal: number): Tier {
    const pct = outstandingTotal <= 1 ? 0 : indexAmongOutstanding / (outstandingTotal - 1);
    if (pct < 0.25) return "good";
    if (pct < 0.5) return "warning";
    if (pct < 0.75) return "serious";
    return "critical";
}

export function FamilyMatrixPane({ families, loading }: FamilyMatrixPaneProps) {
    const [prefix, setPrefix] = useState("");
    const navigate = useNavigate();

    // Tier is assigned by rank within the *full* list (before the prefix filter) so a tile's
    // color doesn't shift around as you type - typing just narrows which tiles are shown.
    // `families` is sorted ascending by count, so every 0-count ("done") family sorts first;
    // the rest are the outstanding ones the quartile scale applies to.
    const doneCount = families.filter((f) => f.count === 0).length;
    const rows = families.map((f, index) => ({
        ...f,
        tier: f.count === 0 ? ("done" as const) : tierOf(index - doneCount, families.length - doneCount),
    }));

    const normalizedPrefix = prefix.trim().toUpperCase();
    const visibleRows = normalizedPrefix ? rows.filter((r) => r.family.toUpperCase().startsWith(normalizedPrefix)) : rows;
    const visibleTotal = visibleRows.reduce((sum, r) => sum + r.count, 0);

    return (
        <div className="chart-pane">
            <div className="chart-pane-header">
                <h2>Families to do</h2>
                <span className="chart-pane-caption">
                    {loading
                        ? ""
                        : normalizedPrefix
                          ? `${visibleRows.length.toLocaleString()} of ${families.length.toLocaleString()} families · ${visibleTotal.toLocaleString()} files`
                          : `${families.length.toLocaleString()} families · ${visibleTotal.toLocaleString()} files`}
                </span>
            </div>

            {loading ? (
                <ChartSpinner height={160} />
            ) : (
                <>
                    <div className="family-matrix-filter">
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="Filter by family prefix, e.g. 2008"
                            aria-label="Filter families by prefix"
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            className="family-matrix-filter-input"
                        />
                        {prefix && (
                            <button type="button" className="family-matrix-filter-clear" onClick={() => setPrefix("")}>
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="chart-legend">
                        {(["done", "good", "warning", "serious", "critical"] as const).map((tier) => (
                            <span className="chart-legend-item" key={tier}>
                                <span className="chart-legend-swatch" style={{ background: TIER_COLOR[tier] }} />
                                {TIER_LABEL[tier]}
                            </span>
                        ))}
                    </div>
                    {families.length === 0 ? (
                        <p className="family-matrix-empty">No outstanding files in the current selection.</p>
                    ) : visibleRows.length === 0 ? (
                        <p className="family-matrix-empty">No families match "{prefix}".</p>
                    ) : (
                        <div className="family-matrix-grid">
                            {visibleRows.map((r) => (
                                <button
                                    type="button"
                                    className="family-matrix-tile"
                                    key={r.family}
                                    style={{ borderTopColor: TIER_COLOR[r.tier] }}
                                    title={`Family ${r.family}: ${r.count.toLocaleString()} to do (${TIER_LABEL[r.tier]}) - click to view files`}
                                    onClick={() => navigate(`/parts-view/family/${encodeURIComponent(r.family)}`)}
                                >
                                    <span className="family-matrix-tile-label">{r.family}</span>
                                    <span className="family-matrix-tile-count" style={{ color: TIER_COLOR[r.tier] }}>
                                        {r.count.toLocaleString()}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
