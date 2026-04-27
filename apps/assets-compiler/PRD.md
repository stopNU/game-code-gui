# PRD: Assets Compiler

**Package:** `apps/assets-compiler`
**Status:** Draft
**Owner:** stopNU
**Date:** 2026-04-27

---

## 1. Executive Summary

The **Assets Compiler** is a constrained, deterministic pipeline that turns short text prompts into game-ready 2D skeletal enemies. Rather than a freeform "prompt-to-animation" generator, it behaves like a *compiler*: prompts are parsed into a strict intermediate spec, then run through fixed stages (image generation → segmentation → mesh build → rigging → motion → export) with automated scoring and retry between each stage.

The output is a **Godot-native skeletal bundle** — a `.tscn` scene containing `Skeleton2D` + `Polygon2D` mesh attachments + `AnimationPlayer`, plus a texture atlas and per-part textures. No commercial runtime, no third-party addon: it loads with the engine that ships in the harness. The MVP narrows the problem to **one anatomy template** (humanoid biped) with a fixed motion set (idle / attack / hit / death) so we can prove the deterministic pipeline before expanding to additional skeleton families.

This package complements the existing `@agent-harness/assets` flat-image generator by producing animated skeletal enemies. The deckbuilder template will be updated in lockstep to consume `.tscn` skeletal bundles instead of static 256×384 PNGs.

---

## 2. Mission

> **Build a compiler, not a chatbot.** The prompt defines intent; the system enforces structure.

Core principles:

1. **Constraint over creativity.** Fixed anatomy templates, fixed bone maps, fixed motion packs. Variation comes from art, not topology.
2. **Deterministic stages.** Each stage takes structured input, writes structured artifacts, emits a score. Re-running with the same seed reproduces the bundle.
3. **Score, retry, then surface.** A candidate that fails a sanity threshold is regenerated automatically — humans only see passing candidates.
4. **Game-ready or rejected.** No "almost-working" outputs. If rigging or motion fails sanity checks, the pipeline retries or aborts; it never ships half-rigged assets.
5. **Godot-native as the wire format.** A `.tscn` scene with `Skeleton2D`, `Polygon2D` mesh attachments, and `AnimationPlayer` is the export contract. Internal representations stay engine-agnostic but converge on Godot at the exporter — keeping the door open for other targets later without depending on a commercial runtime.

---

## 3. Target Users

**Primary persona — Harness operator (the developer running the agent loop).**
- Deep TS/Node background, comfortable with CLIs and config files.
- Wants to type a brief like *"goblin shaman with a glowing skull staff"* and get a usable animated enemy in a Godot project minutes later.
- Will tolerate occasional regenerations but not manual rigging.

**Secondary persona — Studio user (Electron app).**
- Triggers compilation through the Studio UI's content pipeline.
- Sees previews and approve/reject controls; never edits Spine JSON by hand.

**Tertiary persona — Generated-game runtime (Godot).**
- Loads `enemy.tscn` via stock Godot APIs (`load("res://...enemy.tscn").instantiate()`).
- Expects stable `Skeleton2D` bone names and `AnimationPlayer` animation names across all enemies of the same template, so gameplay code can target `attack`/`hit` without per-enemy switches.

---

## 4. MVP Scope

### ✅ In Scope

**Core functionality**
- ✅ Prompt parser that maps free text → structured `EnemySpec` (template, palette, materials, mood, attack archetype).
- ✅ Single anatomy template: **humanoid biped** with canonical bone map.
- ✅ Visual generator producing a neutral T-pose (and optional attack reference pose) via FAL.ai or pluggable adapter.
- ✅ Part extractor (semantic segmentation into head, torso, upper/lower arms, hands, upper/lower legs, feet, optional weapon/cloak).
- ✅ Mesh builder turning each part raster into deformation-ready triangulated mesh.
- ✅ Rig builder applying the template's bone hierarchy with procedural attachment + automatic skin weights.
- ✅ Motion mapper applying stock animations: `idle`, `attack`, `hit`, `death` (hand-authored bone tracks shipped with the humanoid template).
- ✅ Godot exporter producing `enemy.tscn` (Skeleton2D + Polygon2D meshes + AnimationPlayer) + atlas `.png` + per-part `.tres` resources as needed.
- ✅ Deckbuilder template updated to consume `.tscn` enemy bundles in place of static PNGs (scene tree, `enemies.json` schema, gameplay code).
- ✅ `enemy.meta.json` sidecar (prompt, template id, palette, seed, scores, animation set, regen history).
- ✅ Automated evaluator with thresholds for silhouette, part coverage, mesh sanity, rig sanity, motion readability.
- ✅ Auto-regeneration loop (max N retries per stage) before surfacing to user.
- ✅ CLI entry point: `assets-compiler compile --prompt "..." --template humanoid --output <dir>`.
- ✅ Programmatic API: `compileEnemy(spec): Promise<CompileResult>`.

