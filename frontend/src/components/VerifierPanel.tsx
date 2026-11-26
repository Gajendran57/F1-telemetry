import { useState } from 'react';
import type { CheckStatus, VerifierReport } from '../types/telemetry';

interface Props {
  report: VerifierReport;
}

type Filter = CheckStatus | 'all';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'fail', label: 'Failed' },
  { value: 'warn', label: 'Warnings' },
  { value: 'pass', label: 'Passed' },
];

const STATUS_LABEL: Record<CheckStatus, string> = {
  pass: 'PASS', warn: 'WARN', fail: 'FAIL',
};

export function VerifierPanel({ report }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const issues = report.issues.filter((issue) => filter === 'all' || issue.status === filter);

  return (
    <div className="verifier">
      <div className="verifier-summary">
        <div className="summary-card pass">
          <span className="summary-value">{report.passed}</span>
          <span className="summary-label">Passed</span>
        </div>
        <div className="summary-card warn">
          <span className="summary-value">{report.warned}</span>
          <span className="summary-label">Warnings</span>
        </div>
        <div className="summary-card fail">
          <span className="summary-value">{report.failed}</span>
          <span className="summary-label">Failed</span>
        </div>
        <div className="summary-card">
          <span className="summary-value">{report.totalChecks}</span>
          <span className="summary-label">Total checks</span>
        </div>
      </div>

      <div className="filter-bar" role="group" aria-label="Filter checks by result">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`filter-chip ${filter === item.value ? 'active' : ''}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
        <span className="filter-count">{issues.length} shown</span>
      </div>

      {issues.length ? (
        <ul className="check-list">
          {issues.map((issue) => (
            <li key={issue.id} className={`check-item ${issue.status}`}>
              <span className={`status-pill ${issue.status}`}>{STATUS_LABEL[issue.status]}</span>
              <div className="check-body">
                <span className="check-name">{issue.check}</span>
                <span className="check-detail">{issue.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state compact">
          {filter === 'all'
            ? 'No checks were reported for this telemetry.'
            : `No ${STATUS_LABEL[filter].toLowerCase()} checks. Try another filter.`}
        </div>
      )}

      <p className="verifier-footnote">
        Generated {new Date(report.generatedAt).toLocaleTimeString()} · mirrors the Pytest
        assertions in backend/tests/test_analysis.py.
      </p>
    </div>
  );
}
