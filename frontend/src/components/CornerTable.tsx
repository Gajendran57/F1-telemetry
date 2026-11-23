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
            <th>Corner</th><th>Apex dist.</th><th>Min speed</th><th>vs. other lap</th>
            <th>Entry</th><th>Exit</th><th>Gear</th>
            <th>Brake point</th><th>Release</th><th>Brake time</th>
          </tr>
        </thead>
        <tbody>
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
