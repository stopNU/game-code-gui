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
      className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${status === 'ready' ? 'bg-success' : 'bg-fg-3'}`}
      style={status === 'ready' ? { boxShadow: '0 0 6px #3dca7e66' } : undefined}
    />
  );
}

function ProjectRow({
  project,
  onClick,
}: {
  project: ProjectSummary;
  onClick: () => void;
}): JSX.Element {
  return (
    <div
      className="grid cursor-pointer items-center gap-4 border-b border-border-1 px-4 py-3 transition-colors hover:bg-[rgba(77,158,255,0.04)]"
      style={{ gridTemplateColumns: '1fr 180px 80px 72px' }}
      onClick={onClick}
    >
      {/* Name + path */}
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg-0">
          {project.title ?? project.name}
        </div>
        <div className="mt-0.5 truncate font-mono text-10 text-fg-2">
          {project.displayPath ?? project.path}
        </div>
      </div>

      {/* Tasks */}
      <div className="font-mono text-11 text-fg-2">
        {project.completeCount ?? 0}/{project.taskCount ?? 0} tasks
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        <StatusDot status={project.status} />
        <span className={`font-mono text-10 uppercase tracking-wider ${project.status === 'ready' ? 'text-success' : 'text-fg-2'}`}>
          {project.status}
        </span>
      </div>

      {/* Updated */}
      <div className="text-right font-mono text-10 text-fg-2">
        {project.updatedAt !== undefined ? new Date(project.updatedAt).toLocaleDateString() : '—'}
      </div>
    </div>
  );
}

export function StartScreen({ onOpenProject, onNewGame }: StartScreenProps): JSX.Element {
  const projectsQuery = trpc.projects.list.useQuery(undefined);
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
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-surface-0">
      {/* Grid background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage: 'linear-gradient(#1a1f30 1px, transparent 1px), linear-gradient(90deg, #1a1f30 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)',
        }}
      />

      <div className="relative flex w-[640px] flex-col gap-9">
        {/* Logo + heading */}
        <div className="animate-fade-up">
          <div className="mb-2.5 font-mono text-10 uppercase tracking-widest2 text-accent">
            Harness Studio
          </div>
          <div className="text-[30px] font-light leading-tight tracking-tight text-fg-0">
            What are we building today?
          </div>
        </div>

        {/* CTA cards */}
        <div className="flex gap-2.5 animate-fade-up-1">
          {ctaCards.map((card) => (
            <div
              key={card.title}
              className={[
                'flex flex-1 cursor-pointer flex-col gap-2 rounded-md p-[18px_16px] transition-colors border',
                card.accent
                  ? 'bg-accent-lo border-[#4d9eff44] hover:bg-[#1d3d6a] hover:border-[#4d9eff99]'
                  : 'bg-surface-2 border-border-1 hover:bg-surface-3 hover:border-border-2',
              ].join(' ')}
              onClick={card.onClick}
            >
              <div className={`text-[17px] ${card.accent ? 'text-accent' : 'text-fg-2'}`}>
                {card.icon}
              </div>
              <div className="text-13 font-medium text-fg-0">
                {card.title}
              </div>
              <div className="text-11 leading-relaxed text-fg-2">
                {card.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Recent projects */}
        <div className="animate-fade-up-2">
          {/* Header row */}
          <div className="mb-2.5 flex items-center justify-between">
            <div className="font-mono text-10 uppercase tracking-wider2 text-fg-2">
              Recent Projects
            </div>
            {/* Search */}
            <div className="flex items-center gap-1.5 rounded border border-border-1 bg-surface-2 px-2.5 py-1">
              <span className="text-11 text-fg-2">⌕</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter projects…"
                className="w-36 bg-transparent text-11 text-fg-1 outline-none placeholder:opacity-60"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-md border border-border-1 bg-surface-1">
            {/* Column headers */}
            <div
              className="grid border-b border-border-1 px-4 py-2"
              style={{ gridTemplateColumns: '1fr 180px 80px 72px' }}
            >
              {['Project', 'Tasks', 'Status', 'Updated'].map((h, i) => (
                <div
                  key={h}
                  className={`font-mono text-10 uppercase tracking-wider2 text-fg-3 ${i === 3 ? 'text-right' : ''}`}
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
              <div className="px-4 py-8 text-center text-sm text-fg-2">
                {projects.length === 0
                  ? 'No projects yet — start a new game to get going.'
                  : 'No projects match your filter.'}
              </div>
            ) : (
              filtered.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  onClick={() => onOpenProject(project.id)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-border-1 bg-surface-1 px-6 py-2.5">
        <span className="font-mono text-10 text-fg-2">
          Runtime v0.1.0 · auto-update disabled
        </span>
        <div className="flex gap-4">
          {['Providers', 'Settings', 'Docs'].map((l) => (
            <span key={l} className="cursor-pointer font-mono text-10 text-fg-2">{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