**Technical**
- ✅ TypeScript, ESM, fits the existing pnpm/Turbo monorepo conventions (`exactOptionalPropertyTypes`, `rootDir: src`, `outDir: dist`).
- ✅ Pluggable model adapters (image gen, segmenter, mesh builder) behind interfaces.
- ✅ Deterministic seeds — same `EnemySpec` + seed reproduces the same bundle.
- ✅ Structured asset graph on disk: every stage writes intermediate artifacts under `<output>/.compiler/<stage>/`.

**Integration**
- ✅ Standalone CLI is the primary surface for MVP.
- ✅ Output drops directly into a Godot project's `src/assets/generated/enemies/<enemy_id>/`.
- ✅ Reuses harness conventions (logging, tracing, Anthropic/FAL API key handling).
- ➖ Studio integration deferred to a later phase (see Future Considerations); programmatic API is designed to support it but no Studio UI ships in MVP.

### ❌ Out of Scope (deferred)

- ❌ Anatomy templates beyond humanoid biped (blob, floating caster, insectoid quadruped).
- ❌ Player characters, NPCs, bosses with multi-phase rigs.
- ❌ User-authored motion (custom keyframes, motion capture import).
- ❌ Cloth/hair physics simulation beyond basic bone-driven sway.
- ❌ Real-time preview inside the compiler — preview is delegated to Godot.
- ❌ Studio app integration (UI panel, event stream, approve/reject UX).
- ❌ Spine, DragonBones, Rive, or any other commercial/third-party runtime export.
- ❌ Editing existing bundles (compile-only, no recompile-with-edits).
- ❌ 3D anything.
- ❌ Audio (attack SFX, death cries).
- ❌ Phaser, Vite, or web-based runtime targets — Godot only, matching the harness.

---

## 5. User Stories

1. **As a harness operator, I want to type one prompt and get a Spine bundle**, so that I can populate a deckbuilder enemy roster without opening an art tool.
   *Example:* `assets-compiler compile --prompt "rust-armored skeleton knight, slow heavy attacks" --output ./out/skeleton_knight`

2. **As a harness operator, I want the compiler to retry bad outputs automatically**, so that I don't have to babysit candidate quality.
   *Example:* If silhouette score < 0.6, regenerate with same seed+jitter up to 3 times before failing.

3. **As a harness operator, I want stage-by-stage progress in the CLI**, so that I can spot which stage failed and why.
   *Example:* CLI prints `parse ✅ · visual ✅ (2 retries) · segment ⏳ · mesh ⏸ · ...` with paths to artifacts on failure.

4. **As a Godot runtime, I want stable bone and animation names across all humanoid enemies**, so that gameplay code can target `attack` or `root` without per-enemy switches.
   *Example:* Every humanoid `.tscn` has `Skeleton2D/root/hip/spine/chest/head/...` and `AnimationPlayer` clips `idle, attack, hit, death`.

5. **As a harness operator, I want practical reproducibility via caching**, so that re-running yesterday's compile with the same seed produces the same bundle without paying for image gen again.
   *Example:* Image-gen outputs are cached by `(prompt-hash, seed)` on disk; downstream stages are deterministic given the same image input.

6. **As a harness operator, I want the compiler to refuse to ship broken rigs**, so that the deckbuilder never loads an enemy with elbows bending the wrong way.
   *Example:* If rig sanity score < threshold and retries exhausted, exit non-zero with a structured error.

7. **As a harness operator, I want to override the prompt parser's slot decisions**, so that I can force a palette or attack archetype the parser misread.
   *Example:* `--palette "ash and ember"`, `--attack-archetype "ranged-cast"`.

8. **As an evals integrator, I want machine-readable scores in `enemy.meta.json`**, so that I can roll compiler output quality into the existing eval layers.

---

## 6. Core Architecture & Patterns

### High-level flow

