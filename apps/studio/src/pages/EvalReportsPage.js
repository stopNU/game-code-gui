import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
export function EvalReportsPage() {
    const [report, setReport] = useState(null);
    const [reportPath, setReportPath] = useState('');
    const load = async () => {
        if (!reportPath)
            return;
        try {
            const text = await fetch(`/api/file?path=${encodeURIComponent(reportPath)}`).then((r) => r.text());
            setReport(JSON.parse(text));
        }
        catch {
            // Studio API not running — stub
        }
    };
    return (_jsxs("div", { children: [_jsx("h1", { style: { fontSize: 22, marginBottom: 8 }, children: "Eval Reports" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 20 }, children: [_jsx("input", { value: reportPath, onChange: (e) => setReportPath(e.target.value), placeholder: "/path/to/harness/baselines/report-xxx.json", style: { flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222', borderRadius: 6, color: '#e8e8f0', fontSize: 13 } }), _jsx("button", { onClick: load, style: { padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff', border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer' }, children: "Load" })] }), report && (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: 'flex', gap: 16, marginBottom: 24 }, children: [
                            ['Pass rate', `${(report.summary.passRate * 100).toFixed(0)}%`],
                            ['Avg score', `${(report.summary.avgScore * 100).toFixed(0)}%`],
                            ['Total', report.summary.total],
                            ['Passed', report.summary.passed],
                        ].map(([label, value]) => (_jsxs("div", { style: { background: '#111', border: '1px solid #1e2030', borderRadius: 8, padding: '12px 20px' }, children: [_jsx("div", { style: { fontSize: 11, color: '#666', marginBottom: 4 }, children: label }), _jsx("div", { style: { fontSize: 22, fontWeight: 'bold', color: '#64d8ff' }, children: value })] }, String(label)))) }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { style: { borderBottom: '1px solid #222' }, children: ['Scenario', 'Layer', 'Passed', 'Score', 'ms'].map((h) => (_jsx("th", { style: { padding: '8px 12px', textAlign: 'left', color: '#666', fontSize: 12 }, children: h }, h))) }) }), _jsx("tbody", { children: report.scores.map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #1a1a22' }, children: [_jsx("td", { style: { padding: '8px 12px', fontSize: 13, fontFamily: 'monospace', color: '#64d8ff' }, children: s.scenarioId }), _jsx("td", { style: { padding: '8px 12px', fontSize: 13 }, children: s.layer }), _jsx("td", { style: { padding: '8px 12px' }, children: s.passed ? '✓' : '✗' }), _jsx("td", { style: { padding: '8px 12px', fontSize: 13 }, children: `${(s.ratio * 100).toFixed(0)}%` }), _jsx("td", { style: { padding: '8px 12px', fontSize: 12, color: '#666' }, children: s.durationMs })] }, s.scenarioId))) })] })] })), !report && _jsx("p", { style: { color: '#555' }, children: "Load an eval report JSON to see results." })] }));
}
