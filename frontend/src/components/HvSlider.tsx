import * as Slider from "@radix-ui/react-slider";
import "./HvSlider.css";

export type HvRange = [number, number];

interface HvSliderProps {
    value: HvRange;
    onChange: (value: HvRange) => void;
    min: number;
    max: number;
}

export function HvSlider({ value, onChange, min, max }: HvSliderProps) {
    const [low, high] = value;

    return (
        <div className="hv-slider">
            <span className="hv-slider-bound">HV{min}</span>
            <Slider.Root
                className="hv-slider-root"
                min={min}
                max={max}
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
            <span className="hv-slider-bound">HV{max}</span>
            <span className="hv-slider-value">
                HV{low}–HV{high}
            </span>
        </div>
    );
}
