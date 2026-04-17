import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function TasksPage() {
    const [plan, setPlan] = useState(null);
    const [projectPath, setProjectPath] = useState('');
    const load = async () => {
        if (!projectPath)
            return;
        try {
            const res = await fetch(`/api/tasks?path=${encodeURIComponent(projectPath)}`);
            if (res.ok)
                setPlan(await res.json());
        }
        catch {
            // Studio is optional; show placeholder if API not running
        }
    };
    const allTasks = plan?.phases.flatMap((p) => p.tasks) ?? [];
    return (_jsxs("div", { children: [_jsx("h1", { style: h1, children: "Tasks" }), plan && _jsx("p", { style: { color: '#888', marginBottom: 16 }, children: plan.gameTitle }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 20 }, children: [_jsx("input", { value: projectPath, onChange: (e) => setProjectPath(e.target.value), placeholder: "/path/to/game-project", style: inputStyle }), _jsx("button", { onClick: load, style: btnStyle, children: "Load" })] }), allTasks.length > 0 ? (_jsxs("table", { style: { width: '100%', borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsx("tr", { style: { borderBottom: '1px solid #222' }, children: ['Phase', 'ID', 'Role', 'Title', 'Status'].map((h) => (_jsx("th", { style: thStyle, children: h }, h))) }) }), _jsx("tbody", { children: allTasks.map((t) => (_jsxs("tr", { style: { borderBottom: '1px solid #1a1a22' }, children: [_jsx("td", { style: tdStyle, children: t.phase }), _jsx("td", { style: { ...tdStyle, color: '#64d8ff', fontFamily: 'monospace', fontSize: 12 }, children: t.id }), _jsx("td", { style: tdStyle, children: t.role }), _jsx("td", { style: tdStyle, children: t.title }), _jsx("td", { style: tdStyle, children: _jsx(StatusBadge, { status: t.status }) })] }, t.id))) })] })) : (_jsx("p", { style: { color: '#555' }, children: "No tasks loaded. Enter a project path above." }))] }));
}
function StatusBadge({ status }) {
    const colors = {
        complete: '#22c55e',
        'in-progress': '#3b82f6',
        pending: '#6b7280',
        failed: '#ef4444',
        blocked: '#f59e0b',
    };
    return (_jsx("span", { style: {
            background: `${colors[status] ?? '#444'}22`,
            color: colors[status] ?? '#888',
            border: `1px solid ${colors[status] ?? '#444'}44`,
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 11,
        }, children: status }));
}
const h1 = { fontSize: 22, marginBottom: 8, color: '#e8e8f0' };
const inputStyle = {
    flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222',
    borderRadius: 6, color: '#e8e8f0', fontSize: 13,
};
const btnStyle = {
    padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff',
    border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const thStyle = { padding: '8px 12px', textAlign: 'left', color: '#666', fontSize: 12 };
const tdStyle = { padding: '8px 12px', fontSize: 13 };
