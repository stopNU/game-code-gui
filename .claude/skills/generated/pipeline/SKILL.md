---
name: pipeline
description: "Skill for the Pipeline area of game-code-gui. 12 symbols across 5 files."
---

# Pipeline

12 symbols | 5 files | Cohesion: 93%

## When to Use

- Working with code in `packages/`
- Understanding how runAssetPipeline, generateContentArt, readManifest work
- Modifying pipeline-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `packages/assets/src/pipeline/content-art-generator.ts` | dimensionsFor, usageFor, generateContentArt |
| `packages/assets/src/manifest/manifest-io.ts` | readManifest, writeManifest, registerAsset |
| `packages/assets/src/generators/placeholder.ts` | generatePlaceholder, hashColor, createSilentWav |
| `packages/assets/src/pipeline/pipeline-runner.ts` | runAssetPipeline, typeToDir |
| `packages/assets/src/generators/fal-generator.ts` | generateWithFal |

## Entry Points

Start here when exploring this area:

- **`runAssetPipeline`** (Function) — `packages/assets/src/pipeline/pipeline-runner.ts:18`
- **`generateContentArt`** (Function) — `packages/assets/src/pipeline/content-art-generator.ts:62`
- **`readManifest`** (Function) — `packages/assets/src/manifest/manifest-io.ts:6`
- **`writeManifest`** (Function) — `packages/assets/src/manifest/manifest-io.ts:16`
- **`registerAsset`** (Function) — `packages/assets/src/manifest/manifest-io.ts:21`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `runAssetPipeline` | Function | `packages/assets/src/pipeline/pipeline-runner.ts` | 18 |
| `generateContentArt` | Function | `packages/assets/src/pipeline/content-art-generator.ts` | 62 |
| `readManifest` | Function | `packages/assets/src/manifest/manifest-io.ts` | 6 |
| `writeManifest` | Function | `packages/assets/src/manifest/manifest-io.ts` | 16 |
| `registerAsset` | Function | `packages/assets/src/manifest/manifest-io.ts` | 21 |
| `generatePlaceholder` | Function | `packages/assets/src/generators/placeholder.ts` | 10 |
| `generateWithFal` | Function | `packages/assets/src/generators/fal-generator.ts` | 9 |
| `typeToDir` | Function | `packages/assets/src/pipeline/pipeline-runner.ts` | 70 |
| `dimensionsFor` | Function | `packages/assets/src/pipeline/content-art-generator.ts` | 26 |
| `usageFor` | Function | `packages/assets/src/pipeline/content-art-generator.ts` | 38 |
| `hashColor` | Function | `packages/assets/src/generators/placeholder.ts` | 73 |
| `createSilentWav` | Function | `packages/assets/src/generators/placeholder.ts` | 82 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `GenerateAssets → CreateSilentWav` | cross_community | 5 |
| `GenerateAssets → HashColor` | cross_community | 5 |
| `GenerateAssets → DimensionsFor` | cross_community | 4 |
| `GenerateAssets → UsageFor` | cross_community | 4 |
| `GenerateAssets → GenerateWithFal` | cross_community | 4 |
| `RunAssetPipeline → CreateSilentWav` | intra_community | 3 |
| `RunAssetPipeline → HashColor` | intra_community | 3 |
| `RunAssetPipeline → ReadManifest` | intra_community | 3 |
| `RunAssetPipeline → WriteManifest` | intra_community | 3 |

## How to Explore

1. `gitnexus_context({name: "runAssetPipeline"})` — see callers and callees
2. `gitnexus_query({query: "pipeline"})` — find related execution flows
3. Read key files listed above for implementation details
