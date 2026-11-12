import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DailyActivityPane } from "../components/DailyActivityPane";
import { HvSlider } from "../components/HvSlider";
import { OccurrenceFilter } from "../components/OccurrenceFilter";
import { PieChartPane } from "../components/PieChartPane";
import { BarChartPane } from "../components/BarChartPane";
import { FamilyMatrixPane } from "../components/FamilyMatrixPane";
import { AddQueuePane } from "../components/AddQueuePane";
import { LiveStatusPane } from "../components/LiveStatusPane";
import { SchedulerPane } from "../components/SchedulerPane";
import { usePartsData } from "../data/PartsDataContext";
import { getCookie, setCookie } from "../cookies";
import { familyOf } from "../family";
import type { ErrorCount, FamilyCount, OccurrenceRange, OutsideRangeSummary, PartsStatusSummary, ProjectRange } from "../types";
import "./PartsView.css";

const EMPTY_STATUS: PartsStatusSummary = { done: 0, inQueue: 0, todo: 0 };
const EMPTY_OUTSIDE_RANGE: OutsideRangeSummary = { done: 0, todo: 0, total: 0 };

const HV_RANGE_COOKIE = "hvRange";
const DEFAULT_HV_RANGE: [number, number] = [9000, 9297];

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
}

/** The HV range to start with: whatever was saved in the cookie from a previous visit, falling
 * back to DEFAULT_HV_RANGE (HV9000-HV9297) if there's no cookie or it's malformed - either way
 * clamped to the real dataset bounds in case the saved/default values no longer fit it. */
function initialHvRange(range: ProjectRange): [number, number] {
    const raw = getCookie(HV_RANGE_COOKIE);
    const parsed = raw?.split(",").map(Number);
    const [low, high] =
        parsed && parsed.length === 2 && parsed.every(Number.isFinite) ? (parsed as [number, number]) : DEFAULT_HV_RANGE;
    const clampedLow = clamp(low, range.min, range.max);
    const clampedHigh = clamp(high, clampedLow, range.max);
    return [clampedLow, clampedHigh];
}

