import { useMemo } from 'react';
import type { CornerAnalysis, LapTelemetry } from '../types/telemetry';

interface Props {
  reference: LapTelemetry;
  comparison: LapTelemetry;
  corners: CornerAnalysis[];
  colorBySpeed: boolean;
}

const VIEW = 1000;
const PAD = 70;

function lerpColor(a: [number, number, number], b: [number, number, number], t: number) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

const SPEED_RAMP: Array<[number, number, number]> = [
  [45, 108, 223], [0, 200, 190], [120, 210, 60], [255, 200, 40], [225, 6, 0],
];

function rampColor(t: number): string {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (SPEED_RAMP.length - 1);
  const i = Math.min(SPEED_RAMP.length - 2, Math.floor(scaled));
  return lerpColor(SPEED_RAMP[i], SPEED_RAMP[i + 1], scaled - i);
}

export function TrajectoryMap({ reference, comparison, corners, colorBySpeed }: Props) {
  const geometry = useMemo(() => {
    const all = [...reference.samples, ...comparison.samples];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const s of all) {
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
    }
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min((VIEW - 2 * PAD) / spanX, (VIEW - 2 * PAD) / spanY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const project = (x: number, y: number): [number, number] => [
      VIEW / 2 + (x - cx) * scale,
      VIEW / 2 - (y - cy) * scale,
    ];
    return { project };
  }, [reference, comparison]);

  const { project } = geometry;

  const pathFor = (lap: LapTelemetry) =>
    lap.samples.map((s, i) => {
      const [px, py] = project(s.x, s.y);
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(' ');

  const speedBands = useMemo(() => {
    if (!colorBySpeed) return [];
    const speeds = reference.samples.map((s) => s.speed);
    const minV = Math.min(...speeds);
    const maxV = Math.max(...speeds);
    const bins = 10;
    const paths: Array<{ d: string; color: string }> = [];
    let current = '';
    let currentBin = -1;
    const samples = reference.samples;
    for (let i = 0; i < samples.length - 1; i++) {
      const t = (samples[i].speed - minV) / (maxV - minV || 1);
      const bin = Math.min(bins - 1, Math.floor(t * bins));
      const [x0, y0] = project(samples[i].x, samples[i].y);
      const [x1, y1] = project(samples[i + 1].x, samples[i + 1].y);
      if (bin !== currentBin) {
        if (current) paths.push({ d: current, color: rampColor(currentBin / (bins - 1)) });
        current = `M ${x0.toFixed(1)} ${y0.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
        currentBin = bin;
      } else {
        current += ` L ${x1.toFixed(1)} ${y1.toFixed(1)}`;
      }
    }
    if (current) paths.push({ d: current, color: rampColor(currentBin / (bins - 1)) });
    return paths;
  }, [reference, project, colorBySpeed]);

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="track-map">
        <defs>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d={pathFor(comparison)} fill="none" stroke="#2a2a3d" strokeWidth={12}
          strokeLinejoin="round" strokeLinecap="round" />
        {colorBySpeed ? (
          speedBands.map((band, i) => (
            <path key={i} d={band.d} fill="none" stroke={band.color} strokeWidth={5}
              strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />
          ))
        ) : (
          <path d={pathFor(reference)} fill="none" stroke="#00d2be" strokeWidth={4}
            strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />
        )}
        <path d={pathFor(comparison)} fill="none" stroke="#ff8700" strokeWidth={2}
          strokeDasharray="7 6" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
        {corners.map((c) => {
          const [px, py] = project(c.apexX, c.apexY);
          return (
            <g key={c.corner}>
              <circle cx={px} cy={py} r={9} fill="#0d0d11" stroke="#e10600" strokeWidth={2} />
              <text x={px} y={py + 4} textAnchor="middle" className="apex-label">{c.corner}</text>
            </g>
          );
        })}
        {(() => {
          const [px, py] = project(reference.samples[0].x, reference.samples[0].y);
          return <circle cx={px} cy={py} r={6} fill="#ffffff" />;
        })()}
      </svg>
      <div className="map-legend">
        <span><i className="dot teal" /> {reference.driver} L{reference.lapNumber}</span>
        <span><i className="dot orange" /> {comparison.driver} L{comparison.lapNumber}</span>
        {colorBySpeed && <span className="map-legend-hint">Colour = speed (blue slow → red fast)</span>}
      </div>
    </div>
  );
}
