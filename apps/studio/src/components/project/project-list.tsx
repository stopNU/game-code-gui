import { FolderKanban } from 'lucide-react';
import type { ProjectSummary } from '@shared/domain';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { cn } from '@renderer/lib/utils';

interface ProjectListProps {
  projects: ProjectSummary[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
}

export function ProjectList({ projects, selectedProjectId, onSelect }: ProjectListProps): JSX.Element {
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FolderKanban className="h-4 w-4 text-primary" />
        Projects
      </div>
      <div className="space-y-2">
        <Button
          variant="ghost"
          className={cn(
            'h-auto w-full justify-start rounded-2xl border px-3 py-3 text-left',
            selectedProjectId === null
              ? 'border-primary/60 bg-primary/10 text-foreground'
              : 'border-transparent bg-background/30 text-muted-foreground hover:border-border hover:bg-background/50',
          )}
          onClick={() => onSelect(null)}
        >
          <div>
            <div className="font-medium">No project filter</div>
            <div className="mt-1 text-xs text-muted-foreground">Use this for greenfield planning chats.</div>
          </div>
        </Button>
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-background/20 p-4 text-sm text-muted-foreground">
            Projects appear here after a plan has been persisted into Studio.
          </div>
        ) : null}
        {projects.map((project) => (
          <Button
            key={project.id}
            variant="ghost"
            className={cn(
              'h-auto w-full justify-start rounded-2xl border px-3 py-3 text-left',
              selectedProjectId === project.id
                ? 'border-primary/60 bg-primary/10 text-foreground'
                : 'border-transparent bg-background/30 text-muted-foreground hover:border-border hover:bg-background/50',
            )}
            onClick={() => onSelect(project.id)}
          >
            <div className="w-full">
              <div className="flex items-center justify-between gap-3">
                <div className="truncate font-medium">{project.title ?? project.name}</div>
                <Badge>{project.status}</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">{project.displayPath ?? project.path}</div>
              <div className="mt-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {project.completeCount ?? 0}/{project.taskCount ?? 0} tasks complete
              </div>
            </div>
          </Button>
        ))}
      </div>
    </Card>
  );
}
