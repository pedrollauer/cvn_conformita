import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { addFamilyToQueue, addToQueue, addToQueueByCode, listQueue } from "../api";
import type { QueueJob } from "../types";
import "./AddQueuePane.css";

type Mode = "search" | "family" | "spreadsheet";

/** Parses "code,path" lines from a pasted/uploaded CSV, skipping a header row if present. */
function parseCsv(text: string): Array<{ code: string; path: string }> {
    const rows: Array<{ code: string; path: string }> = [];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    for (const line of lines) {
        const [code, path] = line.split(",").map((cell) => cell?.trim() ?? "");
        if (!code || !path) {
            continue;
        }
        if (rows.length === 0 && code.toLowerCase() === "code" && path.toLowerCase() === "path") {
            continue; // header row
        }
        rows.push({ code, path });
    }
    return rows;
}

export function AddQueuePane() {
    const [mode, setMode] = useState<Mode>("search");
    const [queue, setQueue] = useState<QueueJob[]>([]);
    const [searchCode, setSearchCode] = useState("");
    const [familyPattern, setFamilyPattern] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    // Ticks while a request is in flight so "busy" never looks indistinguishable from "hung" -
    // some of these (e.g. "add family" over a big pattern) can legitimately take a minute or more.
    useEffect(() => {
        if (busy) {
            setElapsedSeconds(0);
            elapsedTimer.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
        } else if (elapsedTimer.current) {
            clearInterval(elapsedTimer.current);
            elapsedTimer.current = null;
        }
        return () => {
            if (elapsedTimer.current) {
                clearInterval(elapsedTimer.current);
                elapsedTimer.current = null;
            }
        };
    }, [busy]);

    function refresh() {
        listQueue()
            .then(setQueue)
            .catch((err) => setStatus(`Failed to load queue: ${err instanceof Error ? err.message : String(err)}`));
    }

    useEffect(() => {
        refresh();
    }, []);

    async function handleAddByCode(event: FormEvent) {
        event.preventDefault();
        if (!searchCode.trim()) {
            return;
        }
        setBusy(true);
        setStatus(null);
        try {
            const job = await addToQueueByCode(searchCode.trim());
            setSearchCode("");
            setStatus(`Found in PDM and queued: ${job.path}`);
            refresh();
        } catch (err) {
            setStatus(`Failed to add: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setBusy(false);
        }
    }

    async function handleAddFamily(event: FormEvent) {
        event.preventDefault();
        if (!familyPattern.trim()) {
            return;
        }
        setBusy(true);
        setStatus(null);
        try {
            const jobs = await addFamilyToQueue(familyPattern.trim());
            setFamilyPattern("");
            setStatus(`Queued ${jobs.length} approved CAD file(s) matching "${familyPattern.trim()}".`);
            refresh();
        } catch (err) {
            setStatus(`Failed to add: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setBusy(false);
        }
    }

    async function handleSpreadsheet(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        const text = await file.text();
        const rows = parseCsv(text);
        if (rows.length === 0) {
            setStatus("No valid rows found (expected one 'code,path' pair per line).");
            return;
        }
        setBusy(true);
        setStatus(null);
        let ok = 0;
        let failed = 0;
        for (const row of rows) {
            try {
                await addToQueue(row);
                ok++;
            } catch {
                failed++;
            }
        }
        setBusy(false);
        setStatus(`Added ${ok} job(s)${failed > 0 ? `, ${failed} failed` : ""}.`);
        refresh();
    }

    return (
        <div className="add-queue-pane">
            <div className="add-queue-header">
                <h2>Add to queue</h2>
                <span className="add-queue-count">{queue.length} queued</span>
            </div>

            <div className="add-queue-tabs">
                <button
                    type="button"
                    className={mode === "search" ? "active" : ""}
                    onClick={() => setMode("search")}
                >
                    Search PDM
                </button>
                <button
                    type="button"
                    className={mode === "family" ? "active" : ""}
                    onClick={() => setMode("family")}
                >
                    Add family
                </button>
                <button
                    type="button"
                    className={mode === "spreadsheet" ? "active" : ""}
                    onClick={() => setMode("spreadsheet")}
                >
                    Add spreadsheet
                </button>
            </div>

            {mode === "search" ? (
                <form className="add-queue-form" onSubmit={handleAddByCode}>
                    <label>
                        Code
                        <input
                            value={searchCode}
                            onChange={(e) => setSearchCode(e.target.value)}
                            placeholder="e.g. 731110143578.SLDPRT"
                        />
                    </label>
                    <button type="submit" disabled={busy}>
                        Find &amp; add
                    </button>
                </form>
            ) : mode === "family" ? (
                <form className="add-queue-form" onSubmit={handleAddFamily}>
                    <label>
                        Pattern (approved files under CAD)
                        <input
                            value={familyPattern}
                            onChange={(e) => setFamilyPattern(e.target.value)}
                            placeholder="e.g. 22*"
                        />
                    </label>
                    <button type="submit" disabled={busy}>
                        Add family
                    </button>
                </form>
            ) : (
                <div className="add-queue-form">
                    <label>
                        CSV file (columns: code, path)
                        <input type="file" accept=".csv,text/csv" onChange={handleSpreadsheet} disabled={busy} />
                    </label>
                </div>
            )}

            {busy && (
                <p className="add-queue-running">
                    <span className="add-queue-spinner" aria-hidden="true" />
                    Working… {elapsedSeconds}s
                </p>
            )}

            {status && <p className="add-queue-status">{status}</p>}

            <ul className="add-queue-list">
                {queue.slice(0, 6).map((job) => (
                    <li key={job.id}>
                        <span className="add-queue-list-code">{job.code}</span>
                        <span className="add-queue-list-path">{job.path}</span>
                    </li>
                ))}
                {queue.length === 0 && <li className="add-queue-empty">Queue is empty</li>}
            </ul>
        </div>
    );
}
