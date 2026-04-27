import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetGraph } from './asset-graph.js';
import { DEFAULT_RETRY_POLICY, RetryBudget, type RetryPolicy } from './retry-policy.js';
import { runStage, type StageEvent } from './stage-runner.js';
import { parsePrompt, type ParseOptions } from '../parser/prompt-parser.js';
import { visualStubStage } from '../stages/visual-stub.js';
import { rigFromTemplateStage } from '../stages/rig-from-template.js';
import { exportGodotStage } from '../stages/export-godot.js';
import { buildMeta } from '../exporter/meta.js';
import type { CompileResult, StageResult } from '../types/stage-result.js';
import type { EnemySpec } from '../types/enemy-spec.js';

const COMPILER_VERSION = '0.1.0';

export interface CompileOptions extends Omit<ParseOptions, 'prompt'> {
  prompt: string;
  outputDir: string;
  retries?: Partial<RetryPolicy>;
  signal?: AbortSignal;
  onEvent?: (evt: StageEvent) => void;
}

export async function compileEnemy(opts: CompileOptions): Promise<CompileResult> {
  const policy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...(opts.retries ?? {}) };
  const budget = new RetryBudget(policy);
  await mkdir(opts.outputDir, { recursive: true });
  const graph = new AssetGraph(opts.outputDir);
  const stages: StageResult[] = [];

  // ----- parse stage (synchronous, but recorded for parity) -----
  const parseStart = Date.now();
  let spec: EnemySpec;
  try {
    spec = parsePrompt({
      prompt: opts.prompt,
      ...(opts.templateId ? { templateId: opts.templateId } : {}),
      ...(opts.id ? { id: opts.id } : {}),
      ...(opts.name ? { name: opts.name } : {}),
      ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
      ...(opts.overrides ? { overrides: opts.overrides } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stages.push({
      stage: 'parse',
      ok: false,
      score: 0,
      issues: [{ severity: 'error', message }],
      retries: 0,
      durationMs: Date.now() - parseStart,
    });
    throw err;
  }
  await graph.writeJson('parse', 'spec.json', spec);
  const parseResult: StageResult = {
    stage: 'parse',
    ok: true,
    score: 1.0,
    issues: [],
    retries: 0,
    durationMs: Date.now() - parseStart,
  };
  stages.push(parseResult);
  opts.onEvent?.({ type: 'stage-result', stage: 'parse', result: parseResult });

  // ----- visual stage (stub in Phase 1) -----
  const runOpts = { budget, ...(opts.signal ? { signal: opts.signal } : {}), ...(opts.onEvent ? { onEvent: opts.onEvent } : {}) };
  const visual = await runStage(visualStubStage, spec, graph, runOpts);
  stages.push(visual.result);

  // ----- rig + motion stage (template pass-through in Phase 1) -----
  const rig = await runStage(rigFromTemplateStage, spec, graph, runOpts);
  stages.push(rig.result);

  // ----- export stage -----
  const exp = await runStage(
    exportGodotStage,
    { spec, rig: rig.output, visual: visual.output },
    graph,
    runOpts,
  );
  stages.push(exp.result);

  // ----- meta sidecar -----
  const meta = buildMeta(spec, stages, COMPILER_VERSION);
  const metaPath = resolve(opts.outputDir, 'enemy.meta.json');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  // Phase 1 has no atlas yet; we still emit the bundle path slot so the
  // contract matches Phase 2. The exporter will populate it once textures
  // come online.
  const atlasPath = resolve(opts.outputDir, 'enemy.atlas.png');

  return {
    ok: stages.every((s) => s.ok),
    bundlePath: opts.outputDir,
    files: {
      tscn: resolve(opts.outputDir, 'enemy.tscn'),
      atlas: atlasPath,
      meta: metaPath,
    },
    stages,
  };
}
