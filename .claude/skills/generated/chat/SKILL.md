---
name: chat
description: "Skill for the Chat area of game-code-gui. 15 symbols across 9 files."
---

# Chat

15 symbols | 9 files | Cohesion: 90%

## When to Use

- Working with code in `apps/`
- Understanding how formatProvider, getAvailableProviders, getEffectiveProvider work
- Modifying chat-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/src/components/chat/tool-call-card.tsx` | ToolCallCard, summarizeToolCall, getRecordString, truncate |
| `apps/studio/src/lib/conversation-defaults.ts` | getAvailableProviders, getEffectiveProvider |
| `apps/studio/src/components/chat/conversation-header.tsx` | ConversationHeader, commitRename |
| `apps/studio/src/components/chat/chat-composer.tsx` | ChatComposer, handleSubmit |
| `apps/studio/src/lib/utils.ts` | formatProvider |
| `apps/studio/src/components/command-palette.tsx` | CommandPalette |
| `apps/studio/src/components/conversations/conversations-list.tsx` | ConversationsList |
| `apps/studio/src/lib/message-content.ts` | stringifyJson |
| `apps/studio/src/components/approvals/approval-dialog.tsx` | ApprovalDialog |

## Entry Points

Start here when exploring this area:

- **`formatProvider`** (Function) — `apps/studio/src/lib/utils.ts:8`
- **`getAvailableProviders`** (Function) — `apps/studio/src/lib/conversation-defaults.ts:61`
- **`getEffectiveProvider`** (Function) — `apps/studio/src/lib/conversation-defaults.ts:65`
- **`CommandPalette`** (Function) — `apps/studio/src/components/command-palette.tsx:15`
- **`ConversationsList`** (Function) — `apps/studio/src/components/conversations/conversations-list.tsx:21`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `formatProvider` | Function | `apps/studio/src/lib/utils.ts` | 8 |
| `getAvailableProviders` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 61 |
| `getEffectiveProvider` | Function | `apps/studio/src/lib/conversation-defaults.ts` | 65 |
| `CommandPalette` | Function | `apps/studio/src/components/command-palette.tsx` | 15 |
| `ConversationsList` | Function | `apps/studio/src/components/conversations/conversations-list.tsx` | 21 |
| `ConversationHeader` | Function | `apps/studio/src/components/chat/conversation-header.tsx` | 27 |
| `commitRename` | Function | `apps/studio/src/components/chat/conversation-header.tsx` | 51 |
| `stringifyJson` | Function | `apps/studio/src/lib/message-content.ts` | 28 |
| `ToolCallCard` | Function | `apps/studio/src/components/chat/tool-call-card.tsx` | 9 |
| `ApprovalDialog` | Function | `apps/studio/src/components/approvals/approval-dialog.tsx` | 11 |
| `ChatComposer` | Function | `apps/studio/src/components/chat/chat-composer.tsx` | 12 |
| `handleSubmit` | Function | `apps/studio/src/components/chat/chat-composer.tsx` | 26 |
| `summarizeToolCall` | Function | `apps/studio/src/components/chat/tool-call-card.tsx` | 52 |
| `getRecordString` | Function | `apps/studio/src/components/chat/tool-call-card.tsx` | 74 |
| `truncate` | Function | `apps/studio/src/components/chat/tool-call-card.tsx` | 83 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `CenterPanel → StringifyJson` | cross_community | 4 |
| `ToolCallCard → GetRecordString` | intra_community | 3 |
| `ToolCallCard → Truncate` | intra_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Ui | 1 calls |
| Layout | 1 calls |

## How to Explore

1. `gitnexus_context({name: "formatProvider"})` — see callers and callees
2. `gitnexus_query({query: "chat"})` — find related execution flows
3. Read key files listed above for implementation details
