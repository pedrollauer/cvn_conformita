import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getDoneTotal, getPartsDataset, getProjectRange, listQueue } from "../api";
import type { PartsDataset, ProjectRange, QueueJob } from "../types";

interface PartsDataContextValue {
    projectRange: ProjectRange | null;
    dataset: PartsDataset | null;
    queue: QueueJob[];
    doneTotal: number;
    loadError: string | null;
    /** Re-fetches just the queue (e.g. after adding a file to it from FamilyFilesView) - cheap
     * compared to the dataset, so it's fine to call this instead of reloading everything. */
    refreshQueue: () => Promise<void>;
}

const PartsDataContext = createContext<PartsDataContextValue | null>(null);

/** Fetches the (large, slow) parts dataset exactly once for the whole app, rather than per page -
 * PartsView and the per-family files view (and anything else added later) all read from this
 * same context instead of each re-fetching /api/parts/dataset on their own mount. */
export function PartsDataProvider({ children }: { children: ReactNode }) {
    const [projectRange, setProjectRange] = useState<ProjectRange | null>(null);
    const [dataset, setDataset] = useState<PartsDataset | null>(null);
    const [queue, setQueue] = useState<QueueJob[]>([]);
    const [doneTotal, setDoneTotal] = useState(0);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getProjectRange(), getPartsDataset(), listQueue(), getDoneTotal()])
            .then(([range, data, queueJobs, done]) => {
                console.log("[PartsDataProvider] initial load complete:", {
                    range,
                    partCount: data.parts.length,
                    errorLabelCount: data.errorLabels.length,
                    queueLength: queueJobs.length,
                    doneTotal: done.count,
                });
                setProjectRange(range);
                setDataset(data);
                setQueue(queueJobs);
                setDoneTotal(done.count);
                setLoadError(null);
            })
            .catch((err) => {
                console.error("[PartsDataProvider] initial load failed:", err);
                setLoadError(err instanceof Error ? err.message : String(err));
            });
    }, []);

    async function refreshQueue(): Promise<void> {
        setQueue(await listQueue());
    }

    return (
        <PartsDataContext.Provider value={{ projectRange, dataset, queue, doneTotal, loadError, refreshQueue }}>
            {children}
        </PartsDataContext.Provider>
    );
}

export function usePartsData(): PartsDataContextValue {
    const ctx = useContext(PartsDataContext);
    if (!ctx) {
        throw new Error("usePartsData must be used within a PartsDataProvider");
    }
    return ctx;
}
