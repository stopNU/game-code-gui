# @agent-harness/assets-compiler

Compile text prompts into game-ready 2D skeletal enemy bundles for Godot 4.

This is the **Phase 1** scaffold: the deterministic stage runner, hand-authored
humanoid template, and Godot `.tscn` exporter are wired end-to-end with a
visual-stub stage that uses flat colors instead of generated textures. Real
image generation, segmentation, mesh building, and rigging come in Phases 2–3
(see `PRD.md`).

## Usage

```bash
# from the package directory
node ./bin/assets-compiler.js compile \
  --prompt "rust-armored skeleton knight, slow heavy attacks" \
  --output ./out/skeleton_knight
```

Output bundle layout:

```
out/skeleton_knight/
├── enemy.tscn          # Skeleton2D + Polygon2D + AnimationPlayer
├── enemy.meta.json     # prompt, palette, seed, scores, retries
└── .compiler/          # intermediate stage artifacts (resume/debug)
```

Programmatic API:

```ts
import { compileEnemy } from '@agent-harness/assets-compiler';

const result = await compileEnemy({
  prompt: 'rust-armored skeleton knight, slow heavy attacks',
  outputDir: './out/skeleton_knight',
  seed: 12345,
});
```

## Phase 1 status

| Stage   | Phase 1 implementation                                 |
| ------- | ------------------------------------------------------ |
| parse   | rule-based slot extraction (LLM in Phase 2)            |
| visual  | stub: per-region flat colors from palette              |
| segment | _not in pipeline yet_ (Phase 2)                        |
| mesh    | hand-authored quads from humanoid template             |
| rig     | template pass-through (procedural rigging in Phase 3)  |
| motion  | hand-authored idle/attack/hit/death tracks             |
| export  | Godot 4 `.tscn` writer (Skeleton2D + Polygon2D + AP)   |

## Round-trip test

`pnpm --filter @agent-harness/assets-compiler test` runs:

1. A structural validation of the generated `.tscn` (vitest only).
2. A Godot headless load test that instantiates the bundle, walks the scene
   tree, and asserts bone/mesh/animation counts. Skipped when `GODOT_PATH`
   isn't set.

## Deckbuilder integration (prototype)

A sample bundle and demo scene ship under
`templates/deckbuilder/src/assets/generated/enemies/sample_humanoid/` and
`templates/deckbuilder/src/scenes/EnemySkeletalDemo.tscn`. Phase 4 wires the
combat scene onto these bundles in place of static enemy PNGs.
