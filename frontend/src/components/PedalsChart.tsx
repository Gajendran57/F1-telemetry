import { useEffect, useMemo, useRef, useState } from 'react';
import type { LapTelemetry } from '../types/telemetry';

interface Props {
  reference: LapTelemetry;
  comparison: LapTelemetry;
  height?: number;
}

const PAD = { top: 22, right: 20, bottom: 40, left: 62 };
const GAP = 14;
const REF_COLOR = '#00d2be';
const CMP_COLOR = '#ff8700';
const BRAKE_COLOR = '#ff3355';

function nearestIdx(samples: LapTelemetry['samples'], distance: number): number {
  if (!samples.length) return 0;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].distance < distance) lo = mid;
    else hi = mid;
  }
  return Math.abs(samples[lo].distance - distance) < Math.abs(samples[hi].distance - distance)
    ? lo
    : hi;
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

function brakeRunsFor(lap: LapTelemetry): Array<{ start: number; end: number }> {
  const s = lap.samples;
  const out: Array<{ start: number; end: number }> = [];
  let startDist: number | null = null;
  for (let i = 0; i < s.length; i++) {
    if (s[i].brake && startDist === null) startDist = s[i].distance;
    if (!s[i].brake && startDist !== null) {
      out.push({ start: startDist, end: s[i - 1].distance });
      startDist = null;
    }
  }
  if (startDist !== null) out.push({ start: startDist, end: s[s.length - 1].distance });
  return out;
}