```
prompt ──► [parser] ──► EnemySpec
                           │
                           ▼
                    [visual generator] ──► neutral.png, attack_ref.png
                           │
                           ▼
                    [part extractor] ──► parts/{head,torso,...}.png + masks
                           │
                           ▼
                    [mesh builder] ──► parts/*.mesh.json
                           │
                           ▼
                    [rig builder] ──► skeleton.json (bones + slots + skin weights)
                           │
                           ▼
                    [motion mapper] ──► animations.json (idle/attack/hit/death)
                           │
                           ▼
                    [exporter] ──► enemy.tscn + enemy.atlas.png + part .tres
                           │
                           ▼
                    [evaluator at every stage gate]
```

Each stage:
1. Reads its input artifact(s) from disk.
2. Writes its output artifact(s) under `<output>/.compiler/<stage>/`.
3. Emits a `StageResult { ok, score, issues[] }`.
4. The orchestrator decides: advance, retry, or abort.

### Directory structure

```
apps/assets-compiler/
├── src/
│   ├── index.ts                     # public API: compileEnemy()
│   ├── orchestrator/
│   │   ├── compile.ts               # the stage runner
│   │   ├── retry-policy.ts
│   │   └── asset-graph.ts           # stage artifacts on disk
│   ├── parser/
│   │   ├── prompt-parser.ts         # text → EnemySpec
│   │   └── slot-schema.ts
│   ├── stages/
│   │   ├── visual-generate.ts
│   │   ├── part-extract.ts
│   │   ├── mesh-build.ts
│   │   ├── rig-build.ts
│   │   ├── motion-map.ts
│   │   └── export-godot.ts
│   ├── templates/
│   │   ├── humanoid/
│   │   │   ├── bones.json
│   │   │   ├── slots.json
│   │   │   ├── motions/{idle,attack,hit,death}.json
│   │   │   └── compatibility.json
│   │   └── registry.ts
│   ├── adapters/
│   │   ├── image-gen.ts             # FAL/OpenAI/stub
│   │   ├── segmenter.ts             # SAM-style adapter
│   │   ├── mesh-tri.ts              # triangulation backend
│   │   └── motion-source.ts
│   ├── evaluator/
│   │   ├── silhouette.ts
│   │   ├── part-coverage.ts
│   │   ├── mesh-sanity.ts
│   │   ├── rig-sanity.ts
│   │   └── motion-readability.ts
│   ├── exporter/
│   │   ├── tscn-writer.ts        # .tscn (Skeleton2D + Polygon2D + AnimationPlayer)
│   │   ├── atlas-pack.ts
│   │   └── meta.ts
│   └── types/
│       ├── enemy-spec.ts
│       ├── skeleton.ts
│       └── stage-result.ts
├── bin/
│   └── assets-compiler.js
├── test/
├── package.json
├── tsconfig.json
└── README.md
```

### Key patterns

- **Asset graph on disk.** Every artifact is a file under `.compiler/`, never just an in-memory object. Enables resumable runs and easy debugging.
- **Stage = pure function over disk.** Each stage takes paths, writes paths, returns `StageResult`. No global state.
- **Adapter interfaces.** Image gen, segmenter, mesh triangulator, motion source are all pluggable. The MVP uses FAL.ai for image gen, an `rmbg`/SAM-style adapter for segmentation, and a built-in Delaunay+grid mesh builder.
- **Template = data, not code.** Bone hierarchy, motion clips, compatibility matrix all live in JSON under `templates/<name>/`.
- **Engine isolation.** Internal `Skeleton` and `Animation` types are ours; the `.tscn` writer is a single file that converts to Godot's text scene format. Swappable later if we add other engine targets.
- **Score-gated transitions.** The orchestrator owns retry policy; stages don't decide when to retry themselves.

---

## 7. Tools / Features

### 7.1 Prompt Parser
- **Purpose:** Convert free text into a deterministic `EnemySpec`.
- **Operations:**
  - LLM-backed slot extraction (Claude via existing harness client).
  - Schema validation against `EnemySpec` (Zod).
  - Slot overrides from CLI flags.
- **Slots:** `templateId`, `name`, `palette[]`, `materials[]`, `mood`, `attackArchetype` (`melee-fast`/`melee-heavy`/`ranged-cast`/`ranged-throw`), `optionalParts[]` (`weapon`, `cloak`, `shield`, `tail`, `wings`).

