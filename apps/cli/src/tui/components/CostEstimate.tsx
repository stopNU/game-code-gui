import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { TaskPlan, TaskState } from '@agent-harness/core';

interface CostEstimateProps {
  task: TaskState;
  plan: TaskPlan;
  mode: 'simple' | 'advanced';
  resumeMode: boolean;
  /** When set, shows cost for all incomplete tasks in this phase instead of a single task. */
  phaseTasks?: TaskState[];
  onConfirm: () => void;
  onCancel: () => void;
}

// Average tokens per task iteration by role (input + output combined)
const TOKENS_PER_TASK: Record<string, number> = {
  designer: 40000,
  gameplay: 60000,
  asset: 30000,
  qa: 50000,
  evaluator: 40000,
  orchestrator: 35000,
  systems: 70000,
  balance: 55000,
};

// Approximate pricing per 1M tokens (blended input/output for Sonnet)
const COST_PER_MILLION_TOKENS = 9.0; // ~$3 input + $15 output averaged

function estimateCost(
  tasks: TaskState[],
  mode: 'simple' | 'advanced',
): { lowTokens: number; highTokens: number; lowCost: number; highCost: number } {
  let baseTokens = 0;
  for (const t of tasks) {
    baseTokens += TOKENS_PER_TASK[t.role] ?? 50000;
  }

  // Advanced mode tasks tend to be more complex
  const multiplier = mode === 'advanced' ? 1.3 : 1.0;
  const lowTokens = Math.round(baseTokens * multiplier * 0.6);
  const highTokens = Math.round(baseTokens * multiplier * 1.4);

  return {
    lowTokens,
    highTokens,
    lowCost: (lowTokens / 1_000_000) * COST_PER_MILLION_TOKENS,
    highCost: (highTokens / 1_000_000) * COST_PER_MILLION_TOKENS,
  };
}

function formatCost(n: number): string {
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}

export function CostEstimate({ task, plan, mode, resumeMode, phaseTasks, onConfirm, onCancel }: CostEstimateProps) {
  useInput((input, key) => {
    if (key.return || input.toLowerCase() === 'y') {
      onConfirm();
    } else if (key.escape || input.toLowerCase() === 'n') {
      onCancel();
    }
  });

  // Determine which tasks will run
  const allTasks = plan.phases.flatMap((p) => p.tasks);
  const tasksToRun = phaseTasks !== undefined
    ? phaseTasks.filter((t) => t.status !== 'complete' && t.status !== 'blocked')
    : resumeMode
    ? allTasks.filter((t) => t.status !== 'complete' && t.status !== 'blocked')
    : [task];

  const est = estimateCost(tasksToRun, mode);
  const phaseNum = phaseTasks !== undefined && phaseTasks.length > 0 ? phaseTasks[0]!.phase : undefined;

  return (
    <Box flexDirection="column" marginX={1} marginY={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1} flexDirection="column">
        <Text bold color="yellow">Cost Estimate</Text>

        <Box marginTop={1} flexDirection="column">
          {phaseNum !== undefined ? (
            <Text>
              Phase <Text bold>{phaseNum}</Text> — <Text bold>{tasksToRun.length}</Text> task{tasksToRun.length !== 1 ? 's' : ''} to run
            </Text>
          ) : resumeMode ? (
            <Text>
              <Text bold>{tasksToRun.length}</Text> tasks to run ({allTasks.filter((t) => t.status === 'complete').length} already complete)
            </Text>
          ) : (
            <Text>
              Task: <Text bold>{task.title}</Text> (role: {task.role})
            </Text>
          )}
          <Text dimColor>Mode: {mode}</Text>
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text>
            Estimated tokens: <Text bold>{formatTokens(est.lowTokens)}</Text> – <Text bold>{formatTokens(est.highTokens)}</Text>
          </Text>
          <Text>
            Estimated cost: <Text bold color="yellow">{formatCost(est.lowCost)}</Text> – <Text bold color="yellow">{formatCost(est.highCost)}</Text>
          </Text>
        </Box>

        {tasksToRun.length > 1 && (() => {
          const byRole = new Map<string, number>();
          for (const t of tasksToRun) {
            byRole.set(t.role, (byRole.get(t.role) ?? 0) + 1);
          }
          return (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Per role:</Text>
              {[...byRole.entries()].map(([role, count]) => (
                <Text key={role} dimColor>
                  {'  '}{role} ×{count}: ~{formatTokens((TOKENS_PER_TASK[role] ?? 50000) * count * (mode === 'advanced' ? 1.3 : 1.0))}
                </Text>
              ))}
            </Box>
          );
        })()}

        <Box marginTop={1}>
          <Text>Proceed? </Text>
          <Text bold color="green">[Y]</Text>
          <Text>es / </Text>
          <Text bold color="red">[N]</Text>
          <Text>o</Text>
        </Box>
      </Box>
    </Box>
  );
}
