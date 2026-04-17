import { describe, expect, it } from 'vitest';
import { buildTaskPrompt } from './task-prompt.js';
import type { AgentContext } from '../types/agent.js';

describe('buildTaskPrompt', () => {
  it('includes reconciliation report context when present', () => {
    const prompt = buildTaskPrompt(createContext());

    expect(prompt).toContain('Reconciliation report path: harness/runtime-reconciliation-report.json');
    expect(prompt).toContain('**Runtime reconciliation report (read-only):**');
    expect(prompt).toContain('**Runtime authority requirements:**');
    expect(prompt).toContain('Before editing, state the authoritative runtime file path for this subsystem');
    expect(prompt).toContain('When changing flow code, scene transitions, or autoload wiring, read the active .tscn and project.godot first.');
    expect(prompt).toContain('Active scenes: `res://src/main.tscn`.');
    expect(prompt).toContain('Active autoloads: `res://src/autoload/EventBus.gd`.');
    expect(prompt).toContain('duplicate-implementation');
    expect(prompt).toContain('repair-1');
  });
});

function createContext(): AgentContext {
  return {
    config: {
      role: 'systems',
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      temperature: 0,
      systemPrompt: 'test',
      toolGroups: [],
      memoryScope: 'project',
      permissions: { allowed: [], denied: [] },
    },
    task: {
      id: 'task-1',
      phase: 1,
      role: 'systems',
      status: 'pending',
      title: 'Repair runtime drift',
      description: 'Use the reconciliation report to repair runtime drift.',
      brief: 'Repair runtime drift using the read-only report.',
      acceptanceCriteria: ['Consume reconciliation context without guessing.'],
      dependencies: [],
      toolsAllowed: [],
      retries: 0,
      maxRetries: 1,
      context: {
        projectPath: '/tmp/project',
        gameSpec: '',
        relevantFiles: [],
        memoryKeys: [],
        dependencySummaries: [],
        previousTaskSummaries: [],
        runtimeManifestPath: 'harness/runtime-manifest.json',
        runtimeManifest: {
          version: '1.0.0',
          generatedAt: '2026-01-01T00:00:00.000Z',
          canonicalLayoutId: 'godot-src-v1',
          manifestPath: 'harness/runtime-manifest.json',
          scenes: [],
          scripts: [],
          autoloads: [],
          dataRoots: [],
        },
        reconciliationReportPath: 'harness/runtime-reconciliation-report.json',
        reconciliationReport: {
          version: '1.0.0',
          generatedAt: '2026-01-01T00:00:00.000Z',
          mode: 'read-only',
          canonicalLayoutId: 'godot-src-v1',
          manifestPath: 'harness/runtime-manifest.json',
          activeRuntimeRoots: ['src', 'scripts'],
          activeFiles: {
            scenes: ['res://src/main.tscn'],
            scripts: ['res://src/autoload/EventBus.gd'],
            autoloads: ['res://src/autoload/EventBus.gd'],
            dataRoots: ['src/data/content'],
          },
          conflicts: [{
            id: 'duplicate:EventBus',
            kind: 'duplicate-implementation',
            severity: 'error',
            summary: 'Old and new implementations coexist for EventBus.',
            details: 'Authoritative file src/autoload/EventBus.gd conflicts with scripts/core/EventBus.gd.',
            paths: ['src/autoload/EventBus.gd', 'scripts/core/EventBus.gd'],
            active: true,
            authoritativePath: 'src/autoload/EventBus.gd',
            conflictingPath: 'scripts/core/EventBus.gd',
            suggestedAction: 'Keep the src implementation and remove the legacy copy.',
          }],
          repairPlan: [{
            id: 'repair-1',
            priority: 'high',
            title: 'Collapse duplicate implementations',
            details: 'Keep the src implementation and remove the legacy copy.',
            targets: ['src/autoload/EventBus.gd', 'scripts/core/EventBus.gd'],
            conflictIds: ['duplicate:EventBus'],
          }],
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    memory: [],
    conversationHistory: [],
    traceId: 'trace-1',
    iterationCount: 0,
    tokenBudget: 1000,
    tokenUsed: 0,
  };
}
