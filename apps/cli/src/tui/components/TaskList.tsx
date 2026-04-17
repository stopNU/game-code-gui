import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import type { TaskPlan, TaskState } from '@agent-harness/core';

interface TaskListProps {
  plan: TaskPlan;
  activeTaskId?: string | undefined;
  completedIds?: Set<string> | undefined;
  maxVisible?: number | undefined;
}

function statusIcon(task: TaskState, activeTaskId?: string, completedIds?: Set<string>): React.ReactElement {
  if (task.status === 'complete' || completedIds?.has(task.id)) {
    return <Text color="green">✓</Text>;
  }
  if (task.status === 'failed') {
    return <Text color="red">✗</Text>;
  }
  if (task.status === 'blocked') {
    return <Text dimColor>⊘</Text>;
  }
  if (task.id === activeTaskId || task.status === 'in-progress') {
    return <Spinner label="" />;
  }
  return <Text dimColor>○</Text>;
}

export function TaskList({ plan, activeTaskId, completedIds, maxVisible }: TaskListProps) {
  const allTasks = plan.phases.flatMap((p) => p.tasks);

  // Compute the visible window of task IDs when a height limit is given
  let visibleIds: Set<string> | undefined;
  let clippedAbove = false;
  let clippedBelow = false;
  if (maxVisible !== undefined && allTasks.length > maxVisible) {
    const activeIdx = activeTaskId ? allTasks.findIndex((t) => t.id === activeTaskId) : 0;
    const center = activeIdx >= 0 ? activeIdx : 0;
    const start = Math.max(0, Math.min(center - Math.floor(maxVisible / 2), allTasks.length - maxVisible));
    const end = start + maxVisible;
    visibleIds = new Set(allTasks.slice(start, end).map((t) => t.id));
    clippedAbove = start > 0;
    clippedBelow = end < allTasks.length;
  }

  return (
    <Box flexDirection="column">
      <Text bold dimColor>Tasks</Text>
      {clippedAbove && <Text dimColor>  ↑ …</Text>}
      {plan.phases.map((phase) => {
        const phaseTasks = visibleIds
          ? phase.tasks.filter((t) => visibleIds!.has(t.id))
          : phase.tasks;
        if (phaseTasks.length === 0) return null;
        return (
          <Box key={phase.phase} flexDirection="column" marginTop={1}>
            <Text bold>Phase {phase.phase}</Text>
            {phaseTasks.map((task) => (
              <Box key={task.id} marginLeft={2}>
                {statusIcon(task, activeTaskId, completedIds)}
                <Text> </Text>
                {task.id === activeTaskId ? (
                  <Text color="cyan">{task.title}</Text>
                ) : task.status === 'complete' || completedIds?.has(task.id) ? (
                  <Text color="green">{task.title}</Text>
                ) : task.status === 'failed' ? (
                  <Text color="red">{task.title}</Text>
                ) : (
                  <Text dimColor={task.status === 'blocked' || task.status === 'pending'}>{task.title}</Text>
                )}
              </Box>
            ))}
          </Box>
        );
      })}
      {clippedBelow && <Text dimColor>  ↓ …</Text>}
    </Box>
  );
}
