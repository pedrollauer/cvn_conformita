import "./ChartPane.css";

export function ChartSpinner({ height }: { height: number }) {
    return (
        <div className="chart-spinner-wrap" style={{ height }}>
            <span className="chart-spinner" />
        </div>
    );
}
