import type { VerifierReport } from '../types/telemetry';

interface Props {
  report: VerifierReport;
}

export function VerifierPanel({ report }: Props) {
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
      <ul className="check-list">
        {report.issues.map((issue) => (
          <li key={issue.id} className={`check-item ${issue.status}`}>
            <span className={`status-pill ${issue.status}`}>
              {issue.status === 'pass' ? 'PASS' : issue.status === 'warn' ? 'WARN' : 'FAIL'}
            </span>
            <div className="check-body">
              <span className="check-name">{issue.check}</span>
              <span className="check-detail">{issue.detail}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="verifier-footnote">
        Generated {new Date(report.generatedAt).toLocaleTimeString()} · mirrors the Pytest
        assertions in backend/tests/test_analysis.py.
      </p>
    </div>
  );
}
