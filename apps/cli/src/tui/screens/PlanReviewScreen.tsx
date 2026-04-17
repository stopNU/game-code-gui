import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { Header } from '../components/Header.js';
import type { TaskPlan } from '@agent-harness/core';

interface PlanReviewScreenProps {
  outputPath: string;
  gameTitle?: string | undefined;
  onStart: (projectPath: string) => void;
}

const ACTIONS = [
  {
    label: 'Start building now',
    value: 'start',
    description: 'Run the agent loop for all incomplete tasks',
  },
  {
    label: 'Exit & review later',
    value: 'exit',
    description: 'Print the resume command and exit',
  },
];

export function PlanReviewScreen({ outputPath, gameTitle, onStart }: PlanReviewScreenProps) {
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const tasksPath = join(outputPath, 'harness', 'tasks.json');
    readFile(tasksPath, 'utf8')
      .then((raw) => {
        setPlan(JSON.parse(raw) as TaskPlan);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : String(err));
      });
  }, [outputPath]);

  const lines = useMemo(() => {
    if (!plan) return [] as React.ReactNode[];

    const totalTasks = plan.phases.reduce((count, phase) => count + phase.tasks.length, 0);
    const sortedPhases = [...plan.phases].sort((a, b) => a.phase - b.phase);
    const nextLines: React.ReactNode[] = [
      <Text key="title" bold color="white">
        {plan.gameTitle}
      </Text>,
      <Text key="meta" dimColor>
        Genre: {plan.genre}
      </Text>,
      <Text key="loop" dimColor>
        Core loop: {plan.coreLoop}
      </Text>,
      <Text key="gap-0"> </Text>,
    ];

    for (const phase of sortedPhases) {
      const phaseLabel = (phase as { description?: string }).description;
      const phaseHeader = phaseLabel ? `Phase ${phase.phase}: ${phaseLabel}` : `Phase ${phase.phase}`;

      nextLines.push(
        <Text key={`phase-${phase.phase}`} bold color="cyan">
          {phaseHeader} <Text dimColor>({phase.tasks.length} tasks)</Text>
        </Text>,
      );

      for (const task of phase.tasks) {
        nextLines.push(
          <Text key={task.id}>
            {'  '}<Text dimColor>-</Text>{' '}
            <Text color="white">{task.id}</Text>
            <Text dimColor>: {task.title} </Text>
            <Text dimColor>[{task.role}]</Text>
          </Text>,
        );
      }

      nextLines.push(<Text key={`gap-${phase.phase}`}> </Text>);
    }

    nextLines.push(
      <Text key="total" dimColor>
        Total: {totalTasks} tasks across {plan.phases.length} phases
      </Text>,
    );

    return nextLines;
  }, [plan]);

  const terminalRows = process.stdout.rows ?? 24;
  const planViewportHeight = Math.max(8, terminalRows - 14);
  const maxScrollOffset = Math.max(0, lines.length - planViewportHeight);
  const clampedScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleLines = lines.slice(clampedScrollOffset, clampedScrollOffset + planViewportHeight);
  const canScrollUp = clampedScrollOffset > 0;
  const canScrollDown = clampedScrollOffset < maxScrollOffset;

  useEffect(() => {
    setScrollOffset((offset) => Math.min(offset, maxScrollOffset));
  }, [maxScrollOffset]);

  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setScrollOffset((offset) => Math.max(0, offset - 1));
    } else if (key.downArrow || input === 'j') {
      setScrollOffset((offset) => Math.min(maxScrollOffset, offset + 1));
    } else if (input === 'g') {
      setScrollOffset(0);
    } else if (input === 'G') {
      setScrollOffset(maxScrollOffset);
    }
  });

  function handleActionSelect(item: { value: string }) {
    if (item.value === 'start') {
      onStart(outputPath);
      return;
    }

    process.stdout.write(`\n  game-harness implement-task -p "${outputPath}" --resume\n\n`);
    process.exit(0);
  }

  const title = gameTitle ?? plan?.gameTitle ?? 'Implementation Plan';

  if (loadError) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness" subtitle="plan-game" />
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text color="red">Failed to load plan: {loadError}</Text>
        </Box>
      </Box>
    );
  }

  if (!plan) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness" subtitle="plan-game" />
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text dimColor>Loading plan...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Header
        title=" game-harness"
        subtitle={title}
        hint="↑↓/jk scroll · g top · G bottom · Enter confirm"
      />

      <Box
        flexDirection="column"
        flexGrow={1}
        paddingX={3}
        paddingY={1}
        borderStyle="round"
        borderColor="cyan"
      >
        {canScrollUp ? <Text dimColor>  ↑ more above</Text> : null}
        {visibleLines}
        {canScrollDown ? <Text dimColor>  ↓ more below</Text> : null}
        <Box marginTop={1}>
          <Text dimColor>
            {clampedScrollOffset + 1}–{Math.min(clampedScrollOffset + planViewportHeight, lines.length)} of {lines.length} lines
          </Text>
        </Box>
      </Box>

      <Box
        flexDirection="column"
        paddingX={3}
        paddingY={1}
        borderStyle="round"
        borderColor="green"
      >
        <Text bold>What would you like to do?</Text>
        <Box marginTop={1}>
          <SelectInput
            items={ACTIONS.map((action) => ({
              label: `${action.label} - ${action.description}`,
              value: action.value,
            }))}
            onSelect={handleActionSelect}
          />
        </Box>
      </Box>
    </Box>
  );
}
