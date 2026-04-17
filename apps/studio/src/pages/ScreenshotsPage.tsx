import { useState } from 'react';

export function ScreenshotsPage() {
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [dir, setDir] = useState('');

  const load = async () => {
    if (!dir) return;
    try {
      const res = await fetch(`/api/screenshots?dir=${encodeURIComponent(dir)}`);
      if (res.ok) setScreenshots(await res.json() as string[]);
    } catch {
      // Studio API not running
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Screenshots</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={dir}
          onChange={(e) => setDir(e.target.value)}
          placeholder="/path/to/harness/baselines"
          style={{ flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222', borderRadius: 6, color: '#e8e8f0', fontSize: 13 }}
        />
        <button onClick={load} style={{ padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff', border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer' }}>Load</button>
      </div>

      {screenshots.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {screenshots.map((src) => (
            <div key={src} style={{ background: '#111', border: '1px solid #1e2030', borderRadius: 8, overflow: 'hidden' }}>
              <img src={`/api/image?path=${encodeURIComponent(src)}`} alt={src} style={{ width: '100%', display: 'block' }} />
              <div style={{ padding: '8px 12px', fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                {src.split('/').pop()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: '#555' }}>Enter the baselines directory path above.</p>
      )}
    </div>
  );
}
