import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetGraph } from './asset-graph.js';
import { DEFAULT_RETRY_POLICY, RetryBudget, type RetryPolicy } from './retry-policy.js';
import { runStage, type StageEvent } from './stage-runner.js';
import { parsePromptAsync, type ParsePromptAsyncOptions } from '../parser/prompt-parser.js';
import { visualStage } from '../stages/visual.js';
import { visualStubStage } from '../stages/visual-stub.js';
import { segmentStage } from '../stages/segment.js';
import { meshStage } from '../stages/mesh.js';
import { atlasStage } from '../stages/atlas.js';
import { rigFromTemplateStage } from '../stages/rig-from-template.js';
import { exportGodotStage } from '../stages/export-godot.js';
import { buildMeta } from '../exporter/meta.js';
import { silhouetteScore, partCoverageScore, meshSanityScore } from '../evaluator/index.js';
import type { CompileResult, StageResult, StageIssue } from '../types/stage-result.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput, AtlasOutput, MeshStageOutput, SegmentOutput } from '../types/visual.js';
import { REQUIRED_REGIONS } from '../stages/visual-stub.js';

const COMPILER_VERSION = '0.2.0';

export interface CompileOptions extends Omit<ParsePromptAsyncOptions, 'prompt'> {
  prompt: string;
  outputDir: string;
  retries?: Partial<RetryPolicy>;
  signal?: AbortSignal;
  onEvent?: (evt: StageEvent) => void;
  /** When true, bypass the textured pipeline entirely and use flat-color stub. */
  flatOnly?: boolean;
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
    issues: parseIssues,
    retries: 0,
    durationMs: Date.now() - parseStart,
  };
  stages.push(parseResult);
  opts.onEvent?.({ type: 'stage-result', stage: 'parse', result: parseResult });

  // ----- visual stage (real with FAL fallback to flat colors) -----
  const visualStg = opts.flatOnly ? visualStubStage : visualStage;
  const visual = await runStage(visualStg, spec, graph, runOpts);
  stages.push(visual.result);

  // ----- textured pipeline (only if visual returned an image) -----
  let segOut: SegmentOutput | undefined;
  let meshOut: MeshStageOutput | undefined;
  let atlasOut: AtlasOutput | undefined;

  if (visual.output.kind === 'image') {
    // segment
    const seg = await runStage(segmentStage, { spec, visual: visual.output }, graph, runOpts);
    stages.push(seg.result);
    segOut = seg.output;

    // silhouette evaluator → bumps the segment stage's record
    const silhouette = await silhouetteScore(seg.output.cutoutPath);
    const partCov = partCoverageScore(seg.output, REQUIRED_REGIONS.length);
    seg.result.score = (seg.result.score + silhouette.score + partCov.score) / 3;
    seg.result.issues.push(...silhouette.issues, ...partCov.issues);

    // mesh
    const mesh = await runStage(meshStage, seg.output, graph, runOpts);
    const sanity = meshSanityScore(mesh.output);
    mesh.result.score = (mesh.result.score + sanity.score) / 2;
    mesh.result.issues.push(...sanity.issues);
    stages.push(mesh.result);
    meshOut = mesh.output;

    // atlas pack
    try {
      const atl = await runStage(atlasStage, seg.output, graph, runOpts);
      stages.push(atl.result);
      atlasOut = atl.output;
    } catch (err) {
      // Atlas failure is recoverable: fall back to flat colors at export.
      const message = err instanceof Error ? err.message : String(err);
      stages.push({
        stage: 'atlas',
        ok: false,
        score: 0,
        issues: [{ severity: 'warn', message: `${message}; falling back to flat colors` }],
        retries: 0,
        durationMs: 0,
      });
      atlasOut = undefined;
      meshOut = undefined;
    }
  }

  // ----- rig + motion stage (template pass-through; real procedural rig is Phase 3) -----
  const rig = await runStage(rigFromTemplateStage, spec, graph, runOpts);
  stages.push(rig.result);

  // ----- export stage -----
  const visualForExport = visual.output;
  const exp = await runStage(
    exportGodotStage,
    {
      spec,
      rig: rig.output,
      visual: visualForExport,
      ...(atlasOut ? { atlas: atlasOut } : {}),
      ...(meshOut ? { meshes: meshOut } : {}),
      ...(segOut ? { fallbackColors: segOut.fallbackColors } : {}),
      ...(opts.bundleSubdir ? { bundleSubdir: opts.bundleSubdir } : {}),
    },
    graph,
    runOpts,
  );
  stages.push(exp.result);

  // ----- meta sidecar -----
  const meta = buildMeta(spec, stages, COMPILER_VERSION);
  const metaPath = resolve(opts.outputDir, 'enemy.meta.json');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  const atlasPath = atlasOut?.atlasPath ?? resolve(opts.outputDir, 'enemy.atlas.png');
  void segOut;

  return {
    ok: stages.every((s) => s.ok || s.stage === 'atlas'), // atlas-fallback doesn't fail the build
    bundlePath: opts.outputDir,
    files: {
      tscn: resolve(opts.outputDir, 'enemy.tscn'),
      atlas: atlasPath,
      meta: metaPath,
    },
    stages,
  };
}

export type { VisualOutput };