### 7.2 Visual Generator
- **Purpose:** Produce reference art the rest of the pipeline consumes.
- **Operations:**
  - Generate neutral pose at fixed dimensions (e.g. 768×1024).
  - Optionally generate an attack reference pose for motion blending.
  - Inject template-specific scaffolding into the prompt (T-pose, plain background, even lighting, character centered).
- **Adapter:** `ImageGenAdapter` (FAL FLUX/schnell default; stub adapter for tests).

### 7.3 Part Extractor
- **Purpose:** Semantic segmentation into the template's required regions, **fully local** (no external services).
- **Operations:**
  - Background removal via `@imgly/background-removal-node` (runs ONNX locally).
  - Region segmentation: hybrid approach exploiting the fixed T-pose scaffolding from the visual generator.
    - Template-driven anchor estimation: for a centered T-pose, head/torso/limb regions live in known proportional bands; landmark detection (shoulder/hip/wrist/ankle) uses alpha-shape analysis along expected horizontal slices.
    - Optional ONNX-runtime SAM (or MobileSAM) checkpoint for finer boundaries — bundled or auto-downloaded once on first run, then cached locally.
  - Per-region mask + cropped PNG.

### 7.4 Mesh Builder
- **Purpose:** Convert each part raster into a deformation-ready triangle mesh.
- **Operations:**
  - Adaptive grid + Delaunay triangulation along alpha boundary.
  - Vertex budget per part (configurable; default ~40–80 verts).
  - Mesh sanity: no degenerate triangles, no self-intersection, alpha coverage threshold.

### 7.5 Rig Builder
- **Purpose:** Bind the template's bone hierarchy onto the part meshes.
- **Operations:**
  - Load template skeleton (humanoid: ~22 bones).
  - Anatomical landmark detection (shoulder/elbow/hip/knee approximations from segmentation).
  - Procedural bone placement to landmarks; symmetry enforcement.
  - Skin weight assignment via heat-map / nearest-bone falloff.
  - IK constraints on arms and legs.

### 7.6 Motion Mapper
- **Purpose:** Apply stock animations from the template's motion library.
- **Operations:**
  - Bind clips by canonical bone names (template guarantees the names exist).
  - Apply `idle`, `attack`, `hit`, `death`.
  - Adjust attack timing to match `attackArchetype` (heavy = longer windup).

### 7.7 Godot Exporter
- **Purpose:** Emit a runtime-ready Godot scene.
- **Operations:**
  - Pack region textures into a single atlas page (`enemy.atlas.png`) plus a Godot `AtlasTexture` `.tres` per region.
  - Write `enemy.tscn` containing:
    - Root `Node2D` (`Enemy`).
    - `Skeleton2D` with `Bone2D` hierarchy matching the template.
    - One `Polygon2D` per part, parented to its driving bone, using the part's mesh + skin weights.
    - `AnimationPlayer` with `idle`/`attack`/`hit`/`death` clips animating bone transforms.
  - Write `enemy.meta.json` with prompt, seed, scores, regen history, template id.

### 7.8 Evaluator
- **Purpose:** Stage-level and overall quality gates.
- **Checks:**
  - **Silhouette:** readability at 64×64 downsample (edge-density / shape entropy).
  - **Part coverage:** all required regions detected with min area.
  - **Mesh sanity:** no inverted triangles, area variance bound, alpha coverage ≥ threshold.
  - **Rig sanity:** elbow/knee bend direction, symmetry tolerance, all required bones placed.
  - **Motion readability:** attack windup-vs-strike pose distance above threshold.
- **Output:** `StageResult { stage, ok, score: 0..1, issues: string[] }`.

### 7.9 CLI
- `assets-compiler compile` — full pipeline.
- `assets-compiler resume -p <dir>` — resume from last successful stage.
- `assets-compiler stage <name> -p <dir>` — re-run single stage.
- `assets-compiler validate -p <dir>` — re-score an existing bundle.
- `assets-compiler templates` — list registered templates.

---

## 8. Technology Stack

