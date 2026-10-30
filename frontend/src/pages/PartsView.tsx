import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DailyActivityPane } from "../components/DailyActivityPane";
import { HvSlider } from "../components/HvSlider";
import { OccurrenceFilter } from "../components/OccurrenceFilter";
import { PieChartPane } from "../components/PieChartPane";
import { BarChartPane } from "../components/BarChartPane";
import { AddQueuePane } from "../components/AddQueuePane";
import { SchedulerPane } from "../components/SchedulerPane";
import { getDoneTotal, getPartsDataset, getProjectRange, listQueue } from "../api";
import type { ErrorCount, OccurrenceRange, OutsideRangeSummary, PartsDataset, PartsStatusSummary, ProjectRange } from "../types";
import "./PartsView.css";

const EMPTY_STATUS: PartsStatusSummary = { done: 0, inQueue: 0, todo: 0 };
const EMPTY_OUTSIDE_RANGE: OutsideRangeSummary = { done: 0, todo: 0, total: 0 };

export function PartsView() {
    const [projectRange, setProjectRange] = useState<ProjectRange | null>(null);
    const [hvRange, setHvRange] = useState<[number, number] | null>(null);
    const [occurrences, setOccurrences] = useState<OccurrenceRange>({ min: 0, max: null });
    const [dataset, setDataset] = useState<PartsDataset | null>(null);
    const [inQueue, setInQueue] = useState(0);
    const [doneTotal, setDoneTotal] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Fetched exactly once: the real HV span (to size the slider), the full todo/done dataset
    // (every part's project links + error codes), the current queue length, and the done table's
    // raw row total. Everything the slider/occurrence filter affects is then recomputed locally
    // in the useMemo below - no more re-hitting the server on every drag tick.
    useEffect(() => {
        Promise.all([getProjectRange(), getPartsDataset(), listQueue(), getDoneTotal()])
            .then(([range, data, queue, done]) => {
                console.log("[PartsView] initial load complete:", {
                    range,
                    partCount: data.parts.length,
                    errorLabelCount: data.errorLabels.length,
                    queueLength: queue.length,
                    doneTotal: done.count,
                });
                setProjectRange(range);
                setHvRange([range.min, range.max]);
                setDataset(data);
                setInQueue(queue.length);
                setDoneTotal(done.count);
                setLoadError(null);
            })
            .catch((err) => {
                console.error("[PartsView] initial load failed:", err);
                setLoadError(err instanceof Error ? err.message : String(err));
            });
    }, []);

    const { status, errors, outsideRange, noProjectLink } = useMemo<{
        status: PartsStatusSummary;
        errors: ErrorCount[];
        outsideRange: OutsideRangeSummary;
        noProjectLink: OutsideRangeSummary;
    }>(() => {
        if (!dataset || !hvRange) {
            return {
                status: { ...EMPTY_STATUS, inQueue, done: doneTotal },
                errors: [],
                outsideRange: EMPTY_OUTSIDE_RANGE,
                noProjectLink: EMPTY_OUTSIDE_RANGE,
            };
        }
        const [from, to] = hvRange;
        const occMax = occurrences.max ?? Infinity;

        let todo = 0;
        let outsideDone = 0;
        let outsideTodo = 0;
        let noLinkDone = 0;
        let noLinkTodo = 0;
        const errorCounts = new Map<number, number>();

        for (const part of dataset.parts) {
            const useCount = part.projects.length;
            if (useCount < occurrences.min || useCount > occMax) {
                continue;
            }
            // Parts with every project outside the selected HV range still pass the occurrence
            // filter, so they're tallied separately instead of just vanishing from the totals.
            // A part with no project link at all (useCount === 0) can never be brought into view
            // by moving the slider, so it's tracked apart from ones that merely fall outside it.
            if (!part.projects.some((proj) => proj >= from && proj <= to)) {
                if (useCount === 0) {
                    if (part.done) noLinkDone++;
                    if (part.todo) noLinkTodo++;
                } else {
                    if (part.done) outsideDone++;
                    if (part.todo) outsideTodo++;
                }
                continue;
            }
            if (part.todo) {
                todo++;
                for (const errorCode of part.errors) {
                    errorCounts.set(errorCode, (errorCounts.get(errorCode) ?? 0) + 1);
                }
            }
        }

        const labelByCode = new Map(dataset.errorLabels.map((entry) => [entry.code, entry]));
        const errorResult: ErrorCount[] = [...errorCounts.entries()]
            .map(([code, count]) => {
                const label = labelByCode.get(code);
                return { code, count, label: label?.label ?? `Error ${code}`, weight: label?.weight ?? null };
            })
            .sort((a, b) => a.code - b.code);

        console.log("[PartsView] recomputed locally:", {
            from,
            to,
            occurrences,
            doneTotal,
            todo,
            errorBuckets: errorResult.length,
            outsideDone,
            outsideTodo,
            noLinkDone,
            noLinkTodo,
        });
        return {
            status: { done: doneTotal, todo, inQueue },
            errors: errorResult,
            outsideRange: { done: outsideDone, todo: outsideTodo, total: outsideDone + outsideTodo },
            noProjectLink: { done: noLinkDone, todo: noLinkTodo, total: noLinkDone + noLinkTodo },
        };
    }, [dataset, hvRange, occurrences, inQueue, doneTotal]);

    return (
        <div className="parts-view">
            <PageHeader title="Parts view" />
            <div className="parts-view-body">
                <div className="parts-view-column">
                    <DailyActivityPane />
                    {loadError && <p className="parts-view-error">Failed to load parts data: {loadError}</p>}
                    <PieChartPane status={status} outsideRange={outsideRange} noProjectLink={noProjectLink} />
                    <div className="parts-view-filters">
                        {projectRange && hvRange ? (
                            <HvSlider value={hvRange} onChange={setHvRange} min={projectRange.min} max={projectRange.max} />
                        ) : (
                            <span className="parts-view-filters-loading">Loading parts data...</span>
                        )}
                        <OccurrenceFilter value={occurrences} onChange={setOccurrences} />
                    </div>
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