export function PedalsChart({ reference, comparison, height = 380 }: Props) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const innerW = Math.max(10, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const throttleH = (innerH - GAP) * 0.62;
  const brakeH = innerH - GAP - throttleH;

  const throttleTop = PAD.top;
  const throttleBottom = PAD.top + throttleH;
  const brakeTop = throttleBottom + GAP;
  const brakeBottom = PAD.top + innerH;

  const xMax = useMemo(() => {
    const a = reference.samples[reference.samples.length - 1]?.distance ?? 0;
    const b = comparison.samples[comparison.samples.length - 1]?.distance ?? 0;
    return Math.max(a, b, 1);
  }, [reference, comparison]);

  const sx = (d: number) => PAD.left + (d / xMax) * innerW;
  const syThrottle = (v: number) => throttleBottom - (v / 100) * throttleH;

  const throttleLine = (lap: LapTelemetry) => {
    const s = lap.samples;
    if (s.length === 0) return '';
    let d = `M ${sx(s[0].distance).toFixed(1)} ${syThrottle(s[0].throttle).toFixed(1)}`;
    for (let i = 1; i < s.length; i++) {
      d += ` L ${sx(s[i].distance).toFixed(1)} ${syThrottle(s[i].throttle).toFixed(1)}`;
    }
    return d;
  };

  const throttleArea = (lap: LapTelemetry) => {
    const s = lap.samples;
    if (s.length === 0) return '';
    let d = `M ${sx(s[0].distance).toFixed(1)} ${throttleBottom.toFixed(1)}`;
    for (const p of s) d += ` L ${sx(p.distance).toFixed(1)} ${syThrottle(p.throttle).toFixed(1)}`;
    d += ` L ${sx(s[s.length - 1].distance).toFixed(1)} ${throttleBottom.toFixed(1)} Z`;
    return d;
  };

  const runsRef = useMemo(() => brakeRunsFor(reference), [reference]);
  const runsCmp = useMemo(() => brakeRunsFor(comparison), [comparison]);

  const xTicks = niceTicks(0, xMax, 6);
  const throttleTicks = [0, 25, 50, 75, 100];

  const hasData = reference.samples.length > 0 || comparison.samples.length > 0;

  const hovered = useMemo(() => {
    if (!hasData || hoverX === null || hoverX < PAD.left || hoverX > PAD.left + innerW) return null;
    const dataX = ((hoverX - PAD.left) / innerW) * xMax;
    return {
      distance: dataX,
      ref: reference.samples[nearestIdx(reference.samples, dataX)],
      cmp: comparison.samples[nearestIdx(comparison.samples, dataX)],
    };
  }, [hoverX, reference, comparison, xMax, innerW, hasData]);

  return (
    <div className="chart" ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height}
        onPointerLeave={() => setHoverX(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverX(e.clientX - rect.left);
        }}>

        {/* ── Throttle panel ─────────────────────────────────────── */}
        <text x={PAD.left - 10} y={throttleTop + 4} textAnchor="end" className="chart-axis-label">
          Throttle %
        </text>

        {throttleTicks.map((t) => (
          <g key={`tt${t}`}>
            <line x1={PAD.left} x2={PAD.left + innerW} y1={syThrottle(t)} y2={syThrottle(t)}
              stroke="#26263a" strokeDasharray="3 4" />
            <text x={PAD.left - 10} y={syThrottle(t) + 4} textAnchor="end" className="chart-tick">
              {t}
            </text>
          </g>
        ))}

        <path d={throttleArea(reference)} fill={REF_COLOR} opacity={0.18} stroke="none" />
        <path d={throttleArea(comparison)} fill={CMP_COLOR} opacity={0.12} stroke="none" />
        <path d={throttleLine(reference)} fill="none" stroke={REF_COLOR} strokeWidth={2}
          strokeLinejoin="round" />
        <path d={throttleLine(comparison)} fill="none" stroke={CMP_COLOR} strokeWidth={2}
          strokeDasharray="5 4" strokeLinejoin="round" />

        {/* ── Brake panel ───────────────────────────────────────── */}
        <text x={PAD.left - 10} y={brakeTop + 4} textAnchor="end" className="chart-axis-label">
          Brake
        </text>

        <line x1={PAD.left} x2={PAD.left + innerW} y1={brakeBottom} y2={brakeBottom}
          stroke="#26263a" />
        <line x1={PAD.left} x2={PAD.left + innerW} y1={brakeTop + 4} y2={brakeTop + 4}
          stroke="#26263a" strokeDasharray="3 4" />

        {runsRef.map((r, i) => (
          <rect key={`brr${i}`} x={sx(r.start)} y={brakeTop + 6}
            width={Math.max(1, sx(r.end) - sx(r.start))}
            height={brakeH - 8}
            fill={REF_COLOR} opacity={0.42} />
        ))}
        {runsCmp.map((r, i) => (
          <rect key={`brc${i}`} x={sx(r.start)} y={brakeTop + 6}
            width={Math.max(1, sx(r.end) - sx(r.start))}
            height={(brakeH - 8) * 0.5}
            fill={CMP_COLOR} opacity={0.55} />
        ))}

        {/* ── X axis ────────────────────────────────────────────── */}
        {xTicks.map((t) => (
          <g key={`xt${t}`}>
            <line x1={sx(t)} x2={sx(t)} y1={PAD.top} y2={brakeBottom}
              stroke="#26263a" strokeDasharray="3 4" opacity={0.45} />
            <text x={sx(t)} y={brakeBottom + 18} textAnchor="middle" className="chart-tick">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {hoverX !== null && hovered && (
          <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={brakeBottom}
            stroke="#4a4a68" strokeDasharray="2 3" />
        )}

        <text x={PAD.left + innerW / 2} y={height - 4} textAnchor="middle"
          className="chart-axis-label">
          Distance (m)
        </text>
      </svg>

      <div className="pedals-legend">
        <span><i className="dot teal" /> {reference.driver} L{reference.lapNumber}</span>
        <span><i className="dot orange" /> {comparison.driver} L{comparison.lapNumber}</span>
        <span className="pedals-legend-hint">
          Top row = throttle · Bottom row = brake (teal = reference, orange = comparison)
        </span>
      </div>

      {!hasData && (
        <div className="chart-empty">No throttle or brake samples available.</div>
      )}
      {hoverX !== null && hovered && (
        <div className="chart-tooltip"
          style={{ left: Math.max(8, Math.min(hoverX + 14, width - 220)), top: 6 }}>
          <div className="tooltip-x">{Math.round(hovered.distance)} m</div>
          {hovered.ref && (
            <div className="tooltip-row">
              <span className="swatch" style={{ background: REF_COLOR }} />
              <span className="tooltip-label">{reference.driver}</span>
              <span className="tooltip-value">
                {hovered.ref.throttle.toFixed(0)}%
                {hovered.ref.brake && <span style={{ color: BRAKE_COLOR }}> • BRK</span>}
              </span>
            </div>
          )}
          {hovered.cmp && (
            <div className="tooltip-row">
              <span className="swatch" style={{ background: CMP_COLOR }} />
              <span className="tooltip-label">{comparison.driver}</span>
              <span className="tooltip-value">
                {hovered.cmp.throttle.toFixed(0)}%
                {hovered.cmp.brake && <span style={{ color: BRAKE_COLOR }}> • BRK</span>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
