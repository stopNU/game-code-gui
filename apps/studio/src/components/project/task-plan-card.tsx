import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Play } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { resolveConversationConfig } from '@renderer/lib/conversation-defaults';
import type { TaskPlan, PhasePlan, TaskState, TaskStatus } from '@agent-harness/core';

interface TaskPlanCardProps {
  projectId: string;
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  planning: 'bg-blue-500/10 text-blue-400',
  'in-progress': 'bg-yellow-500/10 text-yellow-400',
  blocked: 'bg-red-500/10 text-red-400',
  review: 'bg-purple-500/10 text-purple-400',
  complete: 'bg-green-500/10 text-green-400',
  failed: 'bg-red-500/10 text-red-400',
};

const RUNNABLE_STATUSES = new Set<TaskStatus>(['pending', 'failed', 'blocked']);

function getTaskStatus(task: TaskState): TaskStatus {
  switch (task.status) {
    case 'pending':
    case 'planning':
    case 'in-progress':
    case 'blocked':
    case 'review':
    case 'complete':
    case 'failed':
      return task.status;
    default:
      return 'pending';
  }
}

function getTaskLabel(task: TaskState): string {
  if (typeof task.title === 'string' && task.title.trim().length > 0) {
    return task.title;
  }

  return task.id
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function PhaseSection({
  phase,
  projectId,
  onRunTask,
  runningTaskId,
}: {
  phase: PhasePlan;
  projectId: string;
  onRunTask: (task: TaskState) => Promise<void>;
  runningTaskId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const completeCount = phase.tasks.filter((t) => getTaskStatus(t) === 'complete').length;
  const label = phase.label ?? `Phase ${phase.phase}`;

  return (
    <div className="border-b border-border last:border-0">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <span className="flex-1 truncate">{label}</span>
        <span className="shrink-0 tabular-nums">
          {completeCount}/{phase.tasks.length}
        </span>
      </button>

      {open && (
        <div className="pb-1">
          {phase.tasks.map((task) => {
            const taskLabel = getTaskLabel(task);
            const taskStatus = getTaskStatus(task);

            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors"
              >
                <span className="flex-1 truncate text-xs text-foreground" title={taskLabel}>
                  {taskLabel}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[taskStatus]}`}
                >
                  {taskStatus}
                </span>
                {RUNNABLE_STATUSES.has(taskStatus) && (
                  <Button
                    variant="ghost"
                    className="h-5 w-5 shrink-0 p-0"
                    disabled={runningTaskId !== null}
                    onClick={() => void onRunTask(task)}
                    title={`Implement: ${taskLabel}`}
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TaskPlanCard({ projectId }: TaskPlanCardProps): JSX.Element | null {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const activeConversationPreferences = useConversationStore((state) =>
    activeConversationId === null ? null : (state.conversationPreferences[activeConversationId] ?? null),
  );
  const activeConversationRunning = useConversationStore((state) =>
    activeConversationId === null ? false : (state.isRunning[activeConversationId] ?? false),
  );
  const shouldPollPlan =
    activeConversationRunning && activeConversationPreferences?.projectId === projectId;
  const wasPollingRef = useRef(shouldPollPlan);

  const planQuery = trpc.projects.getPlan.useQuery(
    { id: projectId },
    {
      refetchInterval: shouldPollPlan ? 2000 : false,
    },
  );
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      useConversationStore.getState().registerConversations([conversation]);
      await utils.conversations.list.invalidate();
    },
  });
  const sendMessage = trpc.agent.send.useMutation();

  useEffect(() => {
    if (!shouldPollPlan && wasPollingRef.current) {
      void Promise.all([
        utils.projects.getPlan.invalidate({ id: projectId }),
        utils.projects.getInfo.invalidate({ id: projectId }),
        utils.projects.list.invalidate(),
      ]);
    }

    wasPollingRef.current = shouldPollPlan;
  }, [projectId, shouldPollPlan, utils.projects.getInfo, utils.projects.getPlan, utils.projects.list]);

  if (planQuery.isLoading) {
    return (
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="h-4 w-4 text-primary" />
          Task Plan
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </Card>
    );
  }

  const plan = planQuery.data as TaskPlan | null;
  if (plan === null || plan === undefined) {
    return null;
  }

  const allTasks = plan.phases.flatMap((p) => p.tasks);
  const completeCount = allTasks.filter((t) => getTaskStatus(t) === 'complete').length;
  const totalCount = allTasks.length;
  const progressPct = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;

  const handleRunTask = async (task: TaskState): Promise<void> => {
    setRunningTaskId(task.id);
    try {
      const taskLabel = getTaskLabel(task);
      const config = resolveConversationConfig(projectId, activeConversationPreferences);
      const conversation = await createConversation.mutateAsync({
        projectId,
        title: `Implement: ${taskLabel}`,
        provider: config.provider,
        model: config.model,
      });
      useConversationStore.getState().setActiveConversationId(conversation.id);
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        userMessage: `Please implement task ${task.id}: ${taskLabel}. The project ID is ${projectId}.`,
        projectId,
        model: config.model,
        provider: config.provider,
      });
    } finally {
      setRunningTaskId(null);
    }
  };

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardList className="h-4 w-4 text-primary" />
        Task Plan
        <Badge className="ml-auto">{completeCount}/{totalCount}</Badge>
      </div>

      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="max-h-[50vh] min-h-48 overflow-y-auto rounded-md border border-border">
        {plan.phases.map((phase) => (
          <PhaseSection
            key={phase.phase}
            phase={phase}
            projectId={projectId}
            onRunTask={handleRunTask}
            runningTaskId={runningTaskId}
          />
        ))}
      </div>
    </Card>
  );
}
