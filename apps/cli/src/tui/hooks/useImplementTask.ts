import { useState, useEffect, useCallback } from 'react';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { TaskPlan, TaskState } from '@agent-harness/core';

export type ImplementPhase = 'loading' | 'picking' | 'running' | 'done' | 'error';

export interface UseImplementTaskResult {
  phase: ImplementPhase;
  plan: TaskPlan | null;
  tasks: TaskState[];
  selectedTask: TaskState | null;
  loadError: string | null;
  selectTask: (id: string) => void;
}

export function useImplementTask(projectPath: string, preselectedTaskId?: string): UseImplementTaskResult {
  const [phase, setPhase] = useState<ImplementPhase>('loading');
  const [plan, setPlan] = useState<TaskPlan | null>(null);
  const [tasks, setTasks] = useState<TaskState[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const tasksPath = join(projectPath, 'harness', 'tasks.json');
        const raw = await readFile(tasksPath, 'utf8');
        const loadedPlan = JSON.parse(raw) as TaskPlan;
        const allTasks = loadedPlan.phases.flatMap((p) => p.tasks);
        setPlan(loadedPlan);
        setTasks(allTasks);

        if (preselectedTaskId) {
          const found = allTasks.find((t) => t.id === preselectedTaskId);
          if (!found) {
            setLoadError(`Task "${preselectedTaskId}" not found in harness/tasks.json`);
            setPhase('error');
            return;
          }
          setSelectedTask(found);
          setPhase('running');
        } else {
          setPhase('picking');
        }
      } catch (err) {
        setLoadError(String(err));
        setPhase('error');
      }
    };
    void load();
  }, [projectPath, preselectedTaskId]);

  const selectTask = useCallback(
    (id: string) => {
      const found = tasks.find((t) => t.id === id);
      if (found) {
        setSelectedTask(found);
        setPhase('running');
      }
    },
    [tasks],
  );

  return { phase, plan, tasks, selectedTask, loadError, selectTask };
}
