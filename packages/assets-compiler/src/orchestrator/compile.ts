import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetGraph } from './asset-graph.js';
import { DEFAULT_RETRY_POLICY, RetryBudget, type RetryPolicy } from './retry-policy.js';
import { runStage, type StageEvent } from './stage-runner.js';
import { removeBackground } from './bg-remove.js';
import { parsePromptAsync, type ParsePromptAsyncOptions } from '../parser/prompt-parser.js';
import { visualStage } from '../stages/visual.js';
import { exportGodotStage } from '../stages/export-godot.js';
import { measureCutoutAnchor } from '../exporter/ground-anchor.js';
import { buildMeta } from '../exporter/meta.js';
import { silhouetteScore } from '../evaluator/index.js';
import type { CompileResult, StageResult, StageIssue } from '../types/stage-result.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput } from '../types/visual.js';

const COMPILER_VERSION = '0.4.0';

export interface CompileOptions extends Omit<ParsePromptAsyncOptions, 'prompt'> {
  prompt: string;
  outputDir: string;
  retries?: Partial<RetryPolicy>;
  signal?: AbortSignal;
  onEvent?: (evt: StageEvent) => void;
  /** Sub-path inside the consuming Godot project where this bundle will live. */
  bundleSubdir?: string;
}

export async function compileEnemy(opts: CompileOptions): Promise<CompileResult> {
  const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...(opts.retries ?? {}) };
  const budget = new RetryBudget(policy);
  await mkdir(opts.outputDir, { recursive: true });
  const graph = new AssetGraph(opts.outputDir);
  const stages: StageResult[] = [];

  const runOpts = {
    budget,
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.onEvent ? { onEvent: opts.onEvent } : {}),
  };

  // ----- parse stage -----
  const parseStart = Date.now();
  let spec: EnemySpec;
  const parseIssues: StageIssue[] = [];
  try {
    spec = await parsePromptAsync({
      prompt: opts.prompt,
      ...(opts.templateId ? { templateId: opts.templateId } : {}),
      ...(opts.id ? { id: opts.id } : {}),
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      ...(opts.overrides ? { overrides: opts.overrides } : {}),
      ...(opts.useLlm !== undefined ? { useLlm: opts.useLlm } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      onTrace: (msg) => parseIssues.push({ severity: 'warn', message: msg }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push({
      stage: 'parse', ok: false, score: 0,
      issues: [{ severity: 'error', message }],
      retries: 0, durationMs: Date.now() - parseStart,
    });
    throw err;
  }
  await graph.writeJson('parse', 'spec.json', spec);
  const parseResult: StageResult = {
    stage: 'parse', ok: true, score: 1.0,
    issues: parseIssues, retries: 0, durationMs: Date.now() - parseStart,
  };
  stages.push(parseResult);
  opts.onEvent?.({ type: 'stage-result', stage: 'parse', result: parseResult });

  // ----- visual stage -----
  const visual = await runStage(visualStage, spec, graph, runOpts);
  stages.push(visual.result);

  // ----- bg-remove -----
  const bgStart = Date.now();
  const bgIssues: StageIssue[] = [];
  let cutoutPath: string;
  try {
    const bg = await removeBackground(graph, visual.output.neutralPath);
    cutoutPath = bg.cutoutPath;
    if (bg.primaryFailure) {
      bgIssues.push({
        severity: 'warn',
        message: `primary bg-removal failed → fell back to ${bg.adapter}: ${bg.primaryFailure.split('\n')[0]!.trim()}`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push({
      stage: 'bg-remove', ok: false, score: 0,
      issues: [{ severity: 'error', message: `bg-removal failed: ${message}` }],
      retries: 0, durationMs: Date.now() - bgStart,
    });
    return finalize(graph, spec, stages, undefined);
  }
  // Score the silhouette of the cutout as a quality signal.
  const silhouette = await silhouetteScore(cutoutPath);
  const bgResult: StageResult = {
    stage: 'bg-remove', ok: true, score: silhouette.score,
    issues: [...bgIssues, ...silhouette.issues],
    retries: 0, durationMs: Date.now() - bgStart,
  };
  stages.push(bgResult);
  opts.onEvent?.({ type: 'stage-result', stage: 'bg-remove', result: bgResult });

  // ----- ground anchor -----
  const anchor = await measureCutoutAnchor(cutoutPath);

  // ----- export stage -----
  const exp = await runStage(
    exportGodotStage,
    {
      spec,
      cutoutPath,
      spriteWidth: anchor.width,
      spriteHeight: anchor.height,
      footY: anchor.footY,
      ...(opts.bundleSubdir ? { bundleSubdir: opts.bundleSubdir } : {}),
    },
    graph,
    runOpts,
  );
  stages.push(exp.result);

  return finalize(graph, spec, stages, exp.output.spritePath);
}

async function finalize(
  graph: AssetGraph,
  spec: EnemySpec,
  stages: StageResult[],
  spritePath: string | undefined,
): Promise<CompileResult> {
  const meta = buildMeta(spec, stages, COMPILER_VERSION);
  const metaPath = resolve(graph.bundleDir, 'enemy.meta.json');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return {
    ok: stages.every((s) => s.ok),
    bundlePath: graph.bundleDir,
    files: {
      tscn: resolve(graph.bundleDir, 'enemy.tscn'),
      sprite: spritePath ?? resolve(graph.bundleDir, 'enemy.png'),
      meta: metaPath,
    },
    stages,
  };
}

export type { VisualOutput };
