import { useEffect } from 'react';
import { Cpu, Download, FileText, PlugZap, RadioTower } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { GodotLauncher } from '@renderer/components/godot/godot-launcher';
import { GodotLog } from '@renderer/components/godot/godot-log';
import { TaskPlanCard } from '@renderer/components/project/task-plan-card';

export function RightPanel(): JSX.Element {
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const settingsQuery = trpc.settings.getStatus.useQuery();
  const langsmithQuery = trpc.langsmith.getStatus.useQuery();
  const runtimeQuery = trpc.runtime.getStatus.useQuery();
  const projectsQuery = trpc.projects.list.useQuery(undefined);
  const godotStatusQuery = trpc.godot.getStatus.useQuery();
  const godotLogsQuery = trpc.godot.getLogs.useQuery();
  const launchGodot = trpc.godot.launch.useMutation();
  const stopGodot = trpc.godot.stop.useMutation();
  const openLogFile = trpc.runtime.openLogFile.useMutation();
  const restartToInstallUpdate = trpc.runtime.restartToInstallUpdate.useMutation();
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const sessionDetail = useConversationStore((state) => state.sessionDetail);
  const latestToolCall = useConversationStore((state) => state.latestToolCall);
  const tokenUsage = useConversationStore((state) =>
    activeConversationId === null ? undefined : state.tokenUsage[activeConversationId],
  );
  const godotStatus = useConversationStore((state) => state.godotStatus);
  const godotLogs = useConversationStore((state) => state.godotLogs);
  const updateStatus = useConversationStore((state) => state.updateStatus);
  const hydrateGodotRuntime = useConversationStore((state) => state.hydrateGodotRuntime);

  useEffect(() => {
    if (runtimeQuery.data !== undefined) {
      useConversationStore.setState({
        updateStatus: runtimeQuery.data.updateState,
      });
    }
  }, [runtimeQuery.data]);

  useEffect(() => {
    if (godotStatusQuery.data !== undefined && godotLogsQuery.data !== undefined) {
      hydrateGodotRuntime({
        status: godotStatusQuery.data,
        logs: godotLogsQuery.data,
      });
    }
  }, [godotLogsQuery.data, godotStatusQuery.data, hydrateGodotRuntime]);

  const selectedProject = projectsQuery.data?.find((project) => project.id === selectedProjectId) ?? null;
  const loadingSummary = settingsQuery.isLoading || langsmithQuery.isLoading || runtimeQuery.isLoading || projectsQuery.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <RadioTower className="h-4 w-4 text-primary" />
          Session
        </div>
        <Badge className="mb-3">{sessionStatus}</Badge>
        <p className="text-sm text-muted-foreground">{sessionDetail}</p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <PlugZap className="h-4 w-4 text-accent" />
          Providers
        </div>
        {loadingSummary ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Anthropic</span>
            <Badge>{settingsQuery.data?.anthropicConfigured ? 'configured' : 'missing'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>OpenAI</span>
            <Badge>{settingsQuery.data?.openaiConfigured ? 'configured' : 'missing'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>LangSmith</span>
            <Badge>{langsmithQuery.data?.configured ? 'configured' : 'inactive'}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Godot</span>
            <Badge>{godotStatus.status}</Badge>
          </div>
        </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Download className="h-4 w-4 text-primary" />
          Runtime
        </div>
        {runtimeQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Version</span>
            <span>{runtimeQuery.data?.appVersion ?? 'loading'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Updates</span>
            <Badge>{updateStatus.status}</Badge>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {updateStatus.message ?? 'No update activity reported yet.'}
          </p>
          {updateStatus.downloadedVersion !== undefined ? (
            <div className="text-xs text-foreground">Ready to install: {updateStatus.downloadedVersion}</div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => void openLogFile.mutateAsync()}
              disabled={openLogFile.isPending || runtimeQuery.data === undefined}
            >
              <FileText className="mr-2 h-4 w-4" />
              Open Log File
            </Button>
            <Button
              onClick={() => void restartToInstallUpdate.mutateAsync()}
              disabled={restartToInstallUpdate.isPending || updateStatus.status !== 'downloaded'}
            >
              <Download className="mr-2 h-4 w-4" />
              Restart to Update
            </Button>
          </div>
        </div>
        )}
      </Card>

      <GodotLauncher
        projectName={selectedProject?.title ?? selectedProject?.name ?? null}
        projectPath={selectedProject?.path ?? null}
        status={godotStatus}
        launching={launchGodot.isPending}
        stopping={stopGodot.isPending}
        onLaunch={async () => {
          if (selectedProjectId === null) {
            return;
          }

          const status = await launchGodot.mutateAsync({
            projectId: selectedProjectId,
          });
          hydrateGodotRuntime({
            status,
            logs: [],
          });
        }}
        onStop={async () => {
          const status = await stopGodot.mutateAsync();
          hydrateGodotRuntime({
            status,
            logs: useConversationStore.getState().godotLogs,
          });
        }}
      />

      {selectedProjectId !== null && <TaskPlanCard projectId={selectedProjectId} />}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu className="h-4 w-4 text-primary" />
          Live Usage
        </div>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Input tokens</span>
            <span>{tokenUsage?.input ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Output tokens</span>
            <span>{tokenUsage?.output ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Cached tokens</span>
            <span>{tokenUsage?.cached ?? 0}</span>
          </div>
        </div>
        {latestToolCall !== null ? (
          <div className="mt-4 rounded-2xl border border-border bg-background/50 p-3">
            <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Latest tool</div>
            <div className="mt-2 text-sm font-medium text-foreground">{latestToolCall.toolName}</div>
            <div className="mt-1 text-xs text-muted-foreground">{latestToolCall.status}</div>
          </div>
        ) : null}
      </Card>

      <GodotLog logs={godotLogs} />
    </div>
  );
}
