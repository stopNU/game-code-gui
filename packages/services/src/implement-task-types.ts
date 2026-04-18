import type { TaskResult, TaskState } from '@agent-harness/core';

export interface SourceInjectionLimits {
  maxFiles: number;
  maxLines: number;
  maxDependencyFiles: number;
}

export interface ImplementTaskOptions {
  project: string;
  task?: string;
  resume?: boolean;
  mode?: 'simple' | 'advanced';
  concurrency?: number;
  model?: string;
  reconciliationReport?: string;
}

export interface ParallelRunOptions {
  concurrency?: number;
  taskMode?: 'simple' | 'advanced';
  signal?: AbortSignal;
  model?: string;
  reconciliationReport?: string;
  /** When set, only tasks belonging to this phase number are started. */
  phaseFilter?: number;
  onTaskStart?: (task: TaskState) => void;
  onTaskDone?: (task: TaskState, result: TaskResult) => void;
  onProgress?: (taskId: string, msg: string) => void;
  onText?: (taskId: string, delta: string) => void;
}

export interface ParallelRunResult {
  ranCount: number;
  failedCount: number;
}
