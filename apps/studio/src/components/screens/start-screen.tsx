import { useState } from 'react';
import type { ProjectSummary } from '@shared/domain';
import { trpc } from '@renderer/lib/trpc';
import { Skeleton } from '@renderer/components/ui/skeleton';

interface StartScreenProps {
  onOpenProject: (projectId: string) => void;
  onNewGame: () => void;
}

function StatusDot({ status }: { status: 'ready' | 'unknown' }): JSX.Element {
  return (
    <span
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{
        background: status === 'ready' ? '#3dca7e' : '#363d57',
        boxShadow: status === 'ready' ? '0 0 6px #3dca7e66' : 'none',
      }}
    />
  );
}

function ProjectRow({
  project,
  hovered,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  project: ProjectSummary;
  hovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}): JSX.Element {
  return (
    <div
      className="grid cursor-pointer items-center gap-4 px-4 py-3 transition-colors"
      style={{
        gridTemplateColumns: '1fr 180px 80px 72px',
        background: hovered ? 'rgba(77,158,255,0.04)' : 'transparent',
        borderBottom: '1px solid #1a1f30',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
    >
      {/* Name + path */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium" style={{ color: '#eceef5' }}>
          {project.title ?? project.name}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px]" style={{ color: '#545c7a' }}>
          {project.displayPath ?? project.path}
        </div>
      </div>

      {/* Tasks */}
      <div className="font-mono text-[11px]" style={{ color: '#545c7a' }}>
        {project.completeCount ?? 0}/{project.taskCount ?? 0} tasks
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <StatusDot status={project.status} />
        <span
          className="font-mono text-[10px] uppercase tracking-wider"
          style={{ color: project.status === 'ready' ? '#3dca7e' : '#545c7a' }}
        >
          {project.status}
        </span>
      </div>

      {/* Updated */}
      <div className="text-right font-mono text-[10px]" style={{ color: '#545c7a' }}>
        {project.updatedAt !== undefined ? new Date(project.updatedAt).toLocaleDateString() : '—'}
      </div>
    </div>
  );
}

export function StartScreen({ onOpenProject, onNewGame }: StartScreenProps): JSX.Element {
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const projects = projectsQuery.data ?? [];
  const filtered = projects.filter(
    (p) =>
      (p.title ?? p.name).toLowerCase().includes(filter.toLowerCase()) ||
      (p.displayPath ?? p.path).toLowerCase().includes(filter.toLowerCase()),
  );

  const ctaCards = [
    {
      icon: '◈',
      title: 'New Game Project',
      sub: 'Scaffold with AI from a blank canvas',
      accent: true,
      onClick: onNewGame,
    },
    {
      icon: '⊡',
      title: 'Open Folder',
      sub: 'Import an existing project directory',
      accent: false,
      onClick: undefined,
    },
    {
      icon: '⌕',
      title: 'Browse Templates',
      sub: 'Start from community-built starters',
      accent: false,
      onClick: undefined,
    },
  ];

  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden"
      style={{ background: '#080a0f' }}
    >
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: 'linear-gradient(#1a1f30 1px, transparent 1px), linear-gradient(90deg, #1a1f30 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          opacity: 0.35,
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }}
      />

      <div className="relative flex w-[640px] flex-col gap-9">
        {/* Logo + heading */}
        <div style={{ animation: 'fadeUp 0.35s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div
            className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.28em]"
            style={{ color: '#4d9eff' }}
          >
            Harness Studio
          </div>
          <div
            className="text-[30px] font-light leading-tight tracking-tight"
            style={{ color: '#eceef5' }}
          >
            What are we building today?
          </div>
        </div>

        {/* CTA cards */}
        <div
          className="flex gap-2.5"
          style={{ animation: 'fadeUp 0.35s 60ms cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {ctaCards.map((card, i) => (
            <div
              key={card.title}
              className="flex flex-1 cursor-pointer flex-col gap-2 rounded-md p-[18px_16px] transition-colors"
              style={{
                background:
                  hoveredCard === i
                    ? card.accent
                      ? '#1d3d6a'
                      : '#161b28'
                    : card.accent
                      ? '#1a3a6e'
                      : '#11141f',
                border: `1px solid ${
                  card.accent
                    ? hoveredCard === i
                      ? '#4d9eff99'
                      : '#4d9eff44'
                    : hoveredCard === i
                      ? '#242b3d'
                      : '#1a1f30'
                }`,
              }}
              onMouseEnter={() => setHoveredCard(i)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={card.onClick}
            >
              <div className="text-[17px]" style={{ color: card.accent ? '#4d9eff' : '#545c7a' }}>
                {card.icon}
              </div>
              <div className="text-[13px] font-medium" style={{ color: '#eceef5' }}>
                {card.title}
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#545c7a' }}>
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Recent projects */}
        <div style={{ animation: 'fadeUp 0.35s 120ms cubic-bezier(0.16,1,0.3,1) both' }}>
          {/* Header row */}
          <div className="mb-2.5 flex items-center justify-between">
            <div
              className="font-mono text-[10px] uppercase tracking-[0.12em]"
              style={{ color: '#545c7a' }}
            >
              Recent Projects
            </div>
            {/* Search */}
            <div
              className="flex items-center gap-1.5 rounded px-2.5 py-1"
              style={{ background: '#11141f', border: '1px solid #1a1f30' }}
            >
              <span className="text-[11px]" style={{ color: '#545c7a' }}>
                ⌕
              </span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter projects…"
                className="w-36 bg-transparent text-[11px] outline-none placeholder:opacity-60"
                style={{ color: '#9aa0bc' }}
              />
            </div>
          </div>

          {/* Table */}
          <div
            className="overflow-hidden rounded-md"
            style={{ border: '1px solid #1a1f30', background: '#0d1018' }}
          >
            {/* Column headers */}
            <div
              className="grid px-4 py-2"
              style={{
                gridTemplateColumns: '1fr 180px 80px 72px',
                borderBottom: '1px solid #1a1f30',
              }}
            >
              {['Project', 'Tasks', 'Status', 'Updated'].map((h, i) => (
                <div
                  key={h}
                  className={`font-mono text-[10px] uppercase tracking-[0.12em] ${i === 3 ? 'text-right' : ''}`}
                  style={{ color: '#363d57' }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {projectsQuery.isLoading ? (
              <div className="space-y-px p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: '#545c7a' }}>
                {projects.length === 0
                  ? 'No projects yet — start a new game to get going.'
                  : 'No projects match your filter.'}
              </div>
            ) : (
              filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  hovered={hoveredRow === project.id}
                  onMouseEnter={() => setHoveredRow(project.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => onOpenProject(project.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '10px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid #1a1f30',
        background: '#0d1018',
      }}>
        <span className="font-mono text-[10px]" style={{ color: '#545c7a' }}>
          Runtime v0.1.0 · auto-update disabled
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          {['Providers', 'Settings', 'Docs'].map((l) => (
            <span key={l} className="font-mono text-[10px]" style={{ color: '#545c7a', cursor: 'pointer' }}>{l}</span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
