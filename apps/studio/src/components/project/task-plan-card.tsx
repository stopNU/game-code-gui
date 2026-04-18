import { useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardList, Play } from 'lucide-react';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import { Card } from '@renderer/components/ui/card';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { trpc } from '@renderer/lib/trpc';
import { useConversationStore } from '@renderer/store/conversation-store';
import { getDefaultConversationConfig } from '@renderer/lib/conversation-defaults';
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
  const completeCount = phase.tasks.filter((t) => t.status === 'complete').length;
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
          {phase.tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 transition-colors"
            >
              <span className="flex-1 truncate text-xs text-foreground" title={task.title}>
                {task.title}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[task.status]}`}
              >
                {task.status}
              </span>
              {RUNNABLE_STATUSES.has(task.status) && (
                <Button
                  variant="ghost"
                  className="h-5 w-5 shrink-0 p-0"
                  disabled={runningTaskId !== null}
                  onClick={() => void onRunTask(task)}
                  title={`Implement: ${task.title}`}
                >
                  <Play className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskPlanCard({ projectId }: TaskPlanCardProps): JSX.Element | null {
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const planQuery = trpc.projects.getPlan.useQuery({ id: projectId });
  const createConversation = trpc.conversations.create.useMutation({
    onSuccess: async (conversation) => {
      useConversationStore.getState().registerConversations([conversation]);
      await utils.conversations.list.invalidate();
    },
  });
  const sendMessage = trpc.agent.send.useMutation();

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
  const completeCount = allTasks.filter((t) => t.status === 'complete').length;
  const totalCount = allTasks.length;
  const progressPct = totalCount > 0 ? Math.round((completeCount / totalCount) * 100) : 0;

  const handleRunTask = async (task: TaskState): Promise<void> => {
    setRunningTaskId(task.id);
    try {
      const config = getDefaultConversationConfig(projectId);
      const conversation = await createConversation.mutateAsync({
        projectId,
        title: `Implement: ${task.title}`,
        provider: config.provider,
        model: config.model,
      });
      useConversationStore.getState().setActiveConversationId(conversation.id);
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        userMessage: `Please implement task ${task.id}: ${task.title}. The project ID is ${projectId}.`,
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
