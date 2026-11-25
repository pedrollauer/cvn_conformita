import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { PageHeader } from "../components/PageHeader";
import { ChartSpinner } from "../components/ChartSpinner";
import { getDistinta } from "../api";
import type { DistintaQueueItem } from "../types";
import "./DistintaView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const DEFAULT_COL_DEF: ColDef<DistintaQueueItem> = {
    sortable: true,
    filter: true,
    resizable: true,
};

// A filename's PDM/ERP part code is the same string minus its extension (e.g.
// "290074216187.SLDASM" -> "290074216187") - same convention as the Distinta BOM-compare page.
function codeFromFilename(file: string): string {
    const idx = file.lastIndexOf(".");
    return idx === -1 ? file : file.slice(0, idx);
}

interface DistintaActionContext {
    onCompare: (code: string) => void;
}

function CompareCell(params: ICellRendererParams<DistintaQueueItem, unknown, DistintaActionContext>) {
    const row = params.data;
    if (!row) {
        return null;
    }
    return (
        <button type="button" className="distinta-compare-button" onClick={() => params.context.onCompare(codeFromFilename(row.file))}>
            Distinta
        </button>
    );
}

const COLUMN_DEFS: ColDef<DistintaQueueItem>[] = [
    { field: "id", headerName: "ID", flex: 1, minWidth: 90 },
    { field: "file", headerName: "Nome file", flex: 2, minWidth: 220 },
    { field: "path", headerName: "Percorso", flex: 3, minWidth: 320 },
    {
        field: "checkedInAt",
        headerName: "Check-in",
        flex: 2,
        minWidth: 180,
        valueFormatter: ({ value }) => (value ? new Date(value).toLocaleString("it-IT") : "-"),
    },
    {
        colId: "compareAction",
        headerName: "Distinta",
        flex: 1,
        minWidth: 120,
        sortable: false,
        filter: false,
        cellRenderer: CompareCell,
    },
];

// "Today" / "This week" / a specific date, all compared against DistintaQueueItem.checkedInAt's
// local calendar day. "all" keeps rows with no checkedInAt (queued before that column existed)
// visible instead of silently hiding them.
type DateMode = "all" | "today" | "week" | "custom";

function toLocalDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// Monday-start week containing `d`, as a [from, to] pair of local date keys (both inclusive).
function weekRange(d: Date): [string, string] {
    const monday = new Date(d);
    const isoDayOfWeek = (d.getDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
    monday.setDate(d.getDate() - isoDayOfWeek);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [toLocalDateKey(monday), toLocalDateKey(sunday)];
}

export function DistintaView() {
    const navigate = useNavigate();
    const [rows, setRows] = useState<DistintaQueueItem[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [filenameFilter, setFilenameFilter] = useState("");
    const [dateMode, setDateMode] = useState<DateMode>("today");
    const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));

    useEffect(() => {
        let cancelled = false;
        getDistinta()
            .then((data) => {
                if (!cancelled) setRows(data);
            })
            .catch((err) => {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const filteredRows = useMemo(() => {
        if (!rows) {
            return [];
        }

        let result = rows;
        const needle = filenameFilter.trim().toLowerCase();
        if (needle) {
            result = result.filter((row) => row.file.toLowerCase().includes(needle));
        }

        if (dateMode !== "all") {
            const now = new Date();
            const todayKey = toLocalDateKey(now);
            const [weekFrom, weekTo] = weekRange(now);
            result = result.filter((row) => {
                if (!row.checkedInAt) {
                    return false;
                }
                const key = row.checkedInAt.slice(0, 10);
                if (dateMode === "today") {
                    return key === todayKey;
                }
                if (dateMode === "week") {
                    return key >= weekFrom && key <= weekTo;
                }
                return key === selectedDate;
            });
        }

        return result;
    }, [rows, filenameFilter, dateMode, selectedDate]);

    const gridContext = useMemo<DistintaActionContext>(
        () => ({ onCompare: (code) => navigate(`/distinta-bom?code=${encodeURIComponent(code)}`) }),
        [navigate],
    );

    return (
        <div className="distinta-view">
            <PageHeader title="Checkin" />
            <div className="distinta-body">
                {loadError && <p className="distinta-error">Caricamento dati non riuscito: {loadError}</p>}
                <div className="distinta-filters">
                    <label className="distinta-filter">
                        Nome file
                        <input
                            type="text"
                            placeholder="Filtra per nome file..."
                            value={filenameFilter}
                            onChange={(event) => setFilenameFilter(event.target.value)}
                        />
                    </label>
                    <div className="distinta-filter">
                        Data
                        <div className="distinta-date-buttons">
                            <button
                                type="button"
                                className={dateMode === "today" ? "active" : ""}
                                onClick={() => setDateMode((mode) => (mode === "today" ? "all" : "today"))}
                            >
                                Oggi
                            </button>
                            <button
                                type="button"
                                className={dateMode === "week" ? "active" : ""}
                                onClick={() => setDateMode((mode) => (mode === "week" ? "all" : "week"))}
                            >
                                Questa settimana
                            </button>
                            <input
                                type="date"
                                value={selectedDate}
                                className={dateMode === "custom" ? "active" : ""}
                                onChange={(event) => {
                                    setSelectedDate(event.target.value);
                                    setDateMode("custom");
                                }}
                            />
                        </div>
                    </div>
                </div>
                {!rows ? (
                    <ChartSpinner height={400} />
                ) : (
                    <>
                        <p className="distinta-caption">
                            {filteredRows.length.toLocaleString("it-IT")} file{filteredRows.length === 1 ? "" : "s"}
                        </p>
                        <div className="distinta-grid">
                            <AgGridReact<DistintaQueueItem>
                                theme={themeQuartz}
                                rowData={filteredRows}
                                getRowId={(params) => String(params.data.id)}
                                columnDefs={COLUMN_DEFS}
                                defaultColDef={DEFAULT_COL_DEF}
                                context={gridContext}
                                pagination
                                paginationPageSize={100}
                                paginationPageSizeSelector={[50, 100, 250, 500]}
                                enableCellTextSelection
                                ensureDomOrder
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
