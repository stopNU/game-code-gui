---
name: agent
description: "Skill for the Agent area of game-code-gui. 79 symbols across 8 files."
---

# Agent

79 symbols | 8 files | Cohesion: 89%

## When to Use

- Working with code in `apps/`
- Understanding how buildToolExecutionContext, summarizeToolResult, buildConversationAgentPrompt work
- Modifying agent-related functionality

## Key Files

| File | Symbols |
|------|---------|
| `apps/studio/electron/agent/conversation-agent.ts` | emit, ensureConversation, listMessages, createMessage, addConversationTokens (+27) |
| `apps/studio/electron/agent/tool-registry.ts` | buildToolExecutionContext, summarizeToolResult, resolveProjectPath, emit, getTaskPlan (+13) |
| `apps/studio/electron/agent/llm-provider.ts` | streamMessage, claudeToLC, lcToClaudeMessage, toLC, extractTokens (+5) |
| `apps/studio/electron/agent/approval-gate.ts` | requestApprovalRecord, findReusableDecision, resolveApproval, emit, stableStringify (+5) |
| `apps/studio/electron/agent/tool-registry.test.ts` | getTool, createTask, createPlan, createBridge |
| `packages/playtest/src/runner/playtest-runner.ts` | executeStep, resolvePath, evaluateAssertion |
| `apps/studio/electron/agent/conversation-agent-prompt.ts` | buildConversationAgentPrompt |
| `apps/studio/electron/agent/langsmith/env.ts` | applyLangSmithEnv |

## Entry Points

Start here when exploring this area:

- **`buildToolExecutionContext`** (Function) — `apps/studio/electron/agent/tool-registry.ts:510`
- **`summarizeToolResult`** (Function) — `apps/studio/electron/agent/tool-registry.ts:531`
- **`buildConversationAgentPrompt`** (Function) — `apps/studio/electron/agent/conversation-agent-prompt.ts:26`
- **`applyLangSmithEnv`** (Function) — `apps/studio/electron/agent/langsmith/env.ts:6`
- **`createStudioTools`** (Function) — `apps/studio/electron/agent/tool-registry.ts:148`

## Key Symbols

| Symbol | Type | File | Line |
|--------|------|------|------|
| `ApprovalGate` | Class | `apps/studio/electron/agent/approval-gate.ts` | 59 |
| `AnthropicProvider` | Class | `apps/studio/electron/agent/llm-provider.ts` | 169 |
| `OpenAIProvider` | Class | `apps/studio/electron/agent/llm-provider.ts` | 259 |
| `buildToolExecutionContext` | Function | `apps/studio/electron/agent/tool-registry.ts` | 510 |
| `summarizeToolResult` | Function | `apps/studio/electron/agent/tool-registry.ts` | 531 |
| `buildConversationAgentPrompt` | Function | `apps/studio/electron/agent/conversation-agent-prompt.ts` | 26 |
| `applyLangSmithEnv` | Function | `apps/studio/electron/agent/langsmith/env.ts` | 6 |
| `createStudioTools` | Function | `apps/studio/electron/agent/tool-registry.ts` | 148 |
| `hashToolArgs` | Function | `apps/studio/electron/agent/approval-gate.ts` | 55 |
| `onAbort` | Function | `apps/studio/electron/agent/approval-gate.ts` | 114 |
| `LLMProvider` | Interface | `apps/studio/electron/agent/llm-provider.ts` | 14 |
| `streamMessage` | Method | `apps/studio/electron/agent/llm-provider.ts` | 15 |
| `sendMessage` | Method | `apps/studio/electron/agent/conversation-agent.ts` | 186 |
| `runCodexConversation` | Method | `apps/studio/electron/agent/conversation-agent.ts` | 480 |
| `runStructuredImplementTask` | Method | `apps/studio/electron/agent/conversation-agent.ts` | 659 |
| `runStructuredImplementTaskBatch` | Method | `apps/studio/electron/agent/conversation-agent.ts` | 764 |
| `requestApprovalRecord` | Method | `apps/studio/electron/agent/approval-gate.ts` | 12 |
| `findReusableDecision` | Method | `apps/studio/electron/agent/approval-gate.ts` | 25 |
| `resolveApproval` | Method | `apps/studio/electron/agent/approval-gate.ts` | 34 |
| `emit` | Method | `apps/studio/electron/agent/approval-gate.ts` | 39 |

## Execution Flows

| Flow | Type | Steps |
|------|------|-------|
| `RunCodexConversation → MapRow` | cross_community | 5 |
| `RunCodexConversation → Run` | cross_community | 4 |
| `RunCodexConversation → Emit` | intra_community | 4 |
| `RunCodexConversation → BuildToolExecutionContext` | intra_community | 4 |
| `RunCodexConversation → GetProject` | intra_community | 4 |
| `RunCodexConversation → UpsertProject` | intra_community | 4 |
| `StreamMessage → AbortError` | cross_community | 4 |
| `StreamMessage → AbortError` | cross_community | 4 |
| `StreamMessage → IsAbortError` | cross_community | 3 |
| `StreamMessage → IsAbortError` | cross_community | 3 |

## Connected Areas

| Area | Connections |
|------|-------------|
| Loop | 3 calls |
| Services | 2 calls |
| Repositories | 2 calls |
| Types | 1 calls |

## How to Explore

1. `gitnexus_context({name: "buildToolExecutionContext"})` — see callers and callees
2. `gitnexus_query({query: "agent"})` — find related execution flows
3. Read key files listed above for implementation details