export function PartsView() {
    const { projectRange, dataset, queue, doneTotal, loadError } = usePartsData();
    const inQueue = queue.length;
    const [hvRange, setHvRange] = useState<[number, number] | null>(null);
    const [occurrences, setOccurrences] = useState<OccurrenceRange>({ min: 0, max: null });

    // hvRange can only be initialized once projectRange has loaded (to clamp against the real
    // dataset bounds), so it's set here rather than from useState's initializer.
    useEffect(() => {
        if (projectRange && !hvRange) {
            setHvRange(initialHvRange(projectRange));
        }
    }, [projectRange, hvRange]);

    // Remembers the selected HV range across visits. Skipped while hvRange is still null (before
    // the initial load above has run) so the cookie is never overwritten with a placeholder.
    useEffect(() => {
        if (hvRange) {
            setCookie(HV_RANGE_COOKIE, `${hvRange[0]},${hvRange[1]}`, 365);
        }
    }, [hvRange]);

    // The grand, filter-independent count of every part with an active error - unlike
    // status.todo (scoped to the current HV range/occurrence filter), this is the true ceiling
    // for the "Total to do" line on DailyActivityPane's overlay.
    const totalTodo = useMemo(() => dataset?.parts.filter((p) => p.todo).length ?? 0, [dataset]);

    const { status, errors, noProjectLink, families } = useMemo<{
        status: PartsStatusSummary;
        errors: ErrorCount[];
        noProjectLink: OutsideRangeSummary;
        families: FamilyCount[];
    }>(() => {
        if (!dataset || !hvRange) {
            return {
                status: { ...EMPTY_STATUS, inQueue, done: doneTotal },
                errors: [],
                noProjectLink: EMPTY_OUTSIDE_RANGE,
                families: [],
            };
        }
        const [from, to] = hvRange;
        const occMax = occurrences.max ?? Infinity;

        let todo = 0;
        let noLinkDone = 0;
        let noLinkTodo = 0;
        const errorCounts = new Map<number, number>();
        // "To do" per family compares the done table against the error-tracking (todo) table. A
        // family gets an entry as soon as any of its codes has ever been tracked as todo, even if
        // every one of them is now done (count stays 0 rather than the family disappearing) - see
        // FamilyMatrixPane's "done" tier for how a 0 is distinguished from "almost done".
        const familyCounts = new Map<string, number>();

        for (const part of dataset.parts) {
            const useCount = part.projects.length;
            if (useCount < occurrences.min || useCount > occMax) {
                continue;
            }
            // A part with no project link at all (useCount === 0) can never be brought into view
            // by moving the slider, so it's tracked separately; one that merely falls outside the
            // selected range just drops out of the totals below.
            if (!part.projects.some((proj) => proj >= from && proj <= to)) {
                if (useCount === 0) {
                    if (part.done) noLinkDone++;
                    if (part.todo) noLinkTodo++;
                }
                continue;
            }
            if (part.todo) {
                todo++;
                for (const errorCode of part.errors) {
                    errorCounts.set(errorCode, (errorCounts.get(errorCode) ?? 0) + 1);
                }
                const family = familyOf(part.code);
                familyCounts.set(family, (familyCounts.get(family) ?? 0) + (part.done ? 0 : 1));
            }
        }

        const labelByCode = new Map(dataset.errorLabels.map((entry) => [entry.code, entry]));
        const errorResult: ErrorCount[] = [...errorCounts.entries()]
            .map(([code, count]) => {
                const label = labelByCode.get(code);
                return { code, count, label: label?.label ?? `Error ${code}`, weight: label?.weight ?? null };
            })
            .sort((a, b) => a.code - b.code);

        // Families closest to done (fewest files still outstanding) first.
        const familyResult: FamilyCount[] = [...familyCounts.entries()]
            .map(([family, count]) => ({ family, count }))
            .sort((a, b) => a.count - b.count || a.family.localeCompare(b.family));

        console.log("[PartsView] recomputed locally:", {
            from,
            to,
            occurrences,
            doneTotal,
            todo,
            errorBuckets: errorResult.length,
            noLinkDone,
            noLinkTodo,
        });
        return {
            status: { done: doneTotal, todo, inQueue },
            errors: errorResult,
            noProjectLink: { done: noLinkDone, todo: noLinkTodo, total: noLinkDone + noLinkTodo },
            families: familyResult,
        };
    }, [dataset, hvRange, occurrences, inQueue, doneTotal]);

    return (
        <div className="parts-view">
            <PageHeader title="Parts view" />
            <div className="parts-view-body">
                <div className="parts-view-column">
                    <DailyActivityPane doneTotal={doneTotal} todoTotal={status.todo} totalTodo={totalTodo} />
                    {loadError && <p className="parts-view-error">Failed to load parts data: {loadError}</p>}
                    <PieChartPane status={status} noProjectLink={noProjectLink} hvRange={hvRange ?? undefined} loading={!dataset} />
                    <div className="parts-view-filters">
                        {projectRange && hvRange ? (
                            <HvSlider value={hvRange} onChange={setHvRange} min={projectRange.min} max={projectRange.max} />
                        ) : (
                            <span className="parts-view-filters-loading">Loading parts data...</span>
                        )}
                        <OccurrenceFilter value={occurrences} onChange={setOccurrences} />
                    </div>
                    <FamilyMatrixPane families={families} loading={!dataset} />
                    <BarChartPane errors={errors} loading={!dataset} />
                </div>
                <div className="parts-view-column parts-view-column-side">
                    <AddQueuePane />
                    <LiveStatusPane />
                    <SchedulerPane />
                </div>
            </div>
        </div>
    );
}
