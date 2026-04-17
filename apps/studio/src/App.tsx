import { useState } from 'react';
import { TasksPage } from './pages/TasksPage.js';
import { EvalReportsPage } from './pages/EvalReportsPage.js';
import { ScreenshotsPage } from './pages/ScreenshotsPage.js';

type Page = 'tasks' | 'evals' | 'screenshots';

export function App() {
  const [page, setPage] = useState<Page>('tasks');

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <nav style={navStyle}>
        <div style={logoStyle}>🎮 Harness Studio</div>
        <NavItem active={page === 'tasks'} onClick={() => setPage('tasks')} label="Tasks" />
        <NavItem active={page === 'evals'} onClick={() => setPage('evals')} label="Eval Reports" />
        <NavItem active={page === 'screenshots'} onClick={() => setPage('screenshots')} label="Screenshots" />
      </nav>
      <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        {page === 'tasks' && <TasksPage />}
        {page === 'evals' && <EvalReportsPage />}
        {page === 'screenshots' && <ScreenshotsPage />}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
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
      }}
    >
      {label}
    </button>
  );
}

const navStyle: React.CSSProperties = {
  width: '200px',
  background: '#111118',
  borderRight: '1px solid #1e2030',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingTop: '16px',
};

const logoStyle: React.CSSProperties = {
  padding: '8px 16px 16px',
  fontSize: '16px',
  fontWeight: 'bold',
  color: '#e8e8f0',
  borderBottom: '1px solid #1e2030',
  marginBottom: '8px',
};
