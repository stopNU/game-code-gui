import { useEffect, useMemo, useState } from 'react';
import type { ConversationMessage } from '@renderer/store/conversation-store';
import { Separator } from '@renderer/components/ui/separator';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { trpc } from '@renderer/lib/trpc';
import { splitContentBlocksIntoMessages } from '@renderer/lib/message-content';
import {
  DEFAULT_CONVERSATION_PROVIDER,
  getDefaultModelForProvider,
} from '@renderer/lib/conversation-defaults';
import { useConversationStore } from '@renderer/store/conversation-store';
import { ConversationHeader } from '@renderer/components/chat/conversation-header';
import { MessageList } from '@renderer/components/chat/message-list';
import { ChatComposer } from '@renderer/components/chat/chat-composer';
import { TaskPlanCard } from '@renderer/components/project/task-plan-card';

import type { TaskPlan } from '@agent-harness/core';

type CenterTab = 'overview' | 'chat' | 'tasks' | 'logs';

function normalizeDbMessages(
  messages: Array<{
    id: string;
    conversationId: string;
    role: 'user' | 'assistant' | 'system' | 'error';
    contentBlocks: unknown[];
    createdAt: string;
  }>,
): ConversationMessage[] {
  return messages.flatMap((message) =>
    splitContentBlocksIntoMessages({
      baseId: message.id,
      conversationId: message.conversationId,
      role: message.role === 'error' ? 'system' : message.role,
      contentBlocks: message.contentBlocks,
      createdAt: message.createdAt,
      status: 'complete',
    }),
  );
}

interface ProjectInfo {
  id: string;
  name: string;
  title?: string;
  path: string;
  displayPath?: string;
  status: string;
  taskCount?: number;
  completeCount?: number;
  updatedAt?: string;
  hasTaskPlan: boolean;
}

