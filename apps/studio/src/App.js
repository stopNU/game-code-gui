import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { TasksPage } from './pages/TasksPage.js';
import { EvalReportsPage } from './pages/EvalReportsPage.js';
import { ScreenshotsPage } from './pages/ScreenshotsPage.js';
export function App() {
    const [page, setPage] = useState('tasks');
    return (_jsxs("div", { style: { display: 'flex', height: '100vh' }, children: [_jsxs("nav", { style: navStyle, children: [_jsx("div", { style: logoStyle, children: "\uD83C\uDFAE Harness Studio" }), _jsx(NavItem, { active: page === 'tasks', onClick: () => setPage('tasks'), label: "Tasks" }), _jsx(NavItem, { active: page === 'evals', onClick: () => setPage('evals'), label: "Eval Reports" }), _jsx(NavItem, { active: page === 'screenshots', onClick: () => setPage('screenshots'), label: "Screenshots" })] }), _jsxs("main", { style: { flex: 1, overflow: 'auto', padding: '24px' }, children: [page === 'tasks' && _jsx(TasksPage, {}), page === 'evals' && _jsx(EvalReportsPage, {}), page === 'screenshots' && _jsx(ScreenshotsPage, {})] })] }));
}
function NavItem({ active, onClick, label }) {
    return (_jsx("button", { onClick: onClick, style: {
            display: 'block',
            width: '100%',
            padding: '10px 16px',
            background: active ? '#1e2a3a' : 'transparent',
            color: active ? '#64d8ff' : '#a0a8b8',
            border: 'none',
            borderLeft: active ? '3px solid #64d8ff' : '3px solid transparent',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: '14px',
        }, children: label }));
}
const navStyle = {
    width: '200px',
    background: '#111118',
    borderRight: '1px solid #1e2030',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    paddingTop: '16px',
};
const logoStyle = {
    padding: '8px 16px 16px',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#e8e8f0',
    borderBottom: '1px solid #1e2030',
    marginBottom: '8px',
};
