import type { CornerAnalysis, CornerDelta } from '../types/telemetry';
import { formatMeters } from '../lib/format';

interface Props {
  corners: CornerAnalysis[];
  deltas: CornerDelta[];
}

export function CornerTable({ corners, deltas }: Props) {
  const deltaFor = (n: number) => deltas.find((d) => d.corner === n);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Corner</th>
            <th title="Distance from the start/finish line">Apex dist.</th>
            <th title="Slowest speed through the corner">Min speed</th>
            <th title="Reference minus comparison apex speed">vs. other lap</th>
            <th title="Speed at corner entry (km/h)">Entry</th>
            <th title="Speed at corner exit (km/h)">Exit</th>
            <th title="Gear at the apex">Gear</th>
            <th title="Where braking starts">Brake point</th>
            <th title="Where braking ends">Release</th>
            <th title="Time spent braking">Brake time</th>
          </tr>
        </thead>
        <tbody>
          {corners.length === 0 && (
            <tr>
              <td colSpan={10} className="table-empty">
                No corners detected from this lap&apos;s GPS curvature. Try another reference lap.
              </td>
            </tr>
          )}
          {corners.map((c) => {
            const d = deltaFor(c.corner);
            const deltaClass =
              d && Number.isFinite(d.minSpeedDelta)
                ? d.minSpeedDelta > 0.05 ? 'pos' : d.minSpeedDelta < -0.05 ? 'neg' : ''
                : '';
            return (
              <tr key={c.corner}>
                <td className="corner-num">T{c.corner}</td>
                <td>{formatMeters(c.apexDistance)}</td>
                <td className="strong">{c.minSpeed.toFixed(1)} km/h</td>
                <td className={deltaClass}>
                  {d && Number.isFinite(d.minSpeedDelta)
                    ? `${d.minSpeedDelta >= 0 ? '+' : '−'}${Math.abs(d.minSpeedDelta).toFixed(1)} km/h`
                    : '—'}
                </td>
                <td>{c.entrySpeed.toFixed(0)}</td>
                <td>{c.exitSpeed.toFixed(0)}</td>
                <td>{c.gearAtApex}</td>
                <td>{c.brakePoint === null ? '—' : formatMeters(c.brakePoint)}</td>
                <td>{c.brakeRelease === null ? '—' : formatMeters(c.brakeRelease)}</td>
                <td>{c.brakeDuration === null ? '—' : `${c.brakeDuration.toFixed(2)} s`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
