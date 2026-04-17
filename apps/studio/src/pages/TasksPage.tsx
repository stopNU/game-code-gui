import { useState, useEffect } from 'react';

interface Task {
  id: string;
  title: string;
  role: string;
  status: string;
  phase: number;
}

interface TaskPlan {
  gameTitle: string;
  phases: Array<{ phase: number; tasks: Task[] }>;
}

export function TasksPage() {
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [projectPath, setProjectPath] = useState('');

  const load = async () => {
    if (!projectPath) return;
    try {
      const res = await fetch(`/api/tasks?path=${encodeURIComponent(projectPath)}`);
      if (res.ok) setPlan(await res.json() as TaskPlan);
    } catch {
      // Studio is optional; show placeholder if API not running
    }
  };

  const allTasks = plan?.phases.flatMap((p) => p.tasks) ?? [];

  return (
    <div>
      <h1 style={h1}>Tasks</h1>
      {plan && <p style={{ color: '#888', marginBottom: 16 }}>{plan.gameTitle}</p>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="/path/to/game-project"
          style={inputStyle}
        />
        <button onClick={load} style={btnStyle}>Load</button>
      </div>
      {allTasks.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #222' }}>
              {['Phase', 'ID', 'Role', 'Title', 'Status'].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allTasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #1a1a22' }}>
                <td style={tdStyle}>{t.phase}</td>
                <td style={{ ...tdStyle, color: '#64d8ff', fontFamily: 'monospace', fontSize: 12 }}>{t.id}</td>
                <td style={tdStyle}>{t.role}</td>
                <td style={tdStyle}>{t.title}</td>
                <td style={tdStyle}><StatusBadge status={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: '#555' }}>No tasks loaded. Enter a project path above.</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    complete: '#22c55e',
    'in-progress': '#3b82f6',
    pending: '#6b7280',
    failed: '#ef4444',
    blocked: '#f59e0b',
  };
  return (
    <span style={{
      background: `${colors[status] ?? '#444'}22`,
      color: colors[status] ?? '#888',
      border: `1px solid ${colors[status] ?? '#444'}44`,
      borderRadius: 4,
      padding: '2px 8px',
      fontSize: 11,
    }}>{status}</span>
  );
}

const h1: React.CSSProperties = { fontSize: 22, marginBottom: 8, color: '#e8e8f0' };
const inputStyle: React.CSSProperties = {
  flex: 1, padding: '8px 12px', background: '#16161e', border: '1px solid #222',
  borderRadius: 6, color: '#e8e8f0', fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  padding: '8px 16px', background: '#1e3a5f', color: '#64d8ff',
  border: '1px solid #264a72', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const thStyle: React.CSSProperties = { padding: '8px 12px', textAlign: 'left', color: '#666', fontSize: 12 };
const tdStyle: React.CSSProperties = { padding: '8px 12px', fontSize: 13 };
