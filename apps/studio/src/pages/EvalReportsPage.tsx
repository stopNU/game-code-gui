import { useState } from 'react';

interface ScoreResult {
  scenarioId: string;
  layer: string;
  passed: boolean;
  ratio: number;
  durationMs: number;
}

interface EvalReport {
  reportId: string;
  runAt: string;
  summary: { total: number; passed: number; passRate: number; avgScore: number };
  scores: ScoreResult[];
}

export function EvalReportsPage() {
  const [report, setReport] = useState<EvalReport | null>(null);
  const [reportPath, setReportPath] = useState('');

  const load = async () => {
    if (!reportPath) return;
    try {
      const text = await fetch(`/api/file?path=${encodeURIComponent(reportPath)}`).then((r) => r.text());
      setReport(JSON.parse(text) as EvalReport);
    } catch {
      // Studio API not running — stub
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Eval Reports</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={reportPath}
          onChange={(e) => setReportPath(e.target.value)}
          placeholder="/path/to/harness/baselines/report-xxx.json"
          style={{ flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222', borderRadius: 6, color: '#e8e8f0', fontSize: 13 }}
        />
        <button onClick={load} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff', border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer' }}>Load</button>
      </div>

      {report && (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            {[
              ['Pass rate', `${(report.summary.passRate * 100).toFixed(0)}%`],
              ['Avg score', `${(report.summary.avgScore * 100).toFixed(0)}%`],
              ['Total', report.summary.total],
              ['Passed', report.summary.passed],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ background: '#111', border: '1px solid #1e2030', borderRadius: 8, padding: '12px 20px' }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 'bold', color: '#64d8ff' }}>{value}</div>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #222' }}>
                {['Scenario', 'Layer', 'Passed', 'Score', 'ms'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#666', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.scores.map((s) => (
                <tr key={s.scenarioId} style={{ borderBottom: '1px solid #1a1a22' }}>
                  <td style={{ padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', color: '#64d8ff' }}>{s.scenarioId}</td>
                  <td style={{ padding: '8px 12px', fontSize: 13 }}>{s.layer}</td>
                  <td style={{ padding: '8px 12px' }}>{s.passed ? '✓' : '✗'}</td>
                  <td style={{ padding: '8px 12px', fontSize: 13 }}>{`${(s.ratio * 100).toFixed(0)}%`}</td>
                  <td style={{ padding: '8px 12px', fontSize: 12, color: '#666' }}>{s.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {!report && <p style={{ color: '#555' }}>Load an eval report JSON to see results.</p>}
    </div>
  );
}
