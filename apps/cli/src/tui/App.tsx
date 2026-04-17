import React, { useState } from 'react';
import { Box } from 'ink';
import { useInput } from 'ink';
import { SetupScreen } from './screens/SetupScreen.js';
import { ImplementScreen } from './screens/ImplementScreen.js';
import { IterateScreen } from './screens/IterateScreen.js';
import { PlanReviewScreen } from './screens/PlanReviewScreen.js';
import { DoneScreen } from './screens/DoneScreen.js';
import { StartGameScreen } from './screens/StartGameScreen.js';
import { CommandPicker } from './components/CommandPicker.js';
import { ModelPicker } from './components/ModelPicker.js';
import { Header } from './components/Header.js';
import type { TuiProps, ScreenName, DoneData } from './types.js';
import { MODELS } from '@agent-harness/core';

interface AppProps extends TuiProps {
  onStartGame?: (projectPath: string) => void;
}

export function App({ command: initialCommand, options, onStartGame }: AppProps) {
  // If command was pre-supplied via CLI args, skip the command picker
  const [command, setCommand] = useState<'new-game' | 'plan-game' | 'implement-task' | 'iterate' | 'start-game' | null>(
    initialCommand ?? null,
  );

  // If --model was pre-supplied via CLI flag, skip the model picker
  const presetModel = options['model'] as string | undefined;
  const [selectedModel, setSelectedModel] = useState<string | null>(presetModel ?? null);

  const [screen, setScreen] = useState<ScreenName>(() => {
    if (!initialCommand) return 'command';
    if (!presetModel) return 'model';
    if (initialCommand === 'implement-task') return 'implement';
    if (initialCommand === 'iterate') return 'iterate';
    return 'setup'; // new-game and plan-game both use SetupScreen
  });

  const [doneData, setDoneData] = useState<DoneData | null>(null);
  const [planReviewPath, setPlanReviewPath] = useState<string | null>(null);
  // Overrides for options when transitioning from plan-review → implement
  const [pendingImplOptions, setPendingImplOptions] = useState<Record<string, unknown> | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);

  useInput((_, key) => {
    if (key.escape && screen === 'done') {
      process.exit(0);
    }
  });

  function handleDone(data: DoneData) {
    // plan-game routes to the plan review screen instead of done
    if (command === 'plan-game' && data.outputPath) {
      setPlanReviewPath(data.outputPath);
      setScreen('plan-review');
      return;
    }
    setDoneData(data);
    setScreen('done');
  }

  function handleCommandSelect(cmd: 'new-game' | 'plan-game' | 'implement-task' | 'iterate' | 'start-game') {
    setCommand(cmd);
    if (cmd === 'start-game') {
      setScreen('start-game');
      return;
    }
    // Always go to model selection after picking a command
    const nextScreen = selectedModel
      ? cmd === 'implement-task' ? 'implement'
      : cmd === 'iterate' ? 'iterate'
      : 'setup'
      : 'model';
    setScreen(nextScreen);
  }

  function handleModelSelect(modelId: string) {
    setSelectedModel(modelId);
    setScreen(
      command === 'implement-task' ? 'implement'
      : command === 'iterate' ? 'iterate'
      : 'setup',
    );
  }

  const modelLabel = selectedModel
    ? (MODELS.find((m) => m.id === selectedModel)?.label ?? selectedModel)
    : undefined;

  if (screen === 'command') {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness" hint="↑/↓ navigate · Enter confirm" />
        <CommandPicker onSelect={handleCommandSelect} />
      </Box>
    );
  }

  if (screen === 'model') {
    return (
      <Box flexDirection="column" height="100%">
        <Header
          title=" game-harness"
          {...(command !== null ? { subtitle: command } : {})}
          hint="↑/↓ navigate · Enter confirm"
        />
        <ModelPicker onSelect={handleModelSelect} />
      </Box>
    );
  }

  if (screen === 'setup') {
    const effectiveOptions = {
      ...options,
      ...(selectedModel !== null ? { model: selectedModel } : {}),
      // plan-game always runs in plan-only mode
      ...(command === 'plan-game' ? { planOnly: true } : {}),
    };
    return (
      <SetupScreen
        options={effectiveOptions}
        selectedModel={selectedModel ?? undefined}
        modelLabel={modelLabel}
        onAgentStart={() => setAgentRunning(true)}
        onAgentStop={() => setAgentRunning(false)}
        onDone={handleDone}
      />
    );
  }

  if (screen === 'plan-review') {
    return (
      <PlanReviewScreen
        outputPath={planReviewPath!}
        {...(doneData?.gameTitle !== undefined ? { gameTitle: doneData.gameTitle } : {})}
        onStart={(projectPath) => {
          setPendingImplOptions({
            ...options,
            ...(selectedModel !== null ? { model: selectedModel } : {}),
            project: projectPath,
            resume: true,
          });
          setCommand('implement-task');
          setScreen('implement');
        }}
      />
    );
  }

  if (screen === 'iterate') {
    return (
      <IterateScreen
        options={{
          ...options,
          ...(selectedModel !== null ? { model: selectedModel } : {}),
        }}
        selectedModel={selectedModel ?? undefined}
        onAgentStart={() => setAgentRunning(true)}
        onAgentStop={() => setAgentRunning(false)}
        onDone={handleDone}
      />
    );
  }

  if (screen === 'implement') {
    const effectiveOptions = pendingImplOptions ?? {
      ...options,
      ...(selectedModel !== null ? { model: selectedModel } : {}),
    };
    return (
      <ImplementScreen
        options={effectiveOptions}
        selectedModel={selectedModel ?? undefined}
        onAgentStart={() => setAgentRunning(true)}
        onAgentStop={() => setAgentRunning(false)}
        onDone={handleDone}
        {...(onStartGame !== undefined ? { onStartGame } : {})}
      />
    );
  }

  if (screen === 'start-game') {
    return (
      <StartGameScreen
        onStartGame={(projectPath) => onStartGame?.(projectPath)}
      />
    );
  }

  return (
    <DoneScreen
      data={doneData!}
      agentWasRunning={agentRunning}
      {...(onStartGame !== undefined && doneData?.outputPath !== undefined
        ? { onStartGame: () => onStartGame(doneData!.outputPath!) }
        : {})}
    />
  );
}
