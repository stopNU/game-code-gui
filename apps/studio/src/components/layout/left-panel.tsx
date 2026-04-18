import { FolderKanban, MessageSquarePlus } from 'lucide-react';
import { trpc } from '@renderer/lib/trpc';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';

export function LeftPanel(): JSX.Element {
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const project = projectsQuery.data?.[0];

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Workspace</p>
            <h2 className="mt-2 text-xl font-semibold text-foreground">Harness Studio</h2>
          </div>
          <Badge>{project?.status ?? 'loading'}</Badge>
        </div>
        <div className="rounded-xl bg-background/50 p-3 text-xs text-muted-foreground">
          {project?.path ?? 'Discovering workspace root...'}
        </div>
      </Card>

      <Card className="flex-1 p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FolderKanban className="h-4 w-4 text-primary" />
          Projects
        </div>
        <div className="space-y-3">
          {projectsQuery.data?.length ? (
            projectsQuery.data.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.path}</p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                      {item.completeCount ?? 0}/{item.taskCount ?? 0} tasks complete
                    </p>
                  </div>
                  <Badge>{item.status}</Badge>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-background/20 p-3 text-sm text-muted-foreground">
              No persisted Studio projects yet. Projects appear here after a plan is stored in the Phase 2 SQLite layer.
            </div>
          )}
        </div>
      </Card>

      <Button variant="outline" className="justify-start gap-2">
        <MessageSquarePlus className="h-4 w-4" />
        New conversation
      </Button>
    </div>
  );
}
