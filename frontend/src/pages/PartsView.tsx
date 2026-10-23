import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DailyActivityPane } from "../components/DailyActivityPane";
import { HvSlider } from "../components/HvSlider";
import { OccurrenceFilter } from "../components/OccurrenceFilter";
import { PieChartPane } from "../components/PieChartPane";
import { BarChartPane } from "../components/BarChartPane";
import { AddQueuePane } from "../components/AddQueuePane";
import { SchedulerPane } from "../components/SchedulerPane";
import { getPartsDataset, getProjectRange, listQueue } from "../api";
import type { ErrorCount, OccurrenceRange, PartsDataset, PartsStatusSummary, ProjectRange } from "../types";
import "./PartsView.css";

const EMPTY_STATUS: PartsStatusSummary = { done: 0, inQueue: 0, todo: 0 };

export function PartsView() {
    const [projectRange, setProjectRange] = useState<ProjectRange | null>(null);
    const [hvRange, setHvRange] = useState<[number, number] | null>(null);
    const [occurrences, setOccurrences] = useState<OccurrenceRange>({ min: 0, max: null });
    const [dataset, setDataset] = useState<PartsDataset | null>(null);
    const [inQueue, setInQueue] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Fetched exactly once: the real HV span (to size the slider), the full todo/done dataset
    // (every part's project links + error codes), and the current queue length. Everything the
    // slider/occurrence filter affects is then recomputed locally in the useMemo below - no more
    // re-hitting the server on every drag tick.
    useEffect(() => {
        Promise.all([getProjectRange(), getPartsDataset(), listQueue()])
            .then(([range, data, queue]) => {
                console.log("[PartsView] initial load complete:", {
                    range,
                    partCount: data.parts.length,
                    errorLabelCount: data.errorLabels.length,
                    queueLength: queue.length,
                });
                setProjectRange(range);
                setHvRange([range.min, range.max]);
                setDataset(data);
                setInQueue(queue.length);
                setLoadError(null);
            })
            .catch((err) => {
                console.error("[PartsView] initial load failed:", err);
                setLoadError(err instanceof Error ? err.message : String(err));
            });
    }, []);

    const { status, errors } = useMemo<{ status: PartsStatusSummary; errors: ErrorCount[] }>(() => {
        if (!dataset || !hvRange) {
            return { status: { ...EMPTY_STATUS, inQueue }, errors: [] };
        }
        const [from, to] = hvRange;
        const occMax = occurrences.max ?? Infinity;

        let done = 0;
        let todo = 0;
        const errorCounts = new Map<number, number>();

        for (const part of dataset.parts) {
            const useCount = part.projects.length;
            if (useCount < occurrences.min || useCount > occMax) {
                continue;
            }
            if (!part.projects.some((proj) => proj >= from && proj <= to)) {
                continue;
            }
            if (part.done) done++;
            if (part.todo) {
                todo++;
                for (const errorCode of part.errors) {
                    errorCounts.set(errorCode, (errorCounts.get(errorCode) ?? 0) + 1);
                }
            }
        }

        const labelByCode = new Map(dataset.errorLabels.map((entry) => [entry.code, entry.label]));
        const errorResult: ErrorCount[] = [...errorCounts.entries()]
            .map(([code, count]) => ({ code, label: labelByCode.get(code) ?? `Error ${code}`, count }))
            .sort((a, b) => a.code - b.code);

        console.log("[PartsView] recomputed locally:", { from, to, occurrences, done, todo, errorBuckets: errorResult.length });
        return { status: { done, todo, inQueue }, errors: errorResult };
    }, [dataset, hvRange, occurrences, inQueue]);

    return (
        <div className="parts-view">
            <PageHeader title="Parts view" />
            <div className="parts-view-body">
                <div className="parts-view-column">
                    <DailyActivityPane />
                    <div className="parts-view-filters">
                        {projectRange && hvRange ? (
                            <HvSlider value={hvRange} onChange={setHvRange} min={projectRange.min} max={projectRange.max} />
                        ) : (
                            <span className="parts-view-filters-loading">Loading parts data...</span>
                        )}
                        <OccurrenceFilter value={occurrences} onChange={setOccurrences} />
                    </div>
                    {loadError && <p className="parts-view-error">Failed to load parts data: {loadError}</p>}
                    <PieChartPane status={status} />
                    <BarChartPane errors={errors} />
                </div>
                <div className="parts-view-column parts-view-column-side">
                    <AddQueuePane />
                    <SchedulerPane />
                </div>
            </div>
        </div>
    );
}