function ProjectOverview({
  plan,
  info,
}: {
  plan: TaskPlan | null;
  info: ProjectInfo | null;
}): JSX.Element {
  if (plan === null) {
    return (
      <div className="flex h-full items-center justify-center text-center font-mono text-xs text-fg-3">
        {info !== null
          ? 'No plan generated yet for this project. Run plan-game or new-game to scaffold one.'
          : 'No project info available.'}
      </div>
    );
  }

  const title = plan.gameTitle || info?.title || info?.name || 'Untitled Game';
  const taskCount = info?.taskCount ?? plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const completeCount = info?.completeCount ?? 0;
  const progress = taskCount > 0 ? Math.round((completeCount / taskCount) * 100) : 0;
  const mvpFeatures = plan.subsystems?.flatMap((s) => s.modules) ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <div className="font-mono text-10 uppercase tracking-[0.1em] text-fg-2">Project</div>
        <h1 className="text-lg font-semibold text-fg-0">{title}</h1>
        {plan.genre && (
          <div className="font-mono text-11 text-fg-2">{plan.genre}</div>
        )}
        {info?.displayPath && (
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-10 text-fg-3">
            {info.displayPath}
          </div>
        )}
      </header>

      {/* Progress */}
      <Section title="Progress">
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-surface-5">
            <div
              className="h-full rounded-sm bg-accent transition-[width] duration-[400ms]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="font-mono text-11 text-fg-2">
            {completeCount}/{taskCount} tasks · {progress}%
          </div>
        </div>
      </Section>

      {plan.gameBrief && (
        <Section title="Brief">
          <p className="whitespace-pre-wrap text-12 leading-[1.55] text-fg-1">{plan.gameBrief}</p>
        </Section>
      )}

      {plan.coreLoop && (
        <Section title="Core Loop">
          <p className="whitespace-pre-wrap text-12 leading-[1.55] text-fg-1">{plan.coreLoop}</p>
        </Section>
      )}

      {plan.controls.length > 0 && (
        <Section title="Controls">
          <Chips items={plan.controls} />
        </Section>
      )}

      {plan.scenes.length > 0 && (
        <Section title="Scenes">
          <Chips items={plan.scenes} />
        </Section>
      )}

      {plan.entities.length > 0 && (
        <Section title="Entities">
          <Chips items={plan.entities} />
        </Section>
      )}

      {plan.assets.length > 0 && (
        <Section title="Assets">
          <Chips items={plan.assets} />
        </Section>
      )}

      {plan.subsystems !== undefined && plan.subsystems.length > 0 && (
        <Section title="Subsystems">
          <ul className="flex flex-col gap-2">
            {plan.subsystems.map((s) => (
              <li key={s.id} className="rounded border border-border-2 bg-surface-3 p-2.5">
                <div className="text-12 font-medium text-fg-0">{s.name}</div>
                <div className="mt-0.5 text-11 leading-[1.5] text-fg-2">{s.description}</div>
                {s.modules.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.modules.map((m) => (
                      <span
                        key={m}
                        className="rounded-[3px] border border-border-2 bg-surface-1 px-1.5 py-px font-mono text-9 text-fg-2"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {mvpFeatures.length === 0 && plan.dataSchemas !== undefined && plan.dataSchemas.length > 0 && (
        <Section title="Data Schemas">
          <Chips items={plan.dataSchemas.map((d) => d.name)} />
        </Section>
      )}

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <div className="font-mono text-10 uppercase tracking-[0.1em] text-fg-2">{title}</div>
      {children}
    </section>
  );
}

function Chips({ items }: { items: string[] }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-[3px] border border-border-2 bg-surface-3 px-1.5 py-0.5 font-mono text-10 text-fg-1"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function CenterPanel(): JSX.Element {
  const [activeTab, setActiveTab] = useState<CenterTab>('overview');
  const utils = trpc.useUtils();
  const activeConversationId = useConversationStore((state) => state.activeConversationId);
  const selectedProjectId = useConversationStore((state) => state.selectedProjectId);
  const messages = useConversationStore((state) =>
    activeConversationId === null ? null : (state.messages[activeConversationId] ?? null),
  ) ?? [];
  const toolCalls = useConversationStore((state) =>
    activeConversationId === null ? null : (state.toolCalls[activeConversationId] ?? null),
  ) ?? [];
  const preferences = useConversationStore((state) =>
    activeConversationId === null ? null : state.conversationPreferences[activeConversationId] ?? null,
  );
  const running = useConversationStore((state) =>
    activeConversationId === null ? false : (state.isRunning[activeConversationId] ?? false),
  );
  const tokenUsage = useConversationStore((state) =>
    activeConversationId === null ? undefined : state.tokenUsage[activeConversationId],
  );
  const sessionStatus = useConversationStore((state) => state.sessionStatus);
  const godotLogs = useConversationStore((state) => state.godotLogs);
  const hydrateMessages = useConversationStore((state) => state.hydrateMessages);
  const clearGodotLogs = useConversationStore((state) => state.clearGodotLogs);
  const addUserMessage = useConversationStore((state) => state.upsertUserMessage);
  const updateConversationPreferences = useConversationStore((state) => state.updateConversationPreferences);
  const settingsStatusQuery = trpc.settings.getStatus.useQuery();
  const planQuery = trpc.projects.getPlan.useQuery(
    { id: selectedProjectId ?? '' },
    { enabled: selectedProjectId !== null },
  );
  const projectInfoQuery = trpc.projects.getInfo.useQuery(
    { id: selectedProjectId ?? '' },
    { enabled: selectedProjectId !== null },
  );

  const messagesQuery = trpc.conversations.getMessages.useQuery(
    { id: activeConversationId ?? '' },
    {
      enabled: activeConversationId !== null,
    },
  );
  const sendMutation = trpc.agent.send.useMutation({
    onSuccess: async () => {
      await utils.conversations.list.invalidate();
    },
  });
  const abortMutation = trpc.agent.abort.useMutation();
  const renameMutation = trpc.conversations.rename.useMutation();

  useEffect(() => {
    if (activeConversationId !== null && messagesQuery.data !== undefined) {
      hydrateMessages(activeConversationId, normalizeDbMessages(messagesQuery.data));
    }
  }, [activeConversationId, hydrateMessages, messagesQuery.data]);

  const sending = sendMutation.isPending;
  const visibleToolCalls = useMemo(() => toolCalls.slice(-4), [toolCalls]);

  const handleSend = async (content: string): Promise<void> => {
    if (activeConversationId === null) {
      return;
    }

    addUserMessage(activeConversationId, content);

    await sendMutation.mutateAsync({
      conversationId: activeConversationId,
      userMessage: content,
      ...(selectedProjectId !== null ? { projectId: selectedProjectId } : {}),
      model: preferences?.model ?? getDefaultModelForProvider(DEFAULT_CONVERSATION_PROVIDER),
      provider: preferences?.provider ?? DEFAULT_CONVERSATION_PROVIDER,
    });
  };

  const handleAbort = async (): Promise<void> => {
    if (activeConversationId === null) {
      return;
    }

    await abortMutation.mutateAsync({
      conversationId: activeConversationId,
    });
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ConversationHeader
        preferences={preferences}
        sessionStatus={sessionStatus}
        tokenUsage={tokenUsage}
        canUseOpenAI={settingsStatusQuery.data?.openaiConfigured ?? false}
        running={running}
        onProviderChange={(provider) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, {
            provider,
            model: getDefaultModelForProvider(provider),
          });
        }}
        onModelChange={(model) => {
          if (activeConversationId === null) {
            return;
          }

          updateConversationPreferences(activeConversationId, { model });
        }}
        onRename={async (title) => {
          if (activeConversationId === null) {
            return;
          }

          const renamed = await renameMutation.mutateAsync({ id: activeConversationId, title });
          if (renamed !== null) {
            updateConversationPreferences(activeConversationId, { title: renamed.title });
            await utils.conversations.list.invalidate();
          }
        }}
      />

      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-border-1 bg-surface-1 pl-1">
        {(['overview', 'chat', 'tasks', 'logs'] as CenterTab[]).map((tab) => {
          const active = activeTab === tab;
          const disabled = (tab === 'tasks' || tab === 'overview') && selectedProjectId === null;
          const badge = tab === 'logs' && godotLogs.length > 0 ? godotLogs.length : null;
          return (
            <button
              key={tab}
              onClick={() => { if (!disabled) setActiveTab(tab); }}
              className={[
                '-mb-px flex items-center gap-1.5 border-b-2 border-x-0 border-t-0 bg-transparent px-4 py-2 font-mono text-11 capitalize transition-colors duration-[120ms]',
                disabled ? 'cursor-not-allowed border-transparent text-fg-3'
                  : active ? 'cursor-pointer border-accent font-medium text-fg-0'
                  : 'cursor-pointer border-transparent text-fg-2',
              ].join(' ')}
            >
              {tab}
              {badge !== null && (
                <span className="rounded-[3px] border border-border-2 bg-surface-3 px-1 py-px font-mono text-9 text-fg-2">
                  {badge > 999 ? '999+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' ? (
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-1 p-6">
          {selectedProjectId === null ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-fg-3">
              No project selected
            </div>
          ) : planQuery.isLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <ProjectOverview
              plan={planQuery.data as TaskPlan | null}
              info={projectInfoQuery.data ?? null}
            />
          )}
        </div>
      ) : activeTab === 'chat' ? (
        <>
          {messagesQuery.isLoading ? (
            <div className="flex flex-1 flex-col gap-4 p-5">
              <Skeleton className="h-20 w-[72%]" />
              <Skeleton className="ml-auto h-16 w-[58%]" />
              <Skeleton className="h-32 w-[80%]" />
            </div>
          ) : (
            <MessageList messages={messages} toolCalls={visibleToolCalls} />
          )}
          <Separator />
          <ChatComposer disabled={activeConversationId === null} sending={running || sending} onSend={handleSend} onAbort={handleAbort} />
        </>
      ) : activeTab === 'tasks' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {selectedProjectId !== null ? (
            <TaskPlanCard projectId={selectedProjectId} />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-xs text-fg-3">
              No project selected
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="flex shrink-0 items-center justify-between border-b border-border-1 px-3 py-1.5">
            <span className="font-mono text-10 uppercase tracking-[0.1em] text-fg-3">
              {godotLogs.length} {godotLogs.length === 1 ? 'line' : 'lines'}
            </span>
            <button
              onClick={() => clearGodotLogs()}
              disabled={godotLogs.length === 0}
              className="cursor-pointer rounded border border-border-2 bg-surface-3 px-2 py-0.5 font-mono text-10 text-fg-1 transition-colors duration-[120ms] hover:bg-surface-4 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-3"
            >
              Clear logs
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono text-11 leading-[1.5]">
            {godotLogs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-fg-3">
                No runtime logs yet. Launch Godot to stream stdout/stderr here.
              </div>
            ) : (
              <div className="flex flex-col gap-px">
                {godotLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex gap-2 whitespace-pre-wrap break-all"
                  >
                    <span className={`shrink-0 ${log.stream === 'stderr' ? 'text-warning' : 'text-fg-3'}`}>
                      [{log.stream}]
                    </span>
                    <span className={log.stream === 'stderr' ? 'text-warning' : 'text-fg-1'}>
                      {log.line}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
