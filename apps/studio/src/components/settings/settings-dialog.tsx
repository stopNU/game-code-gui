import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FolderOpen, KeyRound, LoaderCircle, MoonStar, Settings2, SunMedium, Wrench } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { trpc } from '@renderer/lib/trpc';
import type { ThemePreference } from '@renderer/store/conversation-store';

type SettingsTab = 'workspace' | 'api' | 'langsmith' | 'godot' | 'about';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'api', label: 'API Keys' },
  { id: 'langsmith', label: 'LangSmith' },
  { id: 'godot', label: 'Godot' },
  { id: 'about', label: 'About' },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-3xl border border-border bg-background/55 p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  onThemeChange,
}: SettingsDialogProps): JSX.Element | null {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<SettingsTab>('workspace');
  const statusQuery = trpc.settings.getStatus.useQuery(undefined, { enabled: open });
  const workspaceQuery = trpc.settings.getWorkspaceRoot.useQuery(undefined, { enabled: open });
  const langsmithQuery = trpc.langsmith.getStatus.useQuery(undefined, { enabled: open });
  const runtimeQuery = trpc.runtime.getStatus.useQuery(undefined, { enabled: open });
  const doctorOutputQuery = trpc.runtime.getDoctorOutput.useQuery(undefined, { enabled: open });
  const anthropicKeyQuery = trpc.settings.getApiKey.useQuery({ name: 'anthropic' }, { enabled: open });
  const openaiKeyQuery = trpc.settings.getApiKey.useQuery({ name: 'openai' }, { enabled: open });
  const falKeyQuery = trpc.settings.getApiKey.useQuery({ name: 'fal' }, { enabled: open });
  const langsmithKeyQuery = trpc.settings.getApiKey.useQuery({ name: 'langsmith' }, { enabled: open });
  const godotPathQuery = trpc.settings.getApiKey.useQuery({ name: 'godotPath' }, { enabled: open });
  const claudePathQuery = trpc.settings.getApiKey.useQuery({ name: 'claudePath' }, { enabled: open });
  const chooseDirectory = trpc.runtime.chooseDirectory.useMutation();
  const chooseFile = trpc.runtime.chooseFile.useMutation();
  const openPath = trpc.runtime.openPath.useMutation();
  const openLogFile = trpc.runtime.openLogFile.useMutation();
  const setWorkspaceRoot = trpc.settings.setWorkspaceRoot.useMutation();
  const setApiKey = trpc.settings.setApiKey.useMutation();
  const setSetting = trpc.settings.set.useMutation();

  const [workspaceRoot, setWorkspaceRootValue] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [falKey, setFalKey] = useState('');
  const [langsmithKey, setLangsmithKey] = useState('');
  const [godotPath, setGodotPath] = useState('');
  const [claudePath, setClaudePath] = useState('');
  const [langsmithEnabled, setLangsmithEnabled] = useState(false);
  const [langsmithProject, setLangsmithProject] = useState('harness-studio');
  const [langsmithEndpoint, setLangsmithEndpoint] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setWorkspaceRootValue(workspaceQuery.data ?? statusQuery.data?.workspaceRoot ?? '');
  }, [open, statusQuery.data?.workspaceRoot, workspaceQuery.data]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setAnthropicKey(anthropicKeyQuery.data ?? '');
    setOpenaiKey(openaiKeyQuery.data ?? '');
    setFalKey(falKeyQuery.data ?? '');
    setLangsmithKey(langsmithKeyQuery.data ?? '');
    setGodotPath(godotPathQuery.data ?? '');
    setClaudePath(claudePathQuery.data ?? '');
  }, [
    anthropicKeyQuery.data,
    claudePathQuery.data,
    falKeyQuery.data,
    godotPathQuery.data,
    langsmithKeyQuery.data,
    open,
    openaiKeyQuery.data,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setLangsmithEnabled(langsmithQuery.data?.enabled ?? false);
    setLangsmithProject(langsmithQuery.data?.projectName ?? 'harness-studio');
    setLangsmithEndpoint(langsmithQuery.data?.endpoint ?? '');
  }, [langsmithQuery.data?.enabled, langsmithQuery.data?.endpoint, langsmithQuery.data?.projectName, open]);

  const isBusy =
    setWorkspaceRoot.isPending ||
    setApiKey.isPending ||
    setSetting.isPending ||
    chooseDirectory.isPending ||
    chooseFile.isPending ||
    openLogFile.isPending ||
    openPath.isPending;

  const aboutDoctorOutput = useMemo(() => {
    if (doctorOutputQuery.isPending) {
      return 'Running doctor checks...';
    }

    return doctorOutputQuery.data ?? 'Doctor output unavailable.';
  }, [doctorOutputQuery.data, doctorOutputQuery.isPending]);

  if (!open) {
    return null;
  }

  const runWithFeedback = async (successMessage: string, action: () => Promise<void>): Promise<void> => {
    try {
      await action();
      setFeedback({ tone: 'success', message: successMessage });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const saveWorkspace = async (): Promise<void> => {
    await runWithFeedback('Workspace root saved.', async () => {
      await setWorkspaceRoot.mutateAsync({ path: workspaceRoot });
      await Promise.all([utils.settings.getStatus.invalidate(), utils.settings.getWorkspaceRoot.invalidate()]);
    });
  };

  const saveApiKeys = async (): Promise<void> => {
    await runWithFeedback('API keys updated.', async () => {
      await Promise.all([
        setApiKey.mutateAsync({ name: 'anthropic', value: anthropicKey }),
        setApiKey.mutateAsync({ name: 'openai', value: openaiKey }),
        setApiKey.mutateAsync({ name: 'fal', value: falKey }),
      ]);
      await Promise.all([
        utils.settings.getStatus.invalidate(),
        utils.settings.getApiKey.invalidate({ name: 'anthropic' }),
        utils.settings.getApiKey.invalidate({ name: 'openai' }),
        utils.settings.getApiKey.invalidate({ name: 'fal' }),
      ]);
    });
  };

  const saveLangSmith = async (): Promise<void> => {
    await runWithFeedback('LangSmith settings saved.', async () => {
      await Promise.all([
        setApiKey.mutateAsync({ name: 'langsmith', value: langsmithKey }),
        setSetting.mutateAsync({ key: 'langsmith.enabled', value: String(langsmithEnabled) }),
        setSetting.mutateAsync({ key: 'langsmith.project', value: langsmithProject }),
        setSetting.mutateAsync({ key: 'langsmith.endpoint', value: langsmithEndpoint }),
      ]);
      await Promise.all([
        utils.langsmith.getStatus.invalidate(),
        utils.settings.getApiKey.invalidate({ name: 'langsmith' }),
      ]);
    });
  };

  const saveGodot = async (): Promise<void> => {
    await runWithFeedback('Tool paths saved.', async () => {
      await Promise.all([
        setApiKey.mutateAsync({ name: 'godotPath', value: godotPath }),
        setApiKey.mutateAsync({ name: 'claudePath', value: claudePath }),
      ]);
      await Promise.all([
        utils.settings.getApiKey.invalidate({ name: 'godotPath' }),
        utils.settings.getApiKey.invalidate({ name: 'claudePath' }),
      ]);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className="flex h-[min(820px,92vh)] w-full max-w-6xl overflow-hidden rounded-[32px] border border-border bg-card shadow-glow">
        <aside className="flex w-[240px] flex-col gap-3 border-r border-border bg-background/60 p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-primary">Settings</div>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Studio preferences</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Configure the workspace, credentials, tracing, runtime tools, and UI theme.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {TABS.map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                className={activeTab === tab.id ? 'justify-start rounded-2xl bg-primary/10 text-foreground' : 'justify-start rounded-2xl'}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <Section title="Theme" description="Dark is the default, but Studio can switch to a lighter work surface.">
            <div className="flex gap-2">
              <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => onThemeChange('dark')}>
                <MoonStar className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => onThemeChange('light')}>
                <SunMedium className="mr-2 h-4 w-4" />
                Light
              </Button>
            </div>
          </Section>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-primary">
                <Settings2 className="h-4 w-4" />
                Harness Studio
              </div>
              {feedback !== null ? (
                <p className={feedback.tone === 'error' ? 'mt-2 text-sm text-destructive' : 'mt-2 text-sm text-accent'}>
                  {feedback.message}
                </p>
              ) : null}
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {activeTab === 'workspace' ? (
                <Section
                  title="Workspace Root"
                  description="Studio scans projects that live under this root and uses it as the default output base."
                >
                  <div className="flex gap-3">
                    <Input value={workspaceRoot} onChange={(event) => setWorkspaceRootValue(event.target.value)} />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const nextPath = await chooseDirectory.mutateAsync({
                          ...(workspaceRoot.length > 0 ? { defaultPath: workspaceRoot } : {}),
                        });
                        if (nextPath !== null) {
                          setWorkspaceRootValue(nextPath);
                        }
                      }}
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      Browse
                    </Button>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => void saveWorkspace()} disabled={isBusy || workspaceRoot.trim().length === 0}>
                      Save workspace
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void openPath.mutateAsync({ path: statusQuery.data?.workspaceRoot ?? workspaceRoot })}
                      disabled={(statusQuery.data?.workspaceRoot ?? workspaceRoot).trim().length === 0}
                    >
                      Open folder
                    </Button>
                  </div>
                </Section>
              ) : null}

              {activeTab === 'api' ? (
                <Section
                  title="Provider Keys"
                  description="Anthropic is required for the main harness flow."
                >
                  {!statusQuery.data?.anthropicConfigured ? (
                    <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
                      Anthropic is not configured yet, so conversation turns will fail until a key is saved.
                    </div>
                  ) : null}
                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Anthropic</span>
                      <Input type="password" value={anthropicKey} onChange={(event) => setAnthropicKey(event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">OpenAI</span>
                      <Input type="password" value={openaiKey} onChange={(event) => setOpenaiKey(event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">FAL</span>
                      <Input type="password" value={falKey} onChange={(event) => setFalKey(event.target.value)} />
                    </label>
                  </div>
                  <div className="mt-4">
                    <Button onClick={() => void saveApiKeys()} disabled={isBusy}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Save keys
                    </Button>
                  </div>
                </Section>
              ) : null}

              {activeTab === 'langsmith' ? (
                <Section
                  title="Tracing"
                  description="Records every conversation turn and tool call to LangSmith so you can inspect inputs, outputs, and token usage in the LangSmith dashboard."
                >
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={langsmithEnabled}
                      onChange={(event) => setLangsmithEnabled(event.target.checked)}
                    />
                    Enable LangSmith tracing
                  </label>
                  <div className="mt-4 grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">API key</span>
                      <Input type="password" value={langsmithKey} onChange={(event) => setLangsmithKey(event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Project name</span>
                      <Input value={langsmithProject} onChange={(event) => setLangsmithProject(event.target.value)} />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Endpoint</span>
                      <Input value={langsmithEndpoint} onChange={(event) => setLangsmithEndpoint(event.target.value)} />
                    </label>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Button onClick={() => void saveLangSmith()} disabled={isBusy}>
                      Save LangSmith
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Status: {langsmithQuery.data?.configured ? 'configured' : 'inactive'}
                    </div>
                  </div>
                </Section>
              ) : null}

              {activeTab === 'godot' ? (
                <Section
                  title="Executable Paths"
                  description="Point Studio at Godot and any local Claude binary if they are not already on PATH."
                >
                  <div className="grid gap-4">
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Godot path</span>
                      <div className="flex gap-3">
                        <Input value={godotPath} onChange={(event) => setGodotPath(event.target.value)} />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const nextPath = await chooseFile.mutateAsync({
                              ...(godotPath.length > 0 ? { defaultPath: godotPath } : {}),
                              filters: [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd'] }],
                            });
                            if (nextPath !== null) {
                              setGodotPath(nextPath);
                            }
                          }}
                        >
                          Browse
                        </Button>
                      </div>
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-medium text-foreground">Claude path</span>
                      <div className="flex gap-3">
                        <Input value={claudePath} onChange={(event) => setClaudePath(event.target.value)} />
                        <Button
                          variant="outline"
                          onClick={async () => {
                            const nextPath = await chooseFile.mutateAsync({
                              ...(claudePath.length > 0 ? { defaultPath: claudePath } : {}),
                              filters: [{ name: 'Executables', extensions: ['exe', 'bat', 'cmd'] }],
                            });
                            if (nextPath !== null) {
                              setClaudePath(nextPath);
                            }
                          }}
                        >
                          Browse
                        </Button>
                      </div>
                    </label>
                  </div>
                  <div className="mt-4">
                    <Button onClick={() => void saveGodot()} disabled={isBusy}>
                      <Wrench className="mr-2 h-4 w-4" />
                      Save paths
                    </Button>
                  </div>
                </Section>
              ) : null}

              {activeTab === 'about' ? (
                <>
                  <Section
                    title="Build Info"
                    description="Version, update status, logs, and basic doctor output for this desktop app."
                  >
                    <div className="grid gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-4">
                        <span>Version</span>
                        <span className="text-foreground">{runtimeQuery.data?.appVersion ?? 'loading'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Updates</span>
                        <span className="text-foreground">{runtimeQuery.data?.updateState.status ?? 'unknown'}</span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" onClick={() => void openLogFile.mutateAsync()}>
                          Open Log File
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            void doctorOutputQuery.refetch();
                          }}
                          disabled={doctorOutputQuery.isFetching}
                        >
                          {doctorOutputQuery.isFetching ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Refresh doctor
                        </Button>
                      </div>
                    </div>
                  </Section>

                  <Section title="Doctor Output" description="A quick environment check for the Electron package.">
                    <pre className="overflow-auto rounded-2xl border border-border bg-card/70 p-4 text-xs text-muted-foreground">
                      {aboutDoctorOutput}
                    </pre>
                  </Section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
