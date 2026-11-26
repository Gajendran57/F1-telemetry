import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { fetchOptions, fetchSessionLaps } from './api/client';
import {
  analyseCorners, compareCorners, computeDeltaT, deriveCurvature, verify,
} from './lib/analysis';
import { formatDelta, formatLapTime } from './lib/format';
import { TABS, tabFromHash, type TabId } from './lib/tabs';
import { TelemetryChart } from './components/TelemetryChart';
import { TrajectoryMap } from './components/TrajectoryMap';
import { CornerTable } from './components/CornerTable';
import { VerifierPanel } from './components/VerifierPanel';
import { PedalsChart } from './components/PedalsChart';
import { PanelHeader } from './components/PanelHeader';
import { SessionSelector } from './components/SessionSelector';
import type {
  CircuitOutline, CornerAnalysis, DataSource, LapTelemetry, OptionItem,
  OptionsResponse, SessionSelection,
} from './types/telemetry';

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#e10600', MEDIUM: '#ffd43b', HARD: '#e8e8ee',
  INTERMEDIATE: '#3bc97a', WET: '#3b82f6',
};

const SOURCE_LABEL: Record<DataSource, string> = {
  fastf1: 'FastF1',
  live: 'Live',
  mock: 'Mock',
  synthetic: 'Synthetic',
};

const lapLabel = (l: LapTelemetry) => `${l.driver} · L${l.lapNumber}`;
const lapKey = (l: LapTelemetry) => `${l.driver}-${l.lapNumber}`;

