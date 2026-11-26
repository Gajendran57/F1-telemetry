import { useMemo } from 'react';
import type { CircuitOutline, CornerAnalysis, LapTelemetry } from '../types/telemetry';

interface Props {
  reference: LapTelemetry;
  comparison: LapTelemetry;
  corners: CornerAnalysis[];
  colorBySpeed: boolean;
  showBrakingZones?: boolean;
  circuit?: CircuitOutline | null;
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

const fmtKm = (metres: number) => `${(metres / 1000).toFixed(2)} km`;

export function TrajectoryMap({
  reference,
  comparison,
  corners,
  colorBySpeed,
  showBrakingZones = false,
  circuit,
}: Props) {
  const geometry = useMemo(() => {
    // The circuit is the reference frame. Laps and apexes only extend the
    // bounds slightly, so the outline is never cropped and the GPS traces sit
    // exactly on the selected circuit.
    const points: Array<[number, number]> = [
      ...(circuit?.points ?? []),
      ...reference.samples.map((s) => [s.x, s.y] as [number, number]),
      ...comparison.samples.map((s) => [s.x, s.y] as [number, number]),
      ...corners.map((c) => [c.apexX, c.apexY] as [number, number]),
    ].filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!points.length) {
      return { project: (x: number, y: number): [number, number] => [x, y], scale: 1 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of points) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
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
    return { project, scale };
  }, [circuit, reference, comparison, corners]);

  const { project, scale } = geometry;

  const circuitPath = useMemo(() => {
    if (!circuit?.points.length) return '';
    return circuit.points.map(([x, y], i) => {
      const [px, py] = project(x, y);
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(' ') + ' Z';
  }, [circuit, project]);

  const pathFor = (lap: LapTelemetry) =>
    lap.samples.map((s, i) => {
      const [px, py] = project(s.x, s.y);
      return `${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`;
    }).join(' ');

  const speedBands = useMemo(() => {
    if (!colorBySpeed || reference.samples.length < 2) return [];
    const speeds = reference.samples.map((s) => s.speed);
    const minV = Math.min(...speeds);
    const maxV = Math.max(...speeds);
    const bins = 10;
    const paths: Array<{ d: string; color: string }> = [];
    const samples = reference.samples;
    let current = '';
    let currentBin = -1;
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

  const brakeZones = useMemo(() => {
    if (!showBrakingZones) return [];
    return corners
      .filter((c) => c.brakePoint !== null && c.brakeRelease !== null)
      .map((c) => {
        let d = '';
        for (const s of reference.samples) {
          if (s.distance >= c.brakePoint! && s.distance <= c.brakeRelease!) {
            const [px, py] = project(s.x, s.y);
            d += d ? ` L ${px.toFixed(1)} ${py.toFixed(1)}`
                   : `M ${px.toFixed(1)} ${py.toFixed(1)}`;
          }
        }
        return d ? { corner: c.corner, d } : null;
      })
      .filter((x): x is { corner: number; d: string } => x !== null);
  }, [corners, reference, project, showBrakingZones]);

  const scaleBar = useMemo(() => {
    const candidates = [1000, 500, 200, 100, 50];
    const metres = candidates.find((m) => m * scale < 180) ?? 50;
    return { metres, width: metres * scale };
  }, [scale]);

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="track-map"
        role="img"
        aria-label={circuit
          ? `${circuit.name} circuit with ${reference.driver} lap ${reference.lapNumber} GPS trace`
          : 'GPS trajectory'}>
        <defs>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {circuitPath && (
          <>
            <path d={circuitPath} fill="none" stroke="#2b2b40" strokeWidth={16}
              strokeLinejoin="round" />
            <path d={circuitPath} fill="none" stroke="#4a4a66" strokeWidth={2}
              strokeDasharray="2 8" strokeLinejoin="round" />
          </>
        )}

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

        {brakeZones.map((zone) => (
          <path key={`bz-${zone.corner}`} d={zone.d} fill="none" stroke="#ff3355"
            strokeWidth={7} strokeLinecap="round" opacity={0.78} />
        ))}

        {corners.map((c) => {
          const [px, py] = project(c.apexX, c.apexY);
          return (
            <g key={c.corner}>
              <circle cx={px} cy={py} r={9} fill="#0d0d11" stroke="#e10600" strokeWidth={2} />
              <text x={px} y={py + 4} textAnchor="middle" className="apex-label">{c.corner}</text>
            </g>
          );
        })}
        {reference.samples.length > 0 && (() => {
          const [px, py] = project(reference.samples[0].x, reference.samples[0].y);
          return <circle cx={px} cy={py} r={6} fill="#ffffff" />;
        })()}

        <g className="map-scale" transform={`translate(${VIEW - PAD - scaleBar.width} ${VIEW - 30})`}>
          <line x1={0} x2={scaleBar.width} y1={0} y2={0} stroke="#a3a3b8" strokeWidth={2} />
          <line x1={0} x2={0} y1={-5} y2={5} stroke="#a3a3b8" strokeWidth={2} />
          <line x1={scaleBar.width} x2={scaleBar.width} y1={-5} y2={5}
            stroke="#a3a3b8" strokeWidth={2} />
          <text x={scaleBar.width / 2} y={-10} textAnchor="middle" className="map-scale-label">
            {scaleBar.metres >= 1000 ? `${scaleBar.metres / 1000} km` : `${scaleBar.metres} m`}
          </text>
        </g>
      </svg>
      <div className="map-legend">
        {circuit && (
          <span title={circuit.name}>
            <i className="line-swatch" /> {circuit.name} · {fmtKm(circuit.length)}
          </span>
        )}
        <span><i className="dot teal" /> {reference.driver} L{reference.lapNumber}</span>
        <span><i className="dot orange" /> {comparison.driver} L{comparison.lapNumber}</span>
        {showBrakingZones && (
          <span><i className="dot red" /> Braking zone</span>
        )}
        {colorBySpeed && (
          <span className="speed-legend-inline">
            <span>Slow</span>
            <span className="speed-gradient" />
            <span>Fast</span>
          </span>
        )}
        {circuit?.source === 'telemetry' && (
          <span className="map-legend-hint">Circuit outline estimated from GPS</span>
        )}
      </div>
    </div>
  );
}