| Concern | Choice | Notes |
|---|---|---|
| Language / runtime | TypeScript on Node ≥ 22, ESM | Matches monorepo |
| Build | tsc + Turbo | `rootDir: src`, `outDir: dist` |
| CLI | `commander` | Already used by `apps/cli` |
| Schema | `zod` | EnemySpec, StageResult |
| Image gen | `@fal-ai/serverless-client` (FLUX/schnell) | Reuse `@agent-harness/assets` patterns; cached by `(prompt-hash, seed)` |
| Background removal | `@imgly/background-removal-node` | Runs ONNX locally, no external service |
| Semantic segmentation | Local heuristic (template-driven landmarks) + optional local ONNX SAM/MobileSAM via `onnxruntime-node` | Fully local — no remote endpoints |
| Image processing | `sharp` | Crop, mask, atlas pack |
| Atlas packing | `maxrects-packer` | Handles bin packing |
| Triangulation | `delaunator` + custom grid | Pure JS, deterministic |
| Scene export | Custom `.tscn` writer (text format, well-documented Godot 4 schema) | No third-party Godot tooling required |
| LLM (prompt parser) | Existing `@agent-harness/core` Claude client | Inherits caching + tracing |
| Tests | `vitest` | Match monorepo convention |
| Tracing | LangSmith env-based, mirroring Studio | `applyLangSmithEnv` reused |

**Optional / future:**
- Replace JS triangulator with a learned mesh-placement model (still local).
- Replace heat-weight skinning with a learned skinning network (still local).
- Add a second engine exporter (e.g. DragonBones) once the internal skeleton type is stable.

---

## 9. Security & Configuration

### Configuration
- Env vars (consistent with the rest of the harness):
  - `ANTHROPIC_API_KEY` — prompt parser.
  - `FAL_KEY` — image generator (placeholder fallback when absent, like `@agent-harness/assets`).
  - `ASSETS_COMPILER_TEMPLATES_DIR` — override default templates directory.
  - `ASSETS_COMPILER_MODEL_CACHE` — override the local ONNX model cache directory (defaults to `~/.cache/agent-harness/assets-compiler/`).
  - `LANGCHAIN_TRACING_V2`, `LANGSMITH_API_KEY` — tracing (optional).
- Per-compile config via CLI flags or a JSON file (`--config compile.json`).

### Security
- **In scope:**
  - Treat prompts as untrusted text — never `eval`, never use them in shell commands directly.
  - Validate every stage artifact's path stays under the output dir (no `../` escape).
  - Sanitize filenames derived from prompts (slugify).
  - Network calls limited to FAL (image gen) and Anthropic (prompt parser); segmentation and all downstream stages run locally.
- **Out of scope:**
  - Multi-tenant isolation — single-user developer tool.
  - Sandboxing the model adapters — they run in the harness process.

### Deployment
- Ships as a workspace package; consumed by `apps/cli` for MVP.
- Studio integration is a later phase — programmatic API will be reused but no Studio code ships in MVP.
- No standalone server; pure CLI + library.

---

## 10. API Specification

### Programmatic API

```ts
import { compileEnemy } from '@agent-harness/assets-compiler';

const result = await compileEnemy({
  prompt: 'rust-armored skeleton knight, slow heavy attacks',
  templateId: 'humanoid',          // optional, parser infers if absent
  outputDir: './out/skeleton_knight',
  seed: 1234,                       // optional, defaults to hash(prompt)
  overrides: {
    palette: ['rust', 'bone', 'soot'],
    attackArchetype: 'melee-heavy',
  },
  retries: { perStage: 3, total: 8 },
  adapters: {                       // optional adapter overrides
    imageGen: customGen,
  },
  signal: abortController.signal,   // honors cancellation, like agent-loop
});

// result: CompileResult
// {
//   ok: true,
//   bundlePath: './out/skeleton_knight',
//   files: { spineJson, atlas, atlasPages, meta },
//   stages: StageResult[],
//   meta: EnemyMeta,
// }
```

### Stage event stream (for future Studio integration)

```ts
for await (const evt of compileEnemyStream(opts)) {
  // evt: { type: 'stage-start' | 'stage-progress' | 'stage-result' | 'retry' | 'done' | 'error',
  //        stage?: string, score?: number, ... }
}
```

The streaming API exists in MVP because the CLI uses it for progress output, but no Studio UI consumes it yet.

### CLI

```
assets-compiler compile \
  --prompt "rust-armored skeleton knight, slow heavy attacks" \
  --template humanoid \
  --output ./out/skeleton_knight \
  --seed 1234 \
  --retries 3 \
  --json   # emit machine-readable progress to stdout
```

### Output bundle

