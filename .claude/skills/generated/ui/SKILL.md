---
name: ui
description: "Skill for the Ui area of game-code-gui. 9 symbols across 8 files."
---

# Ui

9 symbols | 8 files | Cohesion: 94%

## When to Use

- Working with code in `apps/`
- Understanding how cn, Skeleton, Separator work
- Modifying ui-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/src/components/chat/message.tsx` | getSystemMessageTone, Message |
| `apps/studio/src/lib/utils.ts` | cn |
| `apps/studio/src/components/ui/skeleton.tsx` | Skeleton |
| `apps/studio/src/components/ui/separator.tsx` | Separator |
| `apps/studio/src/components/ui/scroll-area.tsx` | ScrollArea |
| `apps/studio/src/components/ui/card.tsx` | Card |
| `apps/studio/src/components/ui/badge.tsx` | Badge |
| `apps/studio/src/components/project/project-list.tsx` | ProjectList |

## Entry Points

Start here when exploring this area:

- **`cn`** (Function) — `apps/studio/src/lib/utils.ts:4`
- **`Skeleton`** (Function) — `apps/studio/src/components/ui/skeleton.tsx:3`
- **`Separator`** (Function) — `apps/studio/src/components/ui/separator.tsx:2`
- **`ScrollArea`** (Function) — `apps/studio/src/components/ui/scroll-area.tsx:3`
- **`Card`** (Function) — `apps/studio/src/components/ui/card.tsx:3`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `cn` | Function | `apps/studio/src/lib/utils.ts` | 4 |
| `Skeleton` | Function | `apps/studio/src/components/ui/skeleton.tsx` | 3 |
| `Separator` | Function | `apps/studio/src/components/ui/separator.tsx` | 2 |
| `ScrollArea` | Function | `apps/studio/src/components/ui/scroll-area.tsx` | 3 |
| `Card` | Function | `apps/studio/src/components/ui/card.tsx` | 3 |
| `Badge` | Function | `apps/studio/src/components/ui/badge.tsx` | 3 |
| `ProjectList` | Function | `apps/studio/src/components/project/project-list.tsx` | 15 |
| `Message` | Function | `apps/studio/src/components/chat/message.tsx` | 23 |
| `getSystemMessageTone` | Function | `apps/studio/src/components/chat/message.tsx` | 11 |

## How to Explore

1. `gitnexus_context({name: "cn"})` — see callers and callees
2. `gitnexus_query({query: "ui"})` — find related execution flows
3. Read key files listed above for implementation details
