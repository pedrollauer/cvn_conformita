import { useEffect, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { getConsoleSnapshot } from "../api";
import "./ConsoleView.css";

const POLL_INTERVAL_MS = 1500;

export function ConsoleView() {
    const [lines, setLines] = useState<string[]>([]);
    const [connected, setConnected] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);

    // Polls the full backlog rather than streaming it (see app.ts's /console/snapshot comment) -
    // simpler and more robust than a long-lived SSE connection, at the cost of a ~1.5s delay
    // instead of an instant push, which is plenty fast for a human reading log lines.
    useEffect(() => {
        let cancelled = false;

        async function poll() {
            try {
                const { lines: snapshot } = await getConsoleSnapshot();
                if (!cancelled) {
                    setLines(snapshot);
                    setConnected(true);
                }
            } catch (err) {
                console.error("[ConsoleView] snapshot fetch failed:", err);
                if (!cancelled) {
                    setConnected(false);
                }
            }
        }

        poll();
        const timer = setInterval(poll, POLL_INTERVAL_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, []);

    // Only auto-scrolls if the viewer was already at the bottom - so scrolling up to read
    // earlier output isn't constantly yanked back down by new lines arriving.
    useEffect(() => {
        if (stickToBottomRef.current && outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    function handleScroll() {
        const el = outputRef.current;
        if (!el) return;
        stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    }

    return (
        <div className="console-view">
            <PageHeader title="Console" />
            <div className="console-body">
                <div className="console-status">
                    <span className={`console-status-dot ${connected ? "console-status-dot-live" : ""}`} />
                    {connected ? "Live" : "Connecting…"}
                </div>
                <div className="console-output" ref={outputRef} onScroll={handleScroll}>
                    {lines.length === 0 ? (
                        <p className="console-empty">No output yet.</p>
                    ) : (
                        lines.map((line, index) => (
                            <div key={index} className="console-line">
                                {line}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