```
out/skeleton_knight/
├── enemy.tscn                 # Skeleton2D + Polygon2D meshes + AnimationPlayer
├── enemy.atlas.png            # packed atlas page
├── parts/
│   ├── head.tres              # AtlasTexture pointing into enemy.atlas.png
│   ├── torso.tres
│   └── ...
├── enemy.meta.json
└── .compiler/                 # intermediate artifacts (kept for resume/debug)
    ├── parse/spec.json
    ├── visual/{neutral.png, attack_ref.png}
    ├── parts/{head.png, torso.png, ...}
    ├── mesh/*.mesh.json
    ├── rig/skeleton.json
    └── motion/animations.json
```

Godot consumes via `load("res://.../enemy.tscn").instantiate()`; gameplay code calls `$AnimationPlayer.play("attack")`.

---

## 11. Success Criteria

### MVP success definition
The compiler produces a humanoid Godot scene bundle from a prompt, loadable in stock Godot 4 with no addons, with idle/attack/hit/death animations playing correctly, in **≥ 80% of compile runs without manual intervention**, **≤ 20% requiring an automatic retry**, and **0% requiring manual rigging**.

### Functional requirements
- ✅ `compileEnemy()` returns a successful `CompileResult` for the canonical test prompt set (10 humanoid prompts).
- ✅ Output bundle loads in Godot 4 (no addons) and animates without errors.
- ✅ All four stock animations play and are visually distinct.
- ✅ Re-running with same seed reuses cached image-gen output and produces an identical `.tscn` (downstream stages are deterministic).
- ✅ CLI exits non-zero with structured error JSON when retries are exhausted.
- ✅ Deckbuilder template loads a generated bundle in place of a static enemy PNG.

### Quality indicators
- Median compile time per enemy ≤ 90 s (excluding image gen wall time).
- ≥ 0.8 average silhouette score across the canonical prompt set.
- ≥ 0.85 part-coverage success rate across the canonical prompt set.
- Zero rig-sanity false positives in the canonical prompt set (no shipped bundles with backwards joints).

### UX goals
- A developer types one prompt and one CLI command and gets a usable enemy.
- Failures are diagnostic: the CLI tells you *which stage* failed and *why*, with paths to the offending artifacts.

---

## 12. Implementation Phases

### Phase 1 — Skeleton pipeline & exporter (Weeks 1–2)
**Goal:** Prove the deterministic stage-runner end-to-end with stub adapters and a hand-authored test asset.

✅ Deliverables:
- ✅ Package scaffold, types, CLI shell.
- ✅ Stage runner + asset graph + retry policy.
- ✅ Humanoid template authored by hand: bone hierarchy, slot map, four motion clips (idle/attack/hit/death) as bone-track JSON.
- ✅ Stub image-gen adapter that returns a fixture PNG.
- ✅ Godot exporter: writes `.tscn` with `Skeleton2D` + `Polygon2D` + `AnimationPlayer` from a hand-authored skeleton.
- ✅ Round-trip test: stub-pipeline → bundle → load in stock Godot 4 → animations play.
- ✅ Deckbuilder template prototype loading the test bundle.

**Validation:** Godot loads the exported bundle (no addons) and plays idle/attack/hit/death; deckbuilder scene swaps a static enemy PNG for the bundle.

### Phase 2 — Real image gen + segmentation + mesh (Weeks 3–4)
**Goal:** Replace stubs for the front half of the pipeline.

✅ Deliverables:
- ✅ Prompt parser (Claude-backed, Zod-validated).
- ✅ FAL.ai image generator with retry/seed control.
- ✅ Local background removal (`@imgly/background-removal-node`) + template-driven region segmentation, optional local ONNX SAM.
- ✅ Mesh builder with Delaunay+grid triangulation.
- ✅ Evaluators for silhouette, part coverage, mesh sanity.

**Validation:** A real prompt produces clean part PNGs and meshes that pass sanity gates.

### Phase 3 — Rig builder + motion mapping (Weeks 5–6)
**Goal:** Close the back half. From here, every prompt should produce a playable bundle.

✅ Deliverables:
- ✅ Landmark detection, procedural bone placement, symmetry enforcement.
- ✅ Heat-weight skinning + IK constraints.
- ✅ Motion mapper applying the four stock animations.
- ✅ Rig sanity + motion readability evaluators.
- ✅ End-to-end CLI compile from prompt to bundle.

**Validation:** Compile 10 canonical prompts; ≥ 80% pass without retry, ≥ 95% pass with retry, all play correctly in Godot.

### Phase 4 — Deckbuilder integration + polish (Week 7)
**Goal:** Wire the compiler into the deckbuilder template end-to-end and harden the dev surface.

