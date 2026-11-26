import { useEffect, useState } from 'react';
import { SESSION_SOURCES } from '../lib/options';
import type { OptionItem, OptionsResponse, SessionSelection } from '../types/telemetry';

interface Props {
  options: OptionsResponse;
  events: OptionItem[];
  eventsLoading: boolean;
  value: SessionSelection;
  applied: SessionSelection;
  busy: boolean;
  onChange: (next: SessionSelection) => void;
  onApply: () => void;
  onReset: () => void;
}

const optionLabel = (items: OptionItem[], key: string | undefined) =>
  items.find((item) => item.value.toLowerCase() === (key ?? '').toLowerCase())?.label ?? key ?? '—';

export function SessionSelector({
  options, events, eventsLoading, value, applied, busy, onChange, onApply, onReset,
}: Props) {
  const [expanded, setExpanded] = useState(() =>
    typeof window === 'undefined' || window.innerWidth > 720,
  );

  // Adapt when a device is rotated or the window is resized across the
  // compact breakpoint, without fighting the user's manual choice otherwise.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = (event: MediaQueryListEvent) => setExpanded(!event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const update = <K extends keyof SessionSelection>(key: K, field: SessionSelection[K]) => {
    onChange({ ...value, [key]: field });
  };

  const selectedDrivers = value.drivers ?? [];
  const driverCodes = [
    ...selectedDrivers.filter((code) => !options.drivers.some((d) => d.value === code)),
    ...options.drivers.map((d) => d.value),
  ];
  const gpOptions = events.some((e) => e.value === value.gp)
    ? events
    : [{ value: value.gp ?? '', label: `${value.gp ?? 'Select a Grand Prix'} (custom)` }, ...events];
  const sessionOptions = options.sessions.some((s) => s.value === value.session)
    ? options.sessions
    : [{ value: value.session ?? '', label: value.session ?? 'Select session' }, ...options.sessions];

  const dirty = JSON.stringify(value) !== JSON.stringify(applied);
  const noDrivers = selectedDrivers.length === 0;
  const sessionLabel = optionLabel(options.sessions, value.session);
  const gpLabel = optionLabel(events, value.gp);

  const toggleDriver = (code: string) => {
    update('drivers', selectedDrivers.includes(code)
      ? selectedDrivers.filter((d) => d !== code)
      : [...selectedDrivers, code]);
  };

  return (
    <section className={`session-selector ${expanded ? 'expanded' : ''}`}>
      <div className="session-head">
        <button
          type="button"
          className="session-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="session-chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          <span>
            <strong>Session setup</strong>
            <small>{value.year ?? '—'} · {gpLabel} · {sessionLabel}</small>
          </span>
          {dirty && <span className="dirty-dot" title="Unapplied changes"
            role="img" aria-label="Unapplied changes" />}
        </button>
        <div className="session-head-actions">
          {noDrivers && <span className="session-hint error">Select at least one driver</span>}
          <button type="button" className="btn btn-ghost" onClick={onReset} disabled={busy}>
            Reset to .env
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onApply}
            disabled={busy || noDrivers}
            title={noDrivers ? 'Select at least one driver' : 'Reload telemetry with these settings'}
          >
            {busy ? 'Loading…' : 'Apply & reload'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="session-body">
          <div className="session-grid">
            <label className="session-field">
              <span>Telemetry source</span>
              <select value={value.source ?? 'mock'} onChange={(e) => update('source', e.target.value as SessionSelection['source'])}>
                {SESSION_SOURCES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="session-field">
              <span>Season</span>
              <select value={value.year ?? options.defaults.year} onChange={(e) => update('year', Number(e.target.value))}>
                {options.years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>

            <label className="session-field">
              <span>Grand Prix {eventsLoading && <em>loading…</em>}</span>
              <select value={value.gp ?? ''} onChange={(e) => update('gp', e.target.value)}>
                {gpOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>

            <label className="session-field">
              <span>Session</span>
              <select value={value.session ?? ''} onChange={(e) => update('session', e.target.value)}>
                {sessionOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="driver-picker">
            <div className="driver-picker-head">
              <span>Drivers</span>
              <small>{selectedDrivers.length} selected</small>
            </div>
            <div className="driver-chips">
              {driverCodes.map((code) => {
                const driver = options.drivers.find((d) => d.value === code);
                const active = selectedDrivers.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    className={`chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    title={driver?.label ?? code}
                    onClick={() => toggleDriver(code)}
                  >
                    <span className="chip-code">{code}</span>
                    <span className="chip-name">{driver?.label ?? 'Custom'}</span>
                  </button>
                );
              })}
            </div>
            {noDrivers && <p className="session-hint error">Select at least one driver.</p>}
          </div>

          <details className="session-advanced">
            <summary>Advanced — laps, cache &amp; live timing</summary>
            <div className="session-grid advanced-grid">
              <label className="session-field">
                <span>Laps (optional)</span>
                <input
                  type="text"
                  value={value.laps ?? ''}
                  placeholder="VER:32,NOR:34"
                  onChange={(e) => update('laps', e.target.value)}
                />
                <small>Use | or ; for several laps, e.g. VER:32|33</small>
              </label>
              <label className="session-field">
                <span>Cache directory</span>
                <input
                  type="text"
                  value={value.cacheDir ?? ''}
                  placeholder=".fastf1_cache"
                  onChange={(e) => update('cacheDir', e.target.value)}
                />
              </label>
              <label className="session-field">
                <span>Live timing file (optional)</span>
                <input
                  type="text"
                  value={value.liveFile ?? ''}
                  placeholder="path/to/livetiming.bin"
                  onChange={(e) => update('liveFile', e.target.value)}
                />
              </label>
              <div className="session-field checkbox-field">
                <span>Fallback</span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={value.allowMockFallback ?? true}
                    onChange={(e) => update('allowMockFallback', e.target.checked)}
                  />
                  <span>Allow mock fallback on FastF1 errors</span>
                </label>
              </div>
            </div>
            <p className="session-hint">
              CORS origins (server-side, read-only at runtime):{' '}
              {options.corsOrigins.join(', ') || 'none configured'}
            </p>
          </details>

          <p className="session-hint">
            Defaults come from <code>backend/.env</code> · overrides apply to this session only.
            {!options.fastf1Available && value.source === 'fastf1'
              && ' FastF1 is not installed on the backend, so mock data will be used.'}
          </p>
        </div>
      )}
    </section>
  );
}
