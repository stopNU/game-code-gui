# @agent-harness/assets-compiler

Compile text prompts into game-ready 2D skeletal enemy bundles for Godot 4.

**Phase 3** — the back half of the pipeline now runs for real:
LLM-backed prompt parser → FAL.ai image generation → background removal via
Transformers.js (MODNet by default) → **landmark detection on the cutout
→ procedural skeleton with bones placed from actual figure geometry →
landmark-derived dynamic region rects** → Delaunay-triangulated meshes →
packed atlas → textured `Polygon2D` nodes parented to bones whose positions
match the figure. Falls back to template skeleton + template region rects
when landmark detection can't lock on (non-T-pose, non-humanoid, occluded).

Each stage runs through a deterministic stage runner with score gates and
per-stage retry; any stage failure cleanly falls back to the Phase 1
flat-color path, so the pipeline always produces a loadable bundle.

## Usage

```bash
# Real pipeline: LLM parser + image gen + bg removal + textured atlas.
# Requires ANTHROPIC_API_KEY (parser) and FAL_KEY (image gen). Without them,
# the pipeline still produces a bundle using rule-based parsing + a
# silhouette stub + the color-key fallback bg remover.
node ./bin/assets-compiler.js compile \
  --prompt "rust-armored skeleton knight, slow heavy attacks" \
  --output ./out/skeleton_knight

# Offline-friendly: skip the LLM, force color-key bg removal (no model download).
node ./bin/assets-compiler.js compile \
  --prompt "rust-armored skeleton knight" \
  --output ./out/skeleton_knight \
  --no-llm \
  --bg-removal color-key

# Phase 1-style flat-colored output (skip everything except parse/rig/export).
node ./bin/assets-compiler.js compile \
  --prompt "rust-armored skeleton knight" \
  --output ./out/skeleton_knight \
  --flat
```

Output bundle:

```
out/skeleton_knight/
├── enemy.tscn          # Skeleton2D + Polygon2D + AnimationPlayer
├── enemy.atlas.png     # packed texture atlas (textured path only)
├── enemy.meta.json     # prompt, palette, seed, per-stage scores
└── .compiler/          # intermediate stage artifacts (debug/resume)
```

Programmatic API:

```ts
import { compileEnemy } from '@agent-harness/assets-compiler';

const result = await compileEnemy({
  prompt: 'rust-armored skeleton knight, slow heavy attacks',
  outputDir: './out/skeleton_knight',
  seed: 12345,
  // Optional knobs:
  // useLlm: false,              // skip Claude prompt parser
  // flatOnly: true,             // skip image-gen + segmentation entirely
  // bundleSubdir: 'enemies/x',  // prefix atlas ext_resource path
});
```

## Pipeline stages (Phase 3)

| Stage   | Implementation                                                            |
| ------- | ------------------------------------------------------------------------- |
| parse   | Claude-backed via `@agent-harness/core`, Zod-validated; rule-based fallback |
| visual  | FAL.ai FLUX/schnell with constrained T-pose prompt; silhouette-stub fallback |
| (cutout)| Inline bg-removal via Transformers.js MODNet (default), color-key fallback |
| rig     | Landmark detection on cutout → procedural skeleton; template fallback      |
| segment | Crop regions from cutout using landmark-derived dynamic rects (or template) |
| mesh    | Per-region Delaunay + grid triangulation (alpha-aware); ~25–40 verts/region |
| atlas   | `maxrects-packer` packs region textures into a single PNG                 |
| motion  | Hand-authored `idle` / `attack` / `hit` / `death` tracks (bone-name-targeted) |
| export  | Godot 4 `.tscn` — `Skeleton2D` (procedural bones) + textured `Polygon2D` parented to bones, with UVs into atlas + `AnimationPlayer` |

Evaluators run per stage and feed retry decisions:

- **silhouette**: opaque-pixel coverage at 64×64 downsample, bell-curve scoring around 35%
- **part coverage**: fraction of expected regions with ≥32 opaque px
- **mesh sanity**: degenerate-triangle ratio, vertex-budget compliance
- **rig sanity** (Phase 3): anatomical plausibility — head above shoulders, hips above knees, left/right symmetry, head proportions

## How procedural rigging works

When a real source image is generated:

1. **Bg-removal** produces a clean cutout with figure on transparent background.
2. **Landmark detection** (`src/rig/landmarks.ts`) runs row-width profiling on the alpha mask. The maximum-width row in the upper half is the T-pose arm bar; the column with the densest spine column is the figure's center; transitions from "torso column" to "hip mass" mark the hip line; rows where alpha splits into two disjoint runs mark the leg-split. Result: head top/bottom, shoulder Y, hip Y, leg-split Y, plus left/right wrist/elbow/shoulder/hip/knee/ankle.
3. **Procedural skeleton** (`src/rig/build-skeleton.ts`) places each bone at its detected landmark. Bone names match the template (`root`, `hip`, `spine`, `chest`, `head`, `l_shoulder`, ..., `r_foot`) so the existing motion clips animate the new rig unchanged.
4. **Dynamic regions** (`src/rig/build-regions.ts`) derive region rects from the landmarks (head bbox between head_top and shoulder_y, arms between shoulders and wrists, legs between hips and ankles). The segment stage crops from these instead of the template's canvas-fixed proportions.
5. **Mesh-to-bone mapping in the exporter** uses `(regionPixel + boundsInSource) - boneAbs` to place each Polygon2D in its bone's local space — a direct source-canvas → bone-local translation. No template halfW/halfH is involved on this path.

If detection fails (sanity score too low, or bg-removal crashed), the orchestrator falls back to the Phase 2 template-based path.

## Environment

| Var                              | Effect                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`              | Enables LLM-backed prompt parser (Claude Haiku 4.5)                           |
| `FAL_KEY`                        | Enables FAL.ai FLUX/schnell image generation                                  |
| `ASSETS_COMPILER_BG_REMOVAL`     | `color-key` to skip RMBG model download and use the offline color-key adapter |
| `GODOT_PATH`                     | Used by the round-trip test and preview script                                |

## Round-trip test

`pnpm --filter @agent-harness/assets-compiler test` runs three checks:

1. **Flat-color structural** — compile + assert `.tscn` shape (offline).
2. **Flat-color Godot** — load the bundle in Godot 4 headless and walk the scene tree.
3. **Textured Phase 2** — full pipeline with the silhouette stub + color-key bg removal; asserts ext_resource, UVs, and `polygons` triangle list.

## Preview

```bash
pnpm --filter @agent-harness/assets-compiler run preview
```

Compiles a sample (offline by default — silhouette stub + color-key bg removal), opens it in the Godot editor, plays the four animations.

```bash
# real bg removal (downloads RMBG-1.4 once, ~80MB):
pnpm --filter @agent-harness/assets-compiler run preview -- --bg-removal rmbg

# flat-color preview (Phase 1 path):
pnpm --filter @agent-harness/assets-compiler run preview -- --flat
```

## Deckbuilder integration (prototype)

A sample bundle and demo scene ship under
`templates/deckbuilder/src/assets/generated/enemies/sample_humanoid/` and
`templates/deckbuilder/src/scenes/EnemySkeletalDemo.tscn`. Phase 4 wires the
combat scene onto these bundles in place of static enemy PNGs.