✅ Deliverables:
- ✅ Deckbuilder template updated: `enemies.json` schema accepts a bundle path; combat scene instantiates `.tscn` and drives animations on hit/death.
- ✅ Resume / single-stage CLI.
- ✅ Image-gen cache by `(prompt-hash, seed)`.
- ✅ README, examples, troubleshooting docs.
- ✅ Tracing wired through LangSmith.

**Validation:** Generate a full deckbuilder enemy roster (≥ 9 enemies across 3 acts) via the compiler; deckbuilder runs with all enemies animating correctly. Studio integration deferred to a follow-up phase.

---

## 13. Future Considerations

- **Studio integration** — UI panel for prompt → progress → preview → approve, consuming the existing event stream API.
- Additional anatomy templates: blob, floating caster, insectoid quadruped-lite.
- Player characters and bosses (multi-phase rigs).
- Learned mesh placement (SpriteToMesh-style) replacing the JS triangulator.
- Learned skinning weights replacing heat-map weights.
- Motion transfer: drive new clips from a reference video instead of the stock pack.
- In-pipeline Godot preview render (instead of round-tripping through a separate Godot launch).
- Variant generation: produce N stylistic variants per prompt with a shared rig.
- Asset versioning + delta export when re-compiling an existing enemy.
- Second engine target (DragonBones or another open format) once the internal skeleton type stabilizes.

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stable semantic segmentation from AI art is hard. | High | High | Hard-code prompt scaffolding (T-pose, plain background, centered framing); start with one adapter and a reliable fallback; require min part-area thresholds and retry on miss. |
| Auto mesh placement produces bad deformation around joints. | High | Medium | Use template-driven joint regions to bias triangle density; cap vertex count; mesh-sanity gate with retry. |
| Rigging fails on non-canonical anatomy (e.g., one-armed enemy). | Medium | Medium | Optional-parts list in the spec; require optional parts to pass independently; fall back to "minimal humanoid" rig when optionals are missing. |
| Motion looks "animated" but not game-readable. | Medium | Medium | Motion-readability evaluator measures windup-vs-strike pose distance; tune thresholds against canonical prompts. |
| Image-gen variability breaks reproducibility. | Medium | Low | Accepted by design — cache image-gen outputs by `(prompt-hash, seed)` so reruns reuse the same image; downstream stages remain deterministic. |
| Godot `.tscn` schema drift across minor versions. | Low | Medium | Pin a target Godot 4.x version in CLAUDE.md and the harness; integration test loads bundles via `godot --headless`; isolate the writer so a schema bump is one file. |
| Local segmentation quality below remote SAM. | Medium | Medium | Lean on template-driven scaffolding (T-pose, plain bg, centered framing) so heuristics work; ship MobileSAM as the optional local upgrade path. |
| Scope creep into player characters / bosses. | Medium | Medium | This PRD freezes MVP to humanoid enemies with four stock motions; new templates only after Phase 4 ships. |

---

## 15. Appendix

### Related documents
- `CLAUDE.md` — monorepo conventions (TS strictness, Turbo build order, role prompts).
- `packages/assets/README.md` — existing flat-image asset pipeline (reuse FAL adapter patterns).
- `templates/deckbuilder/` — consumer of generated enemy bundles.

### Key dependencies
- Godot 4 [Skeleton2D](https://docs.godotengine.org/en/stable/classes/class_skeleton2d.html), [Polygon2D](https://docs.godotengine.org/en/stable/classes/class_polygon2d.html), [AnimationPlayer](https://docs.godotengine.org/en/stable/classes/class_animationplayer.html)
- Godot [.tscn text format](https://docs.godotengine.org/en/stable/contributing/development/file_formats/tscn.html)
- [FAL.ai serverless](https://fal.ai/models/fal-ai/flux/schnell)
- [delaunator](https://github.com/mapbox/delaunator)
- [maxrects-packer](https://github.com/soimy/maxrects-packer)
- [@imgly/background-removal-node](https://github.com/imgly/background-removal-js)
- [onnxruntime-node](https://onnxruntime.ai/) — optional local SAM/MobileSAM

### Repository placement

```
apps/
├── cli/
├── studio/
└── assets-compiler/   ← this package
```

Builds after `core` and `assets`, before consumers. Turbo dependency chain:
`core → tools → game-adapter → assets → assets-compiler → cli, studio`.

---

*End of PRD.*
