import { useEffect, useState } from "react";
import "./ThemeToggle.css";

type Theme = "light" | "dark";
const STORAGE_KEY = "conformita-theme";

function resolveInitialTheme(): Theme {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "light" || stored === "dark") {
            return stored;
        }
    } catch {
        // localStorage unavailable (private browsing, disabled storage) - fall through to OS preference.
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function SunIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2.2M12 19.8V22M4.2 4.2l1.5 1.5M18.3 18.3l1.5 1.5M2 12h2.2M19.8 12H22M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M20.3 14.7A8.4 8.4 0 0 1 9.3 3.7a0.8 0.8 0 0 0-1-1A10 10 0 1 0 21.3 15.7a0.8 0.8 0 0 0-1-1Z" />
        </svg>
    );
}

/** Reads/sets `document.documentElement.dataset.theme`, which global.css keys its light/dark
 * variable blocks off. Starts from the stored choice, falling back to the OS preference, and
 * persists every explicit pick so it survives a reload. */
export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(resolveInitialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // ignore - nothing to persist to in private browsing
        }
    }, [theme]);

    const next = theme === "light" ? "dark" : "light";

    return (
        <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(next)}
            aria-label={`Switch to ${next} mode`}
            title={`Switch to ${next} mode`}
        >
            {theme === "light" ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}
