---
name: layout
description: "Skill for the Layout area of game-code-gui. 12 symbols across 5 files."
---

# Layout

12 symbols | 5 files | Cohesion: 80%

## When to Use

- Working with code in `apps/`
- Understanding how createConversationFromCurrentContext, navigateConversation, handleKeyDown work
- Modifying layout-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/src/App.tsx` | createConversationFromCurrentContext, navigateConversation, handleKeyDown |
| `apps/studio/src/lib/conversation-defaults.ts` | getDefaultConversationTitle, getDefaultConversationConfig, getDefaultModelForProvider |
| `apps/studio/src/components/layout/center-panel.tsx` | normalizeDbMessages, CenterPanel, handleSend |
| `apps/studio/src/lib/message-content.ts` | serializeContentBlocks, isRecord |
| `apps/studio/src/components/layout/left-panel.tsx` | LeftPanel |

## Entry Points

Start here when exploring this area:

- **`createConversationFromCurrentContext`** (Function) — `apps/studio/src/App.tsx:85`
- **`navigateConversation`** (Function) — `apps/studio/src/App.tsx:92`
- **`handleKeyDown`** (Function) — `apps/studio/src/App.tsx:194`
- **`getDefaultConversationTitle`** (Function) — `apps/studio/src/lib/conversation-defaults.ts:22`
- **`getDefaultConversationConfig`** (Function) — `apps/studio/src/lib/conversation-defaults.ts:26`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `createConversationFromCurrentContext` | Function | `apps/studio/src/App.tsx` | 85 |
| `navigateConversation` | Function | `apps/studio/src/App.tsx` | 92 |
| `handleKeyDown` | Function | `apps/studio/src/App.tsx` | 194 |
| `getDefaultConversationTitle` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 22 |
| `getDefaultConversationConfig` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 26 |
| `LeftPanel` | Function | `apps/studio/src/components/layout/left-panel.tsx` | 5 |
| `serializeContentBlocks` | Function | `apps/studio/src/lib/message-content.ts` | 0 |
| `isRecord` | Function | `apps/studio/src/lib/message-content.ts` | 36 |
| `getDefaultModelForProvider` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 14 |
| `CenterPanel` | Function | `apps/studio/src/components/layout/center-panel.tsx` | 37 |
| `handleSend` | Function | `apps/studio/src/components/layout/center-panel.tsx` | 86 |
| `normalizeDbMessages` | Function | `apps/studio/src/components/layout/center-panel.tsx` | 18 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `HandleRunPhase → GetDefaultConversationTitle` | cross_community | 4 |
| `HandleRunPhase → GetDefaultModelForProvider` | cross_community | 4 |
| `HandleRunTask → GetDefaultConversationTitle` | cross_community | 4 |
| `HandleRunTask → GetDefaultModelForProvider` | cross_community | 4 |
| `HandleKeyDown → GetDefaultConversationTitle` | intra_community | 4 |
| `HandleKeyDown → GetDefaultModelForProvider` | cross_community | 4 |
| `CenterPanel → IsRecord` | intra_community | 4 |
| `CenterPanel → StringifyJson` | cross_community | 4 |
| `LeftPanel → GetDefaultConversationTitle` | intra_community | 3 |
| `LeftPanel → GetDefaultModelForProvider` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Chat | 1 calls |

## How to Explore

1. `gitnexus_context({name: "createConversationFromCurrentContext"})` — see callers and callees
2. `gitnexus_query({query: "layout"})` — find related execution flows
3. Read key files listed above for implementation details
