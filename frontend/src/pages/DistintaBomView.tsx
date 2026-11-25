import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { PageHeader } from "../components/PageHeader";
import { ChartSpinner } from "../components/ChartSpinner";
import { compareBom } from "../api";
import type { BomCompareRow } from "../types";
import "./DistintaBomView.css";

ModuleRegistry.registerModules([AllCommunityModule]);

const DEFAULT_COL_DEF: ColDef<BomCompareRow> = {
    sortable: true,
    filter: true,
    resizable: true,
};

const COLUMN_DEFS: ColDef<BomCompareRow>[] = [
    { field: "code", headerName: "Codice", flex: 2, minWidth: 180, filter: "agTextColumnFilter" },
    { field: "pdmQuantity", headerName: "Quantità PDM", flex: 1, minWidth: 140, filter: "agNumberColumnFilter" },
    { field: "lnQuantity", headerName: "Quantità LN", flex: 1, minWidth: 140, filter: "agNumberColumnFilter" },
    {
        field: "mismatch",
        headerName: "Discrepanza",
        flex: 1,
        minWidth: 130,
        valueFormatter: ({ value }) => (value ? "Sì" : "No"),
        sort: "desc",
        sortIndex: 0,
    },
];

export function DistintaBomView() {
    const [searchParams] = useSearchParams();
    const [code, setCode] = useState(() => searchParams.get("code") ?? "");
    const [rows, setRows] = useState<BomCompareRow[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function runCompare(partCode: string) {
        setLoading(true);
        setError(null);
        setRows(null);
        try {
            setRows(await compareBom(partCode));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }

    // Arriving from the Checkin page's "Distinta" button (?code=...) - prefill and run right
    // away instead of making the user retype the code and press Confronta again.
    useEffect(() => {
        const paramCode = searchParams.get("code");
        if (!paramCode) {
            return;
        }
        setCode(paramCode);
        runCompare(paramCode);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.get("code")]);

    function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) {
            return;
        }
        runCompare(trimmed);
    }

    const mismatchCount = rows?.filter((row) => row.mismatch).length ?? 0;

    return (
        <div className="distinta-bom-view">
            <PageHeader title="Distinta" />
            <div className="distinta-bom-body">
                <form className="distinta-bom-form" onSubmit={handleSubmit}>
                    <label>
                        Codice parte
                        <input
                            type="text"
                            placeholder="es. 290074216187"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                        />
                    </label>
                    <button type="submit" disabled={loading || !code.trim()}>
                        {loading ? "Confronto in corso..." : "Confronta"}
                    </button>
                </form>

                {error && <p className="distinta-bom-error">Confronto non riuscito: {error}</p>}

                {loading && <ChartSpinner height={300} />}

                {rows && (
                    <>
                        <p className="distinta-bom-caption">
                            {rows.length.toLocaleString("it-IT")} componenti, {mismatchCount.toLocaleString("it-IT")} discrepanz
                            {mismatchCount === 1 ? "ia" : "ie"}
                        </p>
                        <div className="distinta-bom-grid">
                            <AgGridReact<BomCompareRow>
                                theme={themeQuartz}
                                rowData={rows}
                                getRowId={(params) => params.data.code}
                                columnDefs={COLUMN_DEFS}
                                defaultColDef={DEFAULT_COL_DEF}
                                rowClassRules={{ "distinta-bom-mismatch": ({ data }) => data?.mismatch === true }}
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
