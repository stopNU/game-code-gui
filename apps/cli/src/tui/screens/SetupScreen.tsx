import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { join, dirname } from 'path';
import { readdir, readFile, stat } from 'fs/promises';
import { Header } from '../components/Header.js';
import { ChatLog } from '../components/ChatLog.js';
import { TaskList } from '../components/TaskList.js';
import { useNewGame, type ClarifyAnswers } from '../hooks/useNewGame.js';
import type { DoneData } from '../types.js';
import { loadHarnessConfig } from '../../utils/config-loader.js';

type GameMode = 'simple' | 'advanced';

const MODE_OPTIONS: { value: GameMode; label: string; description: string }[] = [
  { value: 'simple',   label: 'Simple',   description: 'Phaser arcade physics · platformer / shooter / puzzle' },
  { value: 'advanced', label: 'Advanced', description: 'Data-driven · deckbuilder / roguelike / RPG / strategy' },
];

/** Walk up from CWD until a directory containing `plans/` is found. */
async function findPlansDir(): Promise<string | null> {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'plans');
    try {
      await stat(candidate);
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

interface PlanFile {
  filename: string;
  title: string;
  dir: string;
}

function findLast<T>(arr: T[], pred: (x: T) => boolean): T | undefined {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return arr[i];
  }
  return undefined;
}

interface SetupScreenProps {
  options: Record<string, unknown>;
  selectedModel?: string | undefined;
  modelLabel?: string | undefined;
  onAgentStart: () => void;
  onAgentStop: () => void;
  onDone: (data: DoneData) => void;
}

type ClarifyField = 'genre' | 'theme' | 'mechanic';
const CLARIFY_QUESTIONS: { field: ClarifyField; label: string }[] = [
  { field: 'genre', label: 'Genre / gameplay style (platformer, puzzle, shooter, idle…)' },
  { field: 'theme', label: 'Theme or setting (space, medieval, underwater…)' },
  { field: 'mechanic', label: 'One must-have mechanic (double jump, inventory, time rewind…)' },
];

