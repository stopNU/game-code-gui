# @agent-harness/assets-compiler

Compile text prompts into game-ready 2D skeletal enemy bundles for Godot 4.

**Phase 2** — the front half of the pipeline now runs for real:
LLM-backed prompt parser → FAL.ai image generation → background removal via
Transformers.js (RMBG-1.4) → template-driven region segmentation → Delaunay-
triangulated meshes → packed atlas → textured `Polygon2D` nodes in the
exported `.tscn`. Procedural rigging and motion mapping land in Phase 3.

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

## Pipeline stages (Phase 2)

| Stage   | Implementation                                                            |
| ------- | ------------------------------------------------------------------------- |
| parse   | Claude-backed via `@agent-harness/core`, Zod-validated; rule-based fallback |
| visual  | FAL.ai FLUX/schnell with constrained T-pose prompt; silhouette-stub fallback |
| segment | Transformers.js / RMBG-1.4 bg removal + template-driven region cropping; color-key fallback |
| mesh    | Per-region Delaunay + grid triangulation (alpha-aware); ~25–40 verts/region |
| atlas   | `maxrects-packer` packs region textures into a single PNG                 |
| rig     | Template pass-through (Phase 1 layout); procedural rig comes in Phase 3   |
| motion  | Hand-authored `idle` / `attack` / `hit` / `death` tracks                  |
| export  | Godot 4 `.tscn` — `Skeleton2D` + textured `Polygon2D` (with UVs into atlas) + `AnimationPlayer` |

Evaluators run per stage and feed retry decisions:

- **silhouette**: opaque-pixel coverage at 64×64 downsample, bell-curve scoring around 35%
- **part coverage**: fraction of expected regions with ≥32 opaque px
- **mesh sanity**: degenerate-triangle ratio, vertex-budget compliance

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
