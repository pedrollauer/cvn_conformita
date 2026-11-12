import { useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import "./HvSlider.css";

export type HvRange = [number, number];

interface HvSliderProps {
    value: HvRange;
    onChange: (value: HvRange) => void;
    min: number;
    max: number;
}

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
}

/** Text field for one end of the slider's draggable window (see HvSlider's `trackMin`/`trackMax`)
 * - not a live mirror of the thumbs. It only reflects what was last typed here (or the initial
 * value on mount); dragging the thumbs afterwards moves the selection within that window but
 * must not budge this input. Edits are kept in local state while typing and only
 * clamped/committed via onCommit on blur or Enter, so a user can't be fighting the field while
 * mid-edit (e.g. selecting the text to retype it). */
function HvBoundInput({
    value,
    min,
    max,
    label,
    onCommit,
}: {
    value: number;
    min: number;
    max: number;
    label: string;
    onCommit: (next: number) => void;
}) {
    const [draft, setDraft] = useState(String(value));

    function commit() {
        const parsed = Number(draft);
        const next = Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : value;
        setDraft(String(next));
        if (next !== value) onCommit(next);
    }

    return (
        <label className="hv-slider-input-group">
            <span>HV</span>
            <input
                type="number"
                aria-label={label}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        commit();
                        e.currentTarget.blur();
                    }
                }}
                className="hv-slider-number-input"
            />
        </label>
    );
}

export function HvSlider({ value, onChange, min, max }: HvSliderProps) {
    const [low, high] = value;

    // The slider's own draggable window - independent of `min`/`max` (the absolute dataset
    // bounds, used only to clamp how far it can be typed back out) and, after mount, of `value`
    // (the live selection/thumb positions). Typing into the HV inputs redefines this window *and*
    // resets the selection to span all of it ("the whole slider becomes HV9000-HV9297"); dragging
    // the thumbs afterwards only moves the selection within this window and never touches it -
    // that's what keeps the inputs from budging on drag. Starting it from `value` (rather than
    // `min`/`max`) means a restored/default selection (see PartsView's HV range cookie) is what
    // the whole slider shows on load, not the full dataset span with the thumbs tucked inside it.
    const [trackMin, setTrackMin] = useState(low);
    const [trackMax, setTrackMax] = useState(high);

    function commitTrackMin(next: number) {
        const clamped = clamp(next, min, trackMax);
        setTrackMin(clamped);
        onChange([clamped, trackMax]);
    }

    function commitTrackMax(next: number) {
        const clamped = clamp(next, trackMin, max);
        setTrackMax(clamped);
        onChange([trackMin, clamped]);
    }

    return (
        <div className="hv-slider">
            <div className="hv-slider-row">
                <span className="hv-slider-bound">HV{trackMin}</span>
                <Slider.Root
                    className="hv-slider-root"
                    min={trackMin}
                    max={trackMax}
                    step={1}
                    value={value}
                    onValueChange={(next) => onChange([next[0] ?? low, next[1] ?? high])}
                >
                    <Slider.Track className="hv-slider-track">
                        <Slider.Range className="hv-slider-range" />
                    </Slider.Track>
                    <Slider.Thumb className="hv-slider-thumb" aria-label="Select HV range start" />
                    <Slider.Thumb className="hv-slider-thumb" aria-label="Select HV range end" />
                </Slider.Root>
                <span className="hv-slider-bound">HV{trackMax}</span>
            </div>
            <div className="hv-slider-inputs">
                <HvBoundInput
                    value={trackMin}
                    min={min}
                    max={trackMax}
                    label="HV range start"
                    onCommit={commitTrackMin}
                />
                <span className="hv-slider-input-sep">–</span>
                <HvBoundInput
                    value={trackMax}
                    min={trackMin}
                    max={max}
                    label="HV range end"
                    onCommit={commitTrackMax}
                />
            </div>
        </div>
    );
}
