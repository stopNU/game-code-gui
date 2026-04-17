import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
export function ScreenshotsPage() {
    const [screenshots, setScreenshots] = useState([]);
    const [dir, setDir] = useState('');
    const load = async () => {
        if (!dir)
            return;
        try {
            const res = await fetch(`/api/screenshots?dir=${encodeURIComponent(dir)}`);
            if (res.ok)
                setScreenshots(await res.json());
        }
        catch {
            // Studio API not running
        }
    };
    return (_jsxs("div", { children: [_jsx("h1", { style: { fontSize: 22, marginBottom: 8 }, children: "Screenshots" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 20 }, children: [_jsx("input", { value: dir, onChange: (e) => setDir(e.target.value), placeholder: "/path/to/harness/baselines", style: { flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222', borderRadius: 6, color: '#e8e8f0', fontSize: 13 } }), _jsx("button", { onClick: load, style: { padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff', border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer' }, children: "Load" })] }), screenshots.length > 0 ? (_jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }, children: screenshots.map((src) => (_jsxs("div", { style: { background: '#111', border: '1px solid #1e2030', borderRadius: 8, overflow: 'hidden' }, children: [_jsx("img", { src: `/api/image?path=${encodeURIComponent(src)}`, alt: src, style: { width: '100%', display: 'block' } }), _jsx("div", { style: { padding: '8px 12px', fontSize: 11, color: '#666', fontFamily: 'monospace' }, children: src.split('/').pop() })] }, src))) })) : (_jsx("p", { style: { color: '#555' }, children: "Enter the baselines directory path above." }))] }));
}