export default function App() {
  const [laps, setLaps] = useState<LapTelemetry[]>([]);
  const [source, setSource] = useState<DataSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [refId, setRefId] = useState('');
  const [cmpId, setCmpId] = useState('');
  const [circuit, setCircuit] = useState<CircuitOutline | null>(null);
  const [tab, setTab] = useState<TabId>(() => {
    if (typeof window === 'undefined') return 'delta';
    return tabFromHash(window.location.hash)
      ?? tabFromHash(window.localStorage.getItem('f1-telemetry-tab') ?? '') ?? 'delta';
  });
  const [colorBySpeed, setColorBySpeed] = useState(true);
  const [showBrakingZones, setShowBrakingZones] = useState(true);
  const [live, setLive] = useState(false);

  // Session configuration: `draft` is what the form shows, `applied` drives the API.
  const [options, setOptions] = useState<OptionsResponse | null>(null);
  const [events, setEvents] = useState<OptionItem[]>([]);
  const [eventsYear, setEventsYear] = useState<number | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [draft, setDraft] = useState<SessionSelection>({});
  const [applied, setApplied] = useState<SessionSelection>({});

  // Deep-linkable tabs: #corners, #verifier, … and remembered across reloads.
  const activateTab = (id: TabId) => {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
    try { window.localStorage.setItem('f1-telemetry-tab', `#${id}`); } catch { /* private mode */ }
  };

  useEffect(() => {
    const sync = () => {
      const fromHash = tabFromHash(window.location.hash);
      if (fromHash) setTab(fromHash);
    };
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = TABS.length - 1;
    activateTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  useEffect(() => {
    let cancelled = false;
    void fetchOptions().then((response) => {
      if (cancelled) return;
      setOptions(response);
      setEvents(response.events);
      setEventsYear(response.year);
      setDraft(response.defaults);
      // `applied` stays empty so the first laps request uses the .env defaults
      // directly — no duplicate load when options arrive.
    });
    return () => { cancelled = true; };
  }, []);

  // Refresh the Grand Prix list whenever the selected season changes.
  useEffect(() => {
    const year = draft.year;
    if (year === undefined || !options || eventsYear === year) return;
    let cancelled = false;
    setEventsLoading(true);
    void fetchOptions(year).then((response) => {
      if (cancelled) return;
      setEvents(response.events);
      setEventsYear(year);
      setEventsLoading(false);
      setDraft((prev) => ({ ...prev, gp: response.events[0]?.value ?? prev.gp }));
    });
    return () => { cancelled = true; };
  }, [draft.year, eventsYear, options]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const load = async (force = false) => {
      setLoading(true);
      try {
        const session = await fetchSessionLaps({ force, selection: applied });
        const { laps: nextLaps, source: nextSource } = session;
        if (cancelled) return;
        setLaps(nextLaps);
        setSource(nextSource);
        setCircuit(session.circuit ?? null);
        setError(null);
        if (nextLaps.length === 0) {
          setRefId('');
          setCmpId('');
          return;
        }
        setRefId((prev) => {
          const exists = nextLaps.some((l) => lapKey(l) === prev);
          return exists ? prev : lapKey(nextLaps[0]);
        });
        setCmpId((prev) => {
          const exists = nextLaps.some((l) => lapKey(l) === prev);
          if (exists) return prev;
          const i = Math.min(2, nextLaps.length - 1);
          return lapKey(nextLaps[i]);
        });
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(false);
    if (live) timer = window.setInterval(() => { void load(true); }, 60_000);
    return () => { cancelled = true; if (timer) window.clearInterval(timer); };
  }, [live, applied, retry]);

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

  if (loading && laps.length === 0 && !error) {
    return <div className="app-loading">Loading telemetry…</div>;
  }

  const hasAnalysis = Boolean(reference && comparison && analysis);
  const { deltaT, refCorners, cornerDeltas, report } = analysis ?? {
    deltaT: [], refCorners: [], cornerDeltas: [], report: null,
  };
  const finalDelta = deltaT[deltaT.length - 1]?.delta ?? 0;
  const slowestCorner = refCorners.reduce<CornerAnalysis | null>(
    (min, c) => (!min || c.minSpeed < min.minSpeed ? c : min), null,
  );

  const deltaSeries = [{
    label: 'Δ vs comparison', color: '#e10600',
    points: deltaT.map((p) => [p.distance, p.delta] as [number, number]),
    fillTo: 0,
  }];

  const speedSeries = reference && comparison ? [
    { label: `Ref ${lapLabel(reference)}`, color: '#00d2be',
      points: reference.samples.map((s) => [s.distance, s.speed] as [number, number]) },
    { label: `Cmp ${lapLabel(comparison)}`, color: '#ff8700',
      points: comparison.samples.map((s) => [s.distance, s.speed] as [number, number]),
      dashed: true },
  ] : [];

  const applySelection = () => {
    setError(null);
    setApplied({ ...draft });
  };
  const resetSelection = () => {
    const defaults = options?.defaults ?? {};
    setDraft(defaults);
    setApplied({ ...defaults });
  };

  const activeSelection: SessionSelection = Object.keys(applied).length > 0
    ? applied
    : (options?.defaults ?? {});

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-dot" />F1 Telemetry Analysis &amp; Verifier</div>
        <div className="topbar-meta">
          {source && <span className={`source-badge source-${source}`}>{SOURCE_LABEL[source]}</span>}
          {activeSelection.year && (
            <span className="config-badge">
              {activeSelection.year} · {activeSelection.gp ?? '—'} · {activeSelection.session ?? '—'}
            </span>
          )}
          {loading && <span className="refreshing">Updating…</span>}
          <label className="live-toggle">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            <span>Live poll 60s</span>
          </label>
        </div>
      </header>

      {options && (
        <SessionSelector
          options={options}
          events={events}
          eventsLoading={eventsLoading}
          value={draft}
          applied={activeSelection}
          busy={loading}
          onChange={setDraft}
          onApply={applySelection}
          onReset={resetSelection}
        />
      )}

      {error && (
        <div className="error-banner" role="alert">
          <span>Could not load telemetry: {error}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {hasAnalysis && reference && comparison && report && (
        <>
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
              <span className="stat-value">{slowestCorner ? `${slowestCorner.minSpeed.toFixed(1)} km/h` : '—'}</span>
              <span className="stat-sub">{slowestCorner ? `T${slowestCorner.corner} · gear ${slowestCorner.gearAtApex}` : 'no corners detected'}</span>
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

          <div className="tabs" role="tablist" aria-label="Telemetry views">
            {TABS.map((item, index) => (
              <button
                key={item.id}
                id={`tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={tab === item.id ? `panel-${item.id}` : undefined}
                tabIndex={tab === item.id ? 0 : -1}
                className={`tab ${tab === item.id ? 'active' : ''}`}
                title={item.hint}
                onClick={() => activateTab(item.id)}
                onKeyDown={(event) => handleTabKey(event, index)}
              >
                <span className="tab-icon" aria-hidden="true">{item.icon}</span>
                <span className="tab-label">{item.label}</span>
              </button>
            ))}
          </div>

          <main className="panel" role="tabpanel" id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`} tabIndex={0}>
            {tab === 'delta' && (
              <div className="panel-inner">
                <PanelHeader
                  title={`Delta-T — ${lapLabel(reference)} vs ${lapLabel(comparison)}`}
                  description="Positive values mean the reference lap is losing time at that point on the circuit. Hover or drag across the chart to inspect a distance."
                />
                <TelemetryChart series={deltaSeries} xLabel="Distance (m)" yLabel="Δ (s)"
                  height={320} valueFormatter={(v) => v.toFixed(3)} />
              </div>
            )}

            {tab === 'speed' && (
              <div className="panel-inner">
                <PanelHeader
                  title="Speed trace"
                  description={<>Teal = reference ({lapLabel(reference)}), dashed orange = comparison ({lapLabel(comparison)}).</>}
                />
                <TelemetryChart series={speedSeries} xLabel="Distance (m)" yLabel="Speed (km/h)"
                  height={320} valueFormatter={(v) => v.toFixed(0)} />
              </div>
            )}

            {tab === 'pedals' && (
              <div className="panel-inner">
                <PanelHeader
                  title="Throttle & brake"
                  description="Top row shows throttle, bottom row shows braking. Earlier throttle on exit and later braking into the apex are where lap time is won."
                />
                <PedalsChart reference={reference} comparison={comparison} height={380} />
              </div>
            )}

            {tab === 'trajectory' && (
              <div className="panel-inner">
                <PanelHeader
                  title="GPS trajectory"
                  description={circuit
                    ? <>Driving lines on <strong>{circuit.name}</strong> ({(circuit.length / 1000).toFixed(2)} km). The grey outline is the selected circuit; laps are drawn on top.</>
                    : 'Driving lines as recorded by GPS. The circuit outline is estimated from the selected laps.'}
                  actions={
                    <>
                      <label className="toggle">
                        <input type="checkbox" checked={colorBySpeed}
                          onChange={(e) => setColorBySpeed(e.target.checked)} />
                        <span>Colour by speed</span>
                      </label>
                      <label className="toggle">
                        <input type="checkbox" checked={showBrakingZones}
                          onChange={(e) => setShowBrakingZones(e.target.checked)} />
                        <span>Show braking zones</span>
                      </label>
                    </>
                  }
                />
                <TrajectoryMap reference={reference} comparison={comparison}
                  corners={refCorners} colorBySpeed={colorBySpeed}
                  showBrakingZones={showBrakingZones} circuit={circuit} />
              </div>
            )}

            {tab === 'corners' && (
              <div className="panel-inner">
                <PanelHeader
                  title="Corners & braking"
                  description="Boundaries come from GPS curvature (radius < 350 m). “vs. other lap” is the reference apex speed minus the comparison apex speed — positive is faster."
                />
                <CornerTable corners={refCorners} deltas={cornerDeltas} />
              </div>
            )}

            {tab === 'verifier' && (
              <div className="panel-inner">
                <PanelHeader
                  title="Verifier report"
                  description="Consistency checks for the loaded telemetry. Filter the list to focus on failures or warnings."
                />
                <VerifierPanel report={report} />
              </div>
            )}
          </main>
        </>
      )}

      {!hasAnalysis && !error && (
        <div className="empty-state">
          No laps available for this selection. Choose another season, Grand Prix or driver set.
        </div>
      )}
    </div>
  );
}
