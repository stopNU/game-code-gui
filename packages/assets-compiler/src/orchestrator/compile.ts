import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AssetGraph } from './asset-graph.js';
import { DEFAULT_RETRY_POLICY, RetryBudget, type RetryPolicy } from './retry-policy.js';
import { runStage, type StageEvent } from './stage-runner.js';
import { removeBackground } from './bg-remove.js';
import { parsePromptAsync, type ParsePromptAsyncOptions } from '../parser/prompt-parser.js';
import { visualStage } from '../stages/visual.js';
import { visualStubStage } from '../stages/visual-stub.js';
import { segmentStage } from '../stages/segment.js';
import { meshStage } from '../stages/mesh.js';
import { atlasStage } from '../stages/atlas.js';
import { rigFromTemplateStage } from '../stages/rig-from-template.js';
import { rigProceduralStage } from '../stages/rig-procedural.js';
import { exportGodotStage } from '../stages/export-godot.js';
import { buildMeta } from '../exporter/meta.js';
import { silhouetteScore, partCoverageScore, meshSanityScore } from '../evaluator/index.js';
import { rigSanityScore } from '../evaluator/rig-sanity.js';
import type { CompileResult, StageResult, StageIssue } from '../types/stage-result.js';
import type { EnemySpec } from '../types/enemy-spec.js';
import type { VisualOutput, AtlasOutput, MeshStageOutput, SegmentOutput } from '../types/visual.js';
import { REQUIRED_REGIONS } from '../stages/visual-stub.js';

const COMPILER_VERSION = '0.3.0';

export interface CompileOptions extends Omit<ParsePromptAsyncOptions, 'prompt'> {
  prompt: string;
  outputDir: string;
  retries?: Partial<RetryPolicy>;
  signal?: AbortSignal;
  onEvent?: (evt: StageEvent) => void;
  /** When true, bypass the textured pipeline entirely and use flat-color stub. */
  flatOnly?: boolean;
  /** When true, skip landmark detection and always use the template skeleton. */
  noProceduralRig?: boolean;
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
  const visualStg = opts.flatOnly ? visualStubStage : visualStage;
  const visual = await runStage(visualStg, spec, graph, runOpts);
  stages.push(visual.result);

  // ----- textured + procedural-rig pipeline (only if visual returned an image) -----
  let segOut: SegmentOutput | undefined;
  let meshOut: MeshStageOutput | undefined;
  let atlasOut: AtlasOutput | undefined;
  let rigOut: Awaited<ReturnType<typeof rigProceduralStage.run>>['output'] | undefined;
  let cutoutPath: string | undefined;

  if (visual.output.kind === 'image') {
    // (a) bg-remove once — feeds rig (landmark detection) and segment.
    try {
      const bg = await removeBackground(graph, visual.output.neutralPath);
      cutoutPath = bg.cutoutPath;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      stages.push({
        stage: 'segment', ok: false, score: 0,
        issues: [{ severity: 'error', message: `bg-removal failed: ${message}` }],
        retries: 0, durationMs: 0,
      });
    }

    // (b) rig: landmark detect → procedural skeleton + dynamic regions.
    //     Falls back to template when detection fails or noProceduralRig=true.
    const rigInput = {
      spec,
      visual: visual.output,
      ...(opts.noProceduralRig ? {} : (cutoutPath ? { cutoutPath } : {})),
    };
    const rig = await runStage(rigProceduralStage, rigInput, graph, runOpts);
    if (rig.output.source === 'procedural' && rig.output.landmarks) {
      const sanity = rigSanityScore(rig.output.landmarks);
      rig.result.score = (rig.result.score + sanity.score) / 2;
      rig.result.issues.push(...sanity.issues);
    }
    stages.push(rig.result);
    rigOut = rig.output;

    // (c) segment: crop regions from cutout (using rig's dynamic regions if any).
    if (cutoutPath) {
      const segIn = {
        spec,
        visual: visual.output,
        precutPath: cutoutPath,
        ...(rig.output.dynamicRegions ? { regionsOverride: rig.output.dynamicRegions } : {}),
      };
      const seg = await runStage(segmentStage, segIn, graph, runOpts);
      const silhouette = await silhouetteScore(seg.output.cutoutPath);
      const partCov = partCoverageScore(seg.output, REQUIRED_REGIONS.length);
      seg.result.score = (seg.result.score + silhouette.score + partCov.score) / 3;
      seg.result.issues.push(...silhouette.issues, ...partCov.issues);
      stages.push(seg.result);
      segOut = seg.output;

      // (d) mesh
      const mesh = await runStage(meshStage, seg.output, graph, runOpts);
      const sanity = meshSanityScore(mesh.output);
      mesh.result.score = (mesh.result.score + sanity.score) / 2;
      mesh.result.issues.push(...sanity.issues);
      stages.push(mesh.result);
      meshOut = mesh.output;

      // (e) atlas
      try {
        const atl = await runStage(atlasStage, seg.output, graph, runOpts);
        stages.push(atl.result);
        atlasOut = atl.output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stages.push({
          stage: 'atlas', ok: false, score: 0,
          issues: [{ severity: 'warn', message: `${message}; falling back to flat colors` }],
          retries: 0, durationMs: 0,
        });
        atlasOut = undefined;
        meshOut = undefined;
      }
    }
  } else {
    // No image — use template rig.
    const rig = await runStage(rigFromTemplateStage, spec, graph, runOpts);
    stages.push(rig.result);
    rigOut = {
      templateId: rig.output.templateId,
      canvasSize: rig.output.canvasSize,
      rootOffset: rig.output.rootOffset,
      skeleton: rig.output.skeleton,
      animations: rig.output.animations,
      source: 'template' as const,
    };
  }

  // ----- export stage -----
  // A region is "valid" (safe to render on the procedural path) if it had
  // meaningful coverage. Threshold: 64 opaque pixels OR ≥10% of the region
  // rect's area, whichever is smaller. Below that, skip the Polygon2D
  // entirely instead of drawing a misplaced fallback quad.
  const MIN_COV_PX = 64;
  const validRegions = new Set<string>(
    segOut?.regions
      .filter((r) => {
        const rectArea = Math.max(1, r.size.w * r.size.h);
        return r.coveragePx >= MIN_COV_PX || r.coveragePx / rectArea >= 0.1;
      })
      .map((r) => r.region) ?? [],
  );

  const proceduralRig = rigOut?.source === 'procedural' && rigOut.boneAbs && segOut
    ? {
        boneAbs: rigOut.boneAbs,
        regionBounds: Object.fromEntries(
          segOut.regions.map((r) => [r.region, r.boundsInSource]),
        ),
        validRegions,
      }
    : undefined;

  const exp = await runStage(
    exportGodotStage,
    {
      spec,
      rig: rigOut!,
      visual: visual.output,
      ...(atlasOut ? { atlas: atlasOut } : {}),
      ...(meshOut ? { meshes: meshOut } : {}),
      ...(segOut ? { fallbackColors: segOut.fallbackColors } : {}),
      ...(proceduralRig ? { proceduralRig } : {}),
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

  return {
    ok: stages.every((s) => s.ok || s.stage === 'atlas'),
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