export function SetupScreen({ options, selectedModel, modelLabel, onAgentStart, onAgentStop, onDone }: SetupScreenProps) {
  // If --advanced was passed on the CLI, skip the mode picker
  const [chosenMode, setChosenMode] = useState<GameMode | null>(
    options['advanced'] === true ? 'advanced' : null,
  );
  const [modeIndex, setModeIndex] = useState(0);

  // Plan file picker (advanced only)
  const [planFiles, setPlanFiles] = useState<PlanFile[] | null>(null); // null = loading
  const [planFileIndex, setPlanFileIndex] = useState(0);
  const [planFilePicked, setPlanFilePicked] = useState<string | null>(null); // filename | 'new' | null

  const [selectedPlanTitle, setSelectedPlanTitle] = useState<string | null>(null);
  const [selectedPlanContent, setSelectedPlanContent] = useState<string | null>(null);
  const [isLoadingSelectedPlan, setIsLoadingSelectedPlan] = useState(false);
  const [gameNameDraft, setGameNameDraft] = useState((options['name'] as string | undefined) ?? '');
  const [briefDraft, setBriefDraft] = useState((options['brief'] as string | undefined) ?? '');
  const [clarifyIndex, setClarifyIndex] = useState(0);
  const [clarifyDraft, setClarifyDraft] = useState('');
  const [clarifyAnswers, setClarifyAnswers] = useState<Partial<ClarifyAnswers>>({});

  const effectiveOptions: Record<string, unknown> = chosenMode !== null
    ? { ...options, advanced: chosenMode === 'advanced' }
    : options;

  const {
    phase,
    entries,
    plan,
    activeTaskId,
    completedIds,
    outputPath,
    streamingText,
    submitBrief,
    submitClarify,
    skipClarify,
    abort,
  } = useNewGame(effectiveOptions, selectedModel);

  function submitLoadedBrief(): void {
    const currentName = gameNameDraft.trim();
    const canSubmit = Boolean(effectiveOptions['output']) || currentName.length > 0;
    if (!canSubmit || phase !== 'brief') return;

    if (selectedPlanContent) {
      submitBrief(selectedPlanContent, currentName);
      setSelectedPlanContent(null);
      return;
    }

    if (options['brief']) {
      submitBrief(options['brief'] as string, currentName);
    }
  }

  // Load config once
  useEffect(() => {
    try { loadHarnessConfig(); } catch { /* ignore */ }
  }, []);

  // Load plan files when advanced mode is chosen
  useEffect(() => {
    if (chosenMode !== 'advanced') return;
    // If --advanced was passed with a brief flag, skip the picker entirely
    if (options['brief'] ?? options['briefFile']) {
      setSelectedPlanTitle('Provided via CLI');
      setPlanFilePicked('new');
      return;
    }
    findPlansDir().then(async (plansDir) => {
      if (!plansDir) {
        setPlanFiles([]);
        setPlanFilePicked('new');
        return;
      }
      const files = await readdir(plansDir);
      const mdFiles = files.filter((f) => f.endsWith('.md'));
      const loaded = await Promise.all(
        mdFiles.map(async (f) => {
          try {
            const content = await readFile(join(plansDir, f), 'utf8');
            const match = content.match(/^#\s+(.+)$/m);
            return { filename: f, title: match ? match[1]! : f.replace('.md', ''), dir: plansDir };
          } catch {
            return { filename: f, title: f.replace('.md', ''), dir: plansDir };
          }
        }),
      );
      setPlanFiles(loaded);
      if (loaded.length === 0) setPlanFilePicked('new');
    }).catch(() => {
      setPlanFiles([]);
      setPlanFilePicked('new');
    });
  }, [chosenMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // When a plan file is selected, load it into the brief draft first.
  useEffect(() => {
    if (!planFilePicked || planFilePicked === 'new') {
      setSelectedPlanTitle(null);
      return;
    }
    setIsLoadingSelectedPlan(true);
    findPlansDir().then(async (plansDir) => {
      if (!plansDir) { setPlanFilePicked('new'); return; }
      const content = await readFile(join(plansDir, planFilePicked), 'utf8');
      setSelectedPlanContent(content);
      const matchedPlan = planFiles?.find((planFile) => planFile.filename === planFilePicked);
      setSelectedPlanTitle(matchedPlan?.title ?? planFilePicked.replace(/\.md$/i, ''));
    }).catch(() => setPlanFilePicked('new'))
      .finally(() => setIsLoadingSelectedPlan(false));
  }, [planFilePicked, planFiles]);

  // Notify parent when agent starts/stops
  useEffect(() => {
    if (phase === 'planning' || phase === 'scaffolding' || phase === 'installing' || phase === 'implementing') {
      onAgentStart();
    }
    if (phase === 'done' || phase === 'error') {
      onAgentStop();
    }
  }, [phase, onAgentStart, onAgentStop]);

  // Transition to DoneScreen when complete
  useEffect(() => {
    if (phase === 'done' && outputPath) {
      const doneEntry = findLast(entries, (e) => e.kind === 'done') as
        | { kind: 'done'; summary: string }
        | undefined;
      onDone({
        success: true,
        summary: doneEntry?.summary ?? 'Game ready.',
        filesModified: [],
        ...(plan?.gameTitle !== undefined ? { gameTitle: plan.gameTitle } : {}),
        outputPath,
      });
    }
    if (phase === 'error') {
      const errEntry = findLast(entries, (e) => e.kind === 'error') as
        | { kind: 'error'; text: string }
        | undefined;
      onDone({
        success: false,
        summary: errEntry?.text ?? 'An error occurred.',
        filesModified: [],
      });
    }
  }, [phase, outputPath, entries, plan, onDone]);

  useInput((_, key) => {
    // 1. Mode picker
    if (chosenMode === null) {
      if (key.upArrow || key.tab) {
        setModeIndex((i) => (i + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length);
      } else if (key.downArrow) {
        setModeIndex((i) => (i + 1) % MODE_OPTIONS.length);
      } else if (key.return) {
        setChosenMode(MODE_OPTIONS[modeIndex]!.value);
      }
      return;
    }

    // 2. Plan file picker (advanced, files loaded, not yet picked)
    if (chosenMode === 'advanced' && planFiles !== null && planFiles.length > 0 && planFilePicked === null) {
      const total = planFiles.length + 1; // +1 for "New brief…"
      if (key.upArrow) {
        setPlanFileIndex((i) => (i + total - 1) % total);
      } else if (key.downArrow) {
        setPlanFileIndex((i) => (i + 1) % total);
      } else if (key.return) {
        if (planFileIndex === planFiles.length) {
          setPlanFilePicked('new');
        } else {
          setPlanFilePicked(planFiles[planFileIndex]!.filename);
        }
      }
      return;
    }

    if (key.escape && phase === 'clarifying') {
      skipClarify();
    }
    if (key.escape && (phase === 'implementing' || phase === 'planning')) {
      abort();
    }
  });

  const modelSuffix = modelLabel ? ` · ${modelLabel}` : '';
  const subtitle = plan
    ? `${plan.gameTitle} · ${plan.genre}${modelSuffix}`
    : chosenMode !== null
    ? `mode: ${chosenMode}${modelSuffix}`
    : modelLabel
    ? modelLabel
    : undefined;
  const isRunning =
    phase === 'planning' || phase === 'scaffolding' || phase === 'installing' || phase === 'implementing';

  // ── Screen: mode picker ──
  if (chosenMode === null) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness  new-game" hint="↑/↓ to navigate · Enter to confirm" />
        <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
          <Text bold color="cyan">Select game mode:</Text>
          <Box flexDirection="column" marginTop={1}>
            {MODE_OPTIONS.map((opt, i) => (
              <Box key={opt.value} marginTop={i === 0 ? 0 : 1}>
                <Text {...(modeIndex === i ? { color: 'green' as const } : {})} bold={modeIndex === i}>
                  {modeIndex === i ? '❯ ' : '  '}
                </Text>
                <Box flexDirection="column">
                  <Text bold={modeIndex === i} color={modeIndex === i ? 'green' : 'white'}>
                    {opt.label}
                  </Text>
                  <Text dimColor>{opt.description}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Screen: plan file picker (advanced, files present, not yet chosen) ──
  if (chosenMode === 'advanced' && planFiles === null) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness  new-game" subtitle="mode: advanced" hint="Loading plans…" />
        <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
          <Text dimColor>Loading plans directory…</Text>
        </Box>
      </Box>
    );
  }

  if (chosenMode === 'advanced' && planFiles !== null && planFiles.length > 0 && planFilePicked === null) {
    const allOptions = [
      ...planFiles.map((f) => ({ label: f.title, sub: f.filename })),
      { label: 'New brief…', sub: 'Enter a description instead' },
    ];
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness  new-game" subtitle="mode: advanced" hint="↑/↓ to navigate · Enter to confirm" />
        <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
          <Text bold color="cyan">Select a plan:</Text>
          <Box flexDirection="column" marginTop={1}>
            {allOptions.map((opt, i) => (
              <Box key={i} marginTop={i === 0 ? 0 : 1}>
                <Text {...(planFileIndex === i ? { color: 'green' as const } : {})} bold={planFileIndex === i}>
                  {planFileIndex === i ? '❯ ' : '  '}
                </Text>
                <Box flexDirection="column">
                  <Text bold={planFileIndex === i} color={planFileIndex === i ? 'green' : 'white'}>
                    {opt.label}
                  </Text>
                  <Text dimColor>{opt.sub}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  // ── Screen: loading selected plan file ──
  if (chosenMode === 'advanced' && planFilePicked !== null && planFilePicked !== 'new' && isLoadingSelectedPlan) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness  new-game" subtitle="mode: advanced" hint="Loading plan…" />
        <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
          <Text dimColor>Loading {planFilePicked}…</Text>
        </Box>
      </Box>
    );
  }

  // ── Screen: brief input + agent flow ──
  return (
    <Box flexDirection="column" height="100%">
      <Header
        title=" game-harness  new-game"
        {...(subtitle !== undefined ? { subtitle } : {})}
        hint={chosenMode === 'advanced' ? 'Advanced mode — no follow-up questions' : 'Esc to skip questions'}
      />

      <Box flexDirection="row" flexGrow={1}>
        {/* Left: chat */}
        <Box flexDirection="column" flexGrow={1} marginRight={2}>
          {phase === 'brief' && (
            <Box flexDirection="column">
              <Text bold color="cyan">
                Game name:
              </Text>
              <Box marginTop={1}>
                <Text color="green">❯ </Text>
                <TextInput
                  value={gameNameDraft}
                  onChange={setGameNameDraft}
                  onSubmit={() => {
                    submitLoadedBrief();
                  }}
                  placeholder="e.g. Neon Drift"
                />
              </Box>
              {!(effectiveOptions['output'] ?? false) && gameNameDraft.trim().length === 0 && (
                <Text color="red">Please enter a game name so we can name the project folder</Text>
              )}
              <Box marginTop={1}>
                <Text bold color="cyan">
                  {chosenMode === 'advanced'
                    ? 'Describe your game in detail (systems, mechanics, content):'
                    : 'Describe your game:'}
                </Text>
              </Box>
              {selectedPlanContent && selectedPlanTitle && (
                <Box marginTop={1} flexDirection="column">
                  <Text color="green">Using saved brief: {selectedPlanTitle}</Text>
                  <Text dimColor>Enter a game name and planning will start automatically.</Text>
                </Box>
              )}
              {chosenMode === 'advanced' && (
                <Box marginTop={1} flexDirection="column">
                  <Text dimColor>Include: game systems, core loop, content types, progression, win/lose conditions.</Text>
                  <Text dimColor>The more detail you provide, the better the generated plan.</Text>
                </Box>
              )}
              {!selectedPlanContent && (
                <Box marginTop={1}>
                  <Text color="green">❯ </Text>
                  <TextInput
                    value={briefDraft}
                    onChange={setBriefDraft}
                    onSubmit={(val) => {
                      const canSubmit = Boolean(effectiveOptions['output']) || gameNameDraft.trim().length > 0;
                      if (val.trim().length > 10 && canSubmit) submitBrief(val.trim(), gameNameDraft.trim());
                    }}
                    placeholder={
                      chosenMode === 'advanced'
                        ? 'e.g. A roguelike deckbuilder with 3 card factions, XP progression, and a boss every 5 floors…'
                        : 'e.g. A side-scrolling platformer where you play as a cat…'
                    }
                  />
                </Box>
              )}
              {!selectedPlanContent && briefDraft.trim().length > 0 && briefDraft.trim().length <= 10 && (
                <Text color="red">Please provide more detail (min 10 chars)</Text>
              )}
              {!effectiveOptions['output'] && ((selectedPlanContent !== null) || briefDraft.trim().length > 10) && gameNameDraft.trim().length === 0 && (
                <Text color="red">Add a game name before continuing</Text>
              )}
            </Box>
          )}

          {phase === 'clarifying' && (
            <Box flexDirection="column">
              <ChatLog entries={entries} isRunning={false} />
              <Box marginTop={1} flexDirection="column">
                <Text bold color="cyan">
                  {CLARIFY_QUESTIONS[clarifyIndex]?.label ?? ''}:
                </Text>
                <Box marginTop={1}>
                  <Text color="green">❯ </Text>
                  <TextInput
                    value={clarifyDraft}
                    onChange={setClarifyDraft}
                    onSubmit={(val) => {
                      const field = CLARIFY_QUESTIONS[clarifyIndex]?.field;
                      if (field) {
                        const updated = { ...clarifyAnswers, [field]: val };
                        setClarifyAnswers(updated);

                        if (clarifyIndex < CLARIFY_QUESTIONS.length - 1) {
                          setClarifyIndex(clarifyIndex + 1);
                          setClarifyDraft('');
                        } else {
                          submitClarify({
                            genre: updated.genre ?? '',
                            theme: updated.theme ?? '',
                            mechanic: updated.mechanic ?? '',
                          });
                        }
                      }
                    }}
                    placeholder="Press Enter to skip"
                  />
                </Box>
                <Text dimColor>
                  {clarifyIndex + 1}/{CLARIFY_QUESTIONS.length} — Esc to skip all
                </Text>
              </Box>
            </Box>
          )}

          {(isRunning || phase === 'done' || phase === 'error') && (() => {
            const spinnerLabel =
              phase === 'planning' ? 'Planning game... (Esc to cancel)'
              : phase === 'scaffolding' ? 'Scaffolding project...'
              : phase === 'installing' ? 'Installing dependencies...'
              : phase === 'implementing' ? 'Agent implementing tasks... (Esc to cancel)'
              : undefined;
            return (
              <ChatLog
                entries={entries}
                isRunning={isRunning}
                {...(spinnerLabel !== undefined ? { spinnerLabel } : {})}
                streamingText={streamingText}
              />
            );
          })()}
        </Box>

        {/* Right: task list (only once we have a plan) */}
        {plan ? (
          <Box width={30} flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            <TaskList
              plan={plan}
              {...(activeTaskId !== null ? { activeTaskId } : {})}
              completedIds={completedIds}
            />
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}
