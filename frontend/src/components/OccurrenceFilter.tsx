import type { OccurrenceRange } from "../types";
import "./OccurrenceFilter.css";

interface OccurrenceFilterProps {
    value: OccurrenceRange;
    onChange: (value: OccurrenceRange) => void;
}

/** Filters parts by how many HV projects they're used in (see journey.db's part_usage view). */
export function OccurrenceFilter({ value, onChange }: OccurrenceFilterProps) {
    return (
        <div className="occurrence-filter">
            <span className="occurrence-filter-label">Occurrences</span>
            <label>
                Min
                <input
                    type="number"
                    min={0}
                    value={value.min}
                    onChange={(event) => {
                        const min = Math.max(0, Number(event.target.value) || 0);
                        onChange({ ...value, min });
                    }}
                />
            </label>
            <label>
                Max
                <input
                    type="number"
                    min={0}
                    placeholder="Any"
                    value={value.max ?? ""}
                    onChange={(event) => {
                        const raw = event.target.value;
                        const max = raw === "" ? null : Math.max(0, Number(raw) || 0);
                        onChange({ ...value, max });
                    }}
                />
            </label>
        </div>
    );
}
