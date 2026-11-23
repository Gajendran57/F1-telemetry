import { useEffect, useMemo, useState } from 'react';
import { fetchSessionLaps } from './api/client';
import {
  analyseCorners, compareCorners, computeDeltaT, deriveCurvature, verify,
} from './lib/analysis';
import { formatDelta, formatLapTime } from './lib/format';
import { TelemetryChart } from './components/TelemetryChart';
import { TrajectoryMap } from './components/TrajectoryMap';
import { CornerTable } from './components/CornerTable';
import { VerifierPanel } from './components/VerifierPanel';
import type { LapTelemetry } from './types/telemetry';

type Tab = 'delta' | 'speed' | 'trajectory' | 'corners' | 'verifier';
type Source = 'backend' | 'synthetic';

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#e10600', MEDIUM: '#ffd43b', HARD: '#e8e8ee',
  INTERMEDIATE: '#3bc97a', WET: '#3b82f6',
};

const lapLabel = (l: LapTelemetry) => `${l.driver} · L${l.lapNumber}`;

export default function App() {
  const [laps, setLaps] = useState<LapTelemetry[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refId, setRefId] = useState('');
  const [cmpId, setCmpId] = useState('');
  const [tab, setTab] = useState<Tab>('delta');
  const [colorBySpeed, setColorBySpeed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSessionLaps()
      .then(({ laps, source }) => {
        if (cancelled) return;
        setLaps(laps);
        setSource(source);
        setRefId(`${laps[0].driver}-${laps[0].lapNumber}`);
        setCmpId(`${laps[Math.min(2, laps.length - 1)].driver}-${laps[Math.min(2, laps.length - 1)].lapNumber}`);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, []);

  const lapKey = (l: LapTelemetry) => `${l.driver}-${l.lapNumber}`;
  const reference = laps.find((l) => lapKey(l) === refId) ?? laps[0];
  const comparison = laps.find((l) => lapKey(l) === cmpId) ?? laps[Math.min(2, laps.length - 1)];

  const analysis = useMemo(() => {
    if (!reference || !comparison) return null;
    const refCurvature = deriveCurvature(reference.samples);
    const cmpCurvature = deriveCurvature(comparison.samples);
    const refCorners = analyseCorners(reference, refCurvature);
    const cmpCorners = analyseCorners(comparison, cmpCurvature);
    const deltaT = computeDeltaT(reference, comparison);
    const cornerDeltas = compareCorners(refCorners, cmpCorners);
    const report = verify(laps, refCorners, cmpCorners, deltaT);
    return { refCorners, cmpCorners, deltaT, cornerDeltas, report };
  }, [reference, comparison, laps]);

  if (loading) return <div className="app-loading">Loading telemetry…</div>;
  if (error) return <div className="app-loading error">{error}</div>;
  if (!reference || !comparison || !analysis) return null;

  const { deltaT, refCorners, cornerDeltas, report } = analysis;
  const finalDelta = deltaT[deltaT.length - 1]?.delta ?? 0;
  const slowestCorner = refCorners.reduce((min, c) => (c.minSpeed < min.minSpeed ? c : min), refCorners[0]);

  const deltaSeries = [{
    label: 'Δ vs comparison', color: '#e10600',
    points: deltaT.map((p) => [p.distance, p.delta] as [number, number]),
    fillTo: 0,
  }];

  const speedSeries = [
    { label: `Ref ${lapLabel(reference)}`, color: '#00d2be',
      points: reference.samples.map((s) => [s.distance, s.speed] as [number, number]) },
    { label: `Cmp ${lapLabel(comparison)}`, color: '#ff8700',
      points: comparison.samples.map((s) => [s.distance, s.speed] as [number, number]), dashed: true },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-dot" />F1 Telemetry Analysis &amp; Verifier</div>
        <div className="topbar-meta">
          {source === 'backend' ? 'FastAPI backend' : 'Synthetic dataset'}
        </div>
      </header>

      <section className="controls">
        <label className="control">
          <span>Reference lap</span>
          <select value={refId} onChange={(e) => setRefId(e.target.value)}>
            {laps.map((l) => (
              <option key={lapKey(l)} value={lapKey(l)}>
                {lapLabel(l)} — {formatLapTime(l.lapTime)} ({l.compound})
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span>Comparison lap</span>
          <select value={cmpId} onChange={(e) => setCmpId(e.target.value)}>
            {laps.map((l) => (
              <option key={lapKey(l)} value={lapKey(l)}>
                {lapLabel(l)} — {formatLapTime(l.lapTime)} ({l.compound})
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="stats">
        <div className="stat">
          <span className="stat-label">Reference</span>
          <span className="stat-value">{formatLapTime(reference.lapTime)}</span>
          <span className="stat-sub" style={{ color: COMPOUND_COLOR[reference.compound] }}>{reference.compound}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Comparison</span>
          <span className="stat-value">{formatLapTime(comparison.lapTime)}</span>
          <span className="stat-sub" style={{ color: COMPOUND_COLOR[comparison.compound] }}>{comparison.compound}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Final Δ-T</span>
          <span className={`stat-value ${finalDelta > 0 ? 'negative' : 'positive'}`}>{formatDelta(finalDelta)} s</span>
          <span className="stat-sub">reference − comparison</span>
        </div>
        <div className="stat">
          <span className="stat-label">Min cornering speed</span>
          <span className="stat-value">{slowestCorner.minSpeed.toFixed(1)} km/h</span>
          <span className="stat-sub">T{slowestCorner.corner} · gear {slowestCorner.gearAtApex}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Corners detected</span>
          <span className="stat-value">{refCorners.length}</span>
          <span className="stat-sub">from GPS curvature</span>
        </div>
        <div className="stat">
          <span className="stat-label">Verifier</span>
          <span className="stat-value">{report.passed}/{report.totalChecks}</span>
          <span className="stat-sub">{report.failed} failed · {report.warned} warnings</span>
        </div>
      </section>

      <nav className="tabs">
        {([['delta', 'Delta-T'], ['speed', 'Speed trace'], ['trajectory', 'GPS trajectory'],
           ['corners', 'Apex & braking'], ['verifier', 'Verifier']] as Array<[Tab, string]>).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      <main className="panel">
        {tab === 'delta' && (
          <div className="panel-inner">
            <h2>Delta-T — {lapLabel(reference)} vs {lapLabel(comparison)}</h2>
            <p className="panel-note">Positive values mean the reference lap is losing time at that point on the circuit.</p>
            <TelemetryChart series={deltaSeries} xLabel="Distance (m)" yLabel="Δ (s)"
              height={320} valueFormatter={(v) => v.toFixed(3)} />
          </div>
        )}
        {tab === 'speed' && (
          <div className="panel-inner">
            <h2>Speed trace</h2>
            <TelemetryChart series={speedSeries} xLabel="Distance (m)" yLabel="Speed (km/h)"
              height={320} valueFormatter={(v) => v.toFixed(0)} />
          </div>
        )}
        {tab === 'trajectory' && (
          <div className="panel-inner">
            <div className="panel-head">
              <h2>GPS trajectory</h2>
              <label className="toggle">
                <input type="checkbox" checked={colorBySpeed} onChange={(e) => setColorBySpeed(e.target.checked)} />
                <span>Colour reference by speed</span>
              </label>
            </div>
            <TrajectoryMap reference={reference} comparison={comparison} corners={refCorners} colorBySpeed={colorBySpeed} />
          </div>
        )}
        {tab === 'corners' && (
          <div className="panel-inner">
            <h2>Apex positioning, braking points &amp; minimum cornering speed</h2>
            <p className="panel-note">
              Corner boundaries derived from GPS curvature (radius &lt; 350 m). Brake point is the
              first braking sample in the 300 m preceding each apex.
            </p>
            <CornerTable corners={refCorners} deltas={cornerDeltas} />
          </div>
        )}
        {tab === 'verifier' && (
          <div className="panel-inner">
            <h2>Verifier report</h2>
            <VerifierPanel report={report} />
          </div>
        )}
      </main>
    </div>
  );
}
