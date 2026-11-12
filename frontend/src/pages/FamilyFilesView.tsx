import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { PageHeader } from "../components/PageHeader";
import { ChartSpinner } from "../components/ChartSpinner";
import { usePartsData } from "../data/PartsDataContext";
import { addToQueueByCode } from "../api";
import type { QueueSkipResult } from "../types";
import { familyOf } from "../family";
import "./FamilyFilesView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

interface FamilyFileRow {
    code: string;
    done: boolean;
    todo: boolean;
    outstanding: boolean;
    errorCount: number;
    projectCount: number;
    queued: boolean;
}

interface QueueCellContext {
    onAddToQueue: (code: string) => Promise<QueueSkipResult | null>;
}

function isSkipResult(value: unknown): value is QueueSkipResult {
    return typeof value === "object" && value !== null && "skipped" in value;
}

/** "Queued" is a plain sortable/filterable boolean column; this is just the action button for
 * rows that aren't queued yet - it tracks its own busy/result state locally since each cell
 * renderer instance belongs to one row. */
function AddToQueueCell(params: ICellRendererParams<FamilyFileRow, unknown, QueueCellContext>) {
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const row = params.data;

    if (!row) {
        return null;
    }
    if (row.queued) {
        return <span className="family-files-queued-note">Already in queue</span>;
    }

    async function handleClick() {
        if (!row) return;
        setBusy(true);
        setNote(null);
        try {
            const skip = await params.context.onAddToQueue(row.code);
            if (skip) {
                setNote(skip.reason);
            }
        } catch (err) {
            setNote(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <span className="family-files-queue-cell">
            <button type="button" className="family-files-queue-button" onClick={handleClick} disabled={busy}>
                {busy ? "Adding…" : "Add to queue"}
            </button>
            {note && (
                <span className="family-files-queue-note" title={note}>
                    {note}
                </span>
            )}
        </span>
    );
}

const DEFAULT_COL_DEF: ColDef<FamilyFileRow> = {
    sortable: true,
    filter: true,
    resizable: true,
};

const COLUMN_DEFS: ColDef<FamilyFileRow>[] = [
    { field: "code", headerName: "Code", flex: 2, minWidth: 180 },
    { field: "done", headerName: "Done", flex: 1, minWidth: 90 },
    { field: "todo", headerName: "Has error", flex: 1, minWidth: 100 },
    { field: "outstanding", headerName: "Outstanding", flex: 1, minWidth: 110 },
    { field: "errorCount", headerName: "Error codes", flex: 1, minWidth: 110 },
    { field: "projectCount", headerName: "HV links", flex: 1, minWidth: 100 },
    { field: "queued", headerName: "Queued", flex: 1, minWidth: 100 },
    {
        colId: "queueAction",
        headerName: "Action",
        flex: 1,
        minWidth: 160,
        sortable: false,
        filter: false,
        cellRenderer: AddToQueueCell,
    },
];

export function FamilyFilesView() {
    const { family } = useParams<{ family: string }>();
    const { dataset, queue, loadError, refreshQueue } = usePartsData();

    const queuedCodes = useMemo(() => new Set(queue.map((job) => job.code)), [queue]);

    const rows = useMemo<FamilyFileRow[]>(() => {
        if (!dataset || family === undefined) {
            return [];
        }
        return dataset.parts
            .filter((p) => familyOf(p.code) === family)
            .map((p) => ({
                code: p.code,
                done: p.done,
                todo: p.todo,
                // Mirrors PartsView/FamilyMatrixPane's "to do" definition: has an active error and
                // hasn't been approved yet - a part can be both `todo` and `done` (re-flagged
                // after a past approval), which isn't resolved on its own.
                outstanding: p.todo && !p.done,
                errorCount: p.errors.length,
                projectCount: p.projects.length,
                queued: queuedCodes.has(p.code),
            }));
    }, [dataset, family, queuedCodes]);

    async function handleAddToQueue(code: string): Promise<QueueSkipResult | null> {
        const result = await addToQueueByCode(code);
        await refreshQueue();
        return isSkipResult(result) ? result : null;
    }

    return (
        <div className="family-files-view">
            <PageHeader title={`Family ${family}`} />
            <div className="family-files-body">
                <Link to="/parts-view" className="family-files-back">
                    ← Back to Parts view
                </Link>
                {loadError && <p className="parts-view-error">Failed to load parts data: {loadError}</p>}
                {!dataset ? (
                    <ChartSpinner height={400} />
                ) : (
                    <>
                        <p className="family-files-caption">
                            {rows.length.toLocaleString()} file{rows.length === 1 ? "" : "s"} in family {family}
                        </p>
                        <div className="family-files-grid">
                            <AgGridReact<FamilyFileRow>
                                theme={themeQuartz}
                                rowData={rows}
                                getRowId={(params) => params.data.code}
                                columnDefs={COLUMN_DEFS}
                                defaultColDef={DEFAULT_COL_DEF}
                                context={{ onAddToQueue: handleAddToQueue } satisfies QueueCellContext}
                                pagination
                                paginationPageSize={100}
                                paginationPageSizeSelector={[50, 100, 250, 500]}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
