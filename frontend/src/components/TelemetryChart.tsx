import { useEffect, useMemo, useRef, useState } from 'react';

export interface ChartSeries {
  label: string;
  color: string;
  points: Array<[number, number]>;
  dashed?: boolean;
  fillTo?: number;
  width?: number;
}

interface Props {
  series: ChartSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  valueFormatter?: (v: number) => string;
  invertY?: boolean;
}

const PAD = { top: 18, right: 20, bottom: 36, left: 62 };

function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function nearestIndex(points: Array<[number, number]>, x: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < x) lo = mid; else hi = mid;
  }
  return Math.abs(points[lo][0] - x) < Math.abs(points[hi][0] - x) ? lo : hi;
}

export function TelemetryChart({
  series, xLabel, yLabel, height = 280,
  valueFormatter = (v) => v.toFixed(2), invertY = false,
}: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;

  const domain = useMemo(() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    for (const s of series) for (const [x, y] of s.points) {
      if (x < xMin) xMin = x; if (x > xMax) xMax = x;
      if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    }
    if (!Number.isFinite(xMin)) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    const yPad = (yMax - yMin || 1) * 0.1;
    return { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad };
  }, [series]);

  const sx = (x: number) => PAD.left + ((x - domain.xMin) / (domain.xMax - domain.xMin || 1)) * innerW;
  const syRaw = (y: number) => PAD.top + innerH - ((y - domain.yMin) / (domain.yMax - domain.yMin || 1)) * innerH;
  const sy = (y: number) => (invertY ? PAD.top + innerH - (syRaw(y) - PAD.top) : syRaw(y));

  const pathFor = (pts: Array<[number, number]>) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${sx(x).toFixed(2)} ${sy(y).toFixed(2)}`).join(' ');

  const fillPathFor = (pts: Array<[number, number]>, baseline: number) => {
    if (pts.length === 0) return '';
    const first = pts[0], last = pts[pts.length - 1];
    return (
      `M ${sx(first[0]).toFixed(2)} ${sy(baseline).toFixed(2)} ` +
      pts.map(([x, y]) => `L ${sx(x).toFixed(2)} ${sy(y).toFixed(2)}`).join(' ') +
      ` L ${sx(last[0]).toFixed(2)} ${sy(baseline).toFixed(2)} Z`
    );
  };

  const xTicks = niceTicks(domain.xMin, domain.xMax, 6);
  const yTicks = niceTicks(domain.yMin, domain.yMax, 5);

  const hasData = series.some((s) => s.points.length > 0);

  const hovered = useMemo(() => {
    if (hoverX === null || !hasData) return null;
    const px = hoverX - PAD.left;
    const dataX = domain.xMin + (px / innerW) * (domain.xMax - domain.xMin);
    const rows = series
      .filter((s) => s.points.length > 0)
      .map((s) => {
        const idx = nearestIndex(s.points, dataX);
        return { label: s.label, color: s.color, value: s.points[idx][1] };
      });
    return { dataX, rows };
  }, [hoverX, series, domain, innerW, hasData]);

  return (
    <div className="chart" ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height}
        onPointerLeave={() => setHoverX(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverX(e.clientX - rect.left);
        }}>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={sy(t)} y2={sy(t)}
              stroke="#26263a" strokeDasharray="3 4" />
            <text x={PAD.left - 10} y={sy(t) + 4} textAnchor="end"
              className="chart-tick">{valueFormatter(t)}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={PAD.top} y2={PAD.top + innerH}
              stroke="#26263a" strokeDasharray="3 4" />
            <text x={sx(t)} y={PAD.top + innerH + 20} textAnchor="middle"
              className="chart-tick">{Math.round(t)}</text>
          </g>
        ))}
        {series.filter((s) => s.fillTo !== undefined).map((s) => (
          <path key={`fill-${s.label}`} d={fillPathFor(s.points, s.fillTo ?? 0)}
            fill={s.color} opacity={0.14} stroke="none" />
        ))}
        {series.map((s) => (
          <path key={s.label} d={pathFor(s.points)} fill="none" stroke={s.color}
            strokeWidth={s.width ?? 2} strokeDasharray={s.dashed ? '6 5' : undefined}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hoverX !== null && hovered && hoverX >= PAD.left && hoverX <= PAD.left + innerW && (
          <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + innerH}
            stroke="#4a4a68" strokeDasharray="2 3" />
        )}
        <text x={PAD.left + innerW / 2} y={height - 4} textAnchor="middle"
          className="chart-axis-label">{xLabel}</text>
        <text x={14} y={PAD.top + innerH / 2} textAnchor="middle"
          transform={`rotate(-90 14 ${PAD.top + innerH / 2})`}
          className="chart-axis-label">{yLabel}</text>
      </svg>
      {!hasData && (
        <div className="chart-empty">No telemetry samples available for this comparison.</div>
      )}
      {hoverX !== null && hovered && hoverX >= PAD.left && hoverX <= PAD.left + innerW && (
        <div className="chart-tooltip"
          style={{ left: Math.max(8, Math.min(hoverX + 14, width - 200)), top: 6 }}>
          <div className="tooltip-x">{Math.round(hovered.dataX)} m</div>
          {hovered.rows.map((r) => (
            <div className="tooltip-row" key={r.label}>
              <span className="swatch" style={{ background: r.color }} />
              <span className="tooltip-label">{r.label}</span>
              <span className="tooltip-value">{valueFormatter(r.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
