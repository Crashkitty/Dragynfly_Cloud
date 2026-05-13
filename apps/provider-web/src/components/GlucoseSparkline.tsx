import type { GlucoseReading } from "@dragonfly/shared";

interface Props {
  readings: GlucoseReading[];
}

export function GlucoseSparkline({ readings }: Props) {
  if (readings.length === 0) {
    return (
      <div style={{ color: "var(--color-secondary)", fontSize: 14 }}>
        No glucose data to chart.
      </div>
    );
  }

  // Reverse so x increases with time
  const points = [...readings].reverse();
  const width = 600;
  const height = 80;
  const min = Math.min(...points.map((p) => p.valueMgDl), 60);
  const max = Math.max(...points.map((p) => p.valueMgDl), 220);
  const xStep = points.length > 1 ? width / (points.length - 1) : width;

  const path = points
    .map((p, i) => {
      const x = i * xStep;
      const y = height - ((p.valueMgDl - min) / Math.max(max - min, 1)) * height;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // Target band lines
  const yFor = (v: number) => height - ((v - min) / Math.max(max - min, 1)) * height;
  const targetLow = yFor(70);
  const targetHigh = yFor(180);

  return (
    <svg className="spark-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <rect
        x={0}
        y={Math.min(targetHigh, targetLow)}
        width={width}
        height={Math.abs(targetLow - targetHigh)}
        fill="rgba(46, 107, 71, 0.08)"
      />
      <line x1={0} x2={width} y1={targetLow} y2={targetLow} stroke="#2e6b47" strokeDasharray="4 4" strokeWidth={1} />
      <line x1={0} x2={width} y1={targetHigh} y2={targetHigh} stroke="#8f5215" strokeDasharray="4 4" strokeWidth={1} />
      <path d={path} fill="none" stroke="#0e5a6f" strokeWidth={2} />
      {points.map((p, i) => {
        const x = i * xStep;
        const y = yFor(p.valueMgDl);
        const color = p.status === "ok" ? "#2e6b47" : p.status === "warn" ? "#8f5215" : "#b23121";
        return <circle key={p.id} cx={x} cy={y} r={3} fill={color} />;
      })}
    </svg>
  );
}
