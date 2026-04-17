import type { AgentContext, AgentLoopOptions, ClaudeMessage, ClaudeContentBlock } from '../types/agent.js';
import type { TaskResult } from '../types/task.js';
import type { JsonSchema, ToolContract, ToolExecutionContext } from '../types/tool.js';
import { ClaudeClient } from '../claude/client.js';
import { withRetry } from './retry.js';
import { DEFAULT_RETRY_POLICY } from '../types/agent.js';
import { buildAnthropicTaskPromptMessage } from './task-prompt.js';

export interface AgentLoopDeps {
  client?: ClaudeClient;
  tools: ToolContract[];
}

const MAX_IDENTICAL_TOOL_CALLS = 3;
// Max consecutive non-write tool calls before declaring a stall.
// Pre-write: generous (agent legitimately reads many deps before first write).
// Post-write: tight (after writing, the agent should patch, not keep reading).
const MAX_CALLS_WITHOUT_WRITE_PRE = 16;
const MAX_CALLS_WITHOUT_WRITE_POST = 8;

export async function runAgentLoop(
  ctx: AgentContext,
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
): Promise<TaskResult> {
  const client = deps.client ?? new ClaudeClient();
  const toolMap = new Map(deps.tools.map((t) => [t.name, t]));
  const history: ClaudeMessage[] = [...ctx.conversationHistory];
  const retryPolicy = opts.retryPolicy ?? DEFAULT_RETRY_POLICY;

  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let toolCallCount = 0;
  let callsSinceLastWrite = 0;
  let totalWrites = 0;
  let typechecksSinceLastWrite = 0;
  const filesModified: string[] = [];
  const repeatedToolCalls = new Map<string, number>();

  // Initial user message seeding the task
  if (history.length === 0) {
    history.push(buildAnthropicTaskPromptMessage(ctx));
  }

  for (let iteration = 0; iteration < opts.maxIterations; iteration++) {
    ctx.iterationCount = iteration;

    if (opts.signal?.aborted) {
      return {
        success: false,
        summary: 'Agent loop cancelled by user.',
        filesModified,
        toolCallCount,
        tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
      };
    }

    const result = await withRetry(
      () =>
        client.sendMessage({
          model: ctx.config.model,
          maxTokens: ctx.config.maxTokens,
          temperature: ctx.config.temperature,
          systemPrompt: ctx.config.systemPrompt,
          messages: windowHistory(history),
          tools: deps.tools,
          ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
          ...(opts.onText !== undefined ? { onText: opts.onText } : {}),
        }),
      retryPolicy,
      undefined,
      opts.signal,
    );

    totalInput += result.tokens.input;
    totalOutput += result.tokens.output;
    totalCached += result.tokens.cached;

    // Cached input tokens cost 90% less — count them at 10% weight for budget purposes
    ctx.tokenUsed = (totalInput - totalCached) + Math.round(totalCached * 0.1) + totalOutput;
    opts.onTokens?.({ input: totalInput, output: totalOutput, cached: totalCached });

    history.push(result.message);
    opts.onMessage?.(result.message);

    if (result.stopReason === 'end_turn' || result.stopReason === 'stop_sequence') {
      const summary = extractTextContent(result.message);
      return {
        success: true,
        summary,
        filesModified,
        toolCallCount,
        tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
      };
    }

    if (ctx.tokenBudget > 0 && ctx.tokenUsed >= ctx.tokenBudget) {
      if (opts.onBudgetExhausted) {
        const decision = await opts.onBudgetExhausted(ctx.tokenUsed, ctx.tokenBudget, filesModified.length);
        if (decision.action === 'continue') {
          ctx.tokenBudget += decision.extraBudget;
          // Fall through to continue processing tool calls with extended budget.
        } else {
          const summary = extractTextContent(result.message);
          return {
            success: false,
            summary: `Token budget exhausted (${ctx.tokenUsed.toLocaleString()} / ${(ctx.tokenBudget - decision.extraBudget).toLocaleString()} tokens used). User chose to stop.${summary ? ' Last response: ' + summary.slice(0, 200) : ''}`,
            filesModified,
            toolCallCount,
            tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
          };
        }
      } else {
        const summary = extractTextContent(result.message);
        return {
          success: false,
          summary: `Token budget exhausted (${ctx.tokenUsed.toLocaleString()} / ${ctx.tokenBudget.toLocaleString()} tokens used).${summary ? ' Last response: ' + summary.slice(0, 200) : ''}`,
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }
    }

    if (result.stopReason !== 'tool_use') {
      return {
        success: false,
        summary: `Unexpected stop reason: ${result.stopReason}`,
        filesModified,
        toolCallCount,
        tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
      };
    }

    // Process tool calls
    const toolBlocks = extractToolUseBlocks(result.message);
    const toolResultContents: ClaudeContentBlock[] = [];
    // Compressed versions stored in history — readFile results are truncated after the agent
    // has processed them so they don't bloat subsequent turns.
    const historyToolResults: ClaudeContentBlock[] = [];

    for (const block of toolBlocks) {
      if (!block.id || !block.name) continue;

      if (opts.signal?.aborted) {
        return {
          success: false,
          summary: 'Agent loop cancelled by user.',
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }

      toolCallCount++;

      const toolInput = block.input ?? {};
      opts.onToolCall?.({ name: block.name, input: toolInput });

      const tool = toolMap.get(block.name);
      if (!tool) {
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: Unknown tool "${block.name}"`,
        });
        continue;
      }

      const repeatKey = getToolCallKey(block.name, toolInput);
      const repeatCount = (repeatedToolCalls.get(repeatKey) ?? 0) + 1;
      repeatedToolCalls.set(repeatKey, repeatCount);
      if (repeatCount >= MAX_IDENTICAL_TOOL_CALLS) {
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content:
            `Error: Repeated tool call detected for "${block.name}". ` +
            'Choose a different action or explain why the previous result was insufficient.',
        });
        continue;
      }

      const validationError = validateToolInput(toolInput, tool.inputSchema);
      if (validationError) {
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error: Invalid input for tool "${block.name}": ${validationError}`,
        });
        continue;
      }

      const execCtx: ToolExecutionContext = {
        projectPath: ctx.task.context.projectPath,
        taskId: ctx.task.id,
        traceId: ctx.traceId,
        permissions: ctx.config.permissions,
      };

      callsSinceLastWrite++;
      const stallThreshold = totalWrites === 0 ? MAX_CALLS_WITHOUT_WRITE_PRE : MAX_CALLS_WITHOUT_WRITE_POST;
      if (callsSinceLastWrite >= stallThreshold) {
        const hint = totalWrites === 0
          ? 'The agent gathered context but never wrote a file. Re-run; it may need clearer relevantFiles.'
          : 'The agent wrote files but then stalled in a read loop. Re-run; it likely needs to patch rather than re-read.';
        return {
          success: false,
          summary: `Agent stalled — ${callsSinceLastWrite} consecutive tool calls with no file writes (threshold: ${stallThreshold}, writes so far: ${totalWrites}). Last tool: "${block.name}". ${hint}`,
          filesModified,
          toolCallCount,
          tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
        };
      }

      try {
        const output = await tool.execute(toolInput, execCtx);

        // Track modified files
        const outputStr = JSON.stringify(output);
        const isTypecheck = block.name === 'npm__runScript' &&
          typeof (block.input as Record<string, unknown>)['script'] === 'string' &&
          ((block.input as Record<string, unknown>)['script'] as string).includes('typecheck');
        if (isTypecheck) {
          typechecksSinceLastWrite++;
          if (typechecksSinceLastWrite >= 3) {
            return {
              success: false,
              summary: `Typecheck loop detected — typecheck ran ${typechecksSinceLastWrite} times without a successful write in between. The agent is cycling on type errors without converging. Run \`tsc --noEmit\` manually and fix the remaining errors.`,
              filesModified,
              toolCallCount,
              tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
            };
          }
        }

        const isWrite = block.name.includes('write') || block.name.includes('patch') || block.name.includes('create');
        if (isWrite) {
          callsSinceLastWrite = 0;
          typechecksSinceLastWrite = 0;
          totalWrites++;
          const pathMatch = outputStr.match(/"path"\s*:\s*"([^"]+)"/);
          if (pathMatch?.[1]) filesModified.push(pathMatch[1]);
        }

        const fullContent = typeof output === 'string' ? output : JSON.stringify(output);
        toolResultContents.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: fullContent,
        });
        historyToolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: compressReadFileResult(block.name, fullContent),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorContent = `Error: ${errMsg}`;
        toolResultContents.push({ type: 'tool_result', tool_use_id: block.id, content: errorContent });
        historyToolResults.push({ type: 'tool_result', tool_use_id: block.id, content: errorContent });
      }
    }

    if (toolResultContents.length === 0) {
      return {
        success: false,
        summary: 'Assistant requested tool use but did not provide any executable tool calls.',
        filesModified,
        toolCallCount,
        tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
      };
    }

    history.push({ role: 'user', content: historyToolResults });
  }

  return {
    success: false,
    summary: `Agent loop hit max iterations (${opts.maxIterations})`,
    filesModified,
    toolCallCount,
    tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
  };
}


function extractTextContent(message: ClaudeMessage): string {
  if (typeof message.content === 'string') return message.content;
  const blocks = message.content as ClaudeContentBlock[];
  return blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n');
}

function extractToolUseBlocks(message: ClaudeMessage): ClaudeContentBlock[] {
  if (typeof message.content === 'string') return [];
  const blocks = message.content as ClaudeContentBlock[];
  return blocks.filter((b) => b.type === 'tool_use');
}

/**
 * Sliding-window history for the API call.
 *
 * Keeps history[0] (the task prompt) plus the most recent KEEP_EXCHANGES
 * assistant↔tool_result pairs.  The full `history` array is never mutated,
 * so file-tracking and iteration logic are unaffected.
 *
 * History shape (indices):
 *   0   user  – task prompt
 *   1   asst  – response (may contain tool_use)
 *   2   user  – tool_results
 *   3   asst  – ...
 *   ...
 *
 * Assistant messages sit at odd indices; user tool-result messages at even.
 * The window must start at an odd index so that [history[0], ...window]
 * maintains the required user→assistant alternation.
 */
const KEEP_EXCHANGES = 10; // keep last 10 full rounds (~20 messages)

function windowHistory(history: ClaudeMessage[]): ClaudeMessage[] {
  const keepLast = KEEP_EXCHANGES * 2;
  if (history.length <= 1 + keepLast) return history;

  // Start at an odd index (assistant message) so alternation is preserved.
  let windowStart = history.length - keepLast;
  if (windowStart % 2 === 0) windowStart++;

  return [history[0]!, ...history.slice(windowStart)];
}

function getToolCallKey(name: string, input: Record<string, unknown>): string {
  return `${name}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function validateToolInput(input: Record<string, unknown>, schema: JsonSchema): string | undefined {
  if (schema.type !== 'object') {
    return undefined;
  }

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return 'expected an object';
  }

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required)
    ? schema.required.filter((item): item is string => typeof item === 'string')
    : [];

  for (const key of required) {
    if (!(key in input)) {
      return `missing required field "${key}"`;
    }
  }

  for (const [key, value] of Object.entries(input)) {
    const propSchema = properties[key];
    if (!isRecord(propSchema)) {
      continue;
    }

    const issue = validateSchemaValue(value, propSchema, key);
    if (issue) {
      return issue;
    }
  }

  return undefined;
}

function validateSchemaValue(value: unknown, schema: Record<string, unknown>, path: string): string | undefined {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
  if (enumValues && !enumValues.some((candidate) => candidate === value)) {
    return `"${path}" must be one of ${enumValues.map((item) => JSON.stringify(item)).join(', ')}`;
  }

  const schemaType = schema.type;
  if (schemaType === 'string' && typeof value !== 'string') {
    return `"${path}" must be a string`;
  }
  if (schemaType === 'number' && typeof value !== 'number') {
    return `"${path}" must be a number`;
  }
  if (schemaType === 'boolean' && typeof value !== 'boolean') {
    return `"${path}" must be a boolean`;
  }
  if (schemaType === 'array') {
    if (!Array.isArray(value)) {
      return `"${path}" must be an array`;
    }

    if (isRecord(schema.items)) {
      for (let index = 0; index < value.length; index++) {
        const itemIssue = validateSchemaValue(value[index], schema.items, `${path}[${index}]`);
        if (itemIssue) return itemIssue;
      }
    }
  }
  if (schemaType === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return `"${path}" must be an object`;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * For readFile results, keep only the first PREVIEW_LINES lines in history.
 * The agent already processed the full content in the current turn; subsequent
 * turns only need to know the file was read, not its entire contents.
 */
const READFILE_HISTORY_PREVIEW = 20;

function compressReadFileResult(toolName: string, content: string): string {
  if (toolName !== 'project__readFile') return content;
  const lines = content.split('\n');
  if (lines.length <= READFILE_HISTORY_PREVIEW * 2) return content;
  return (
    lines.slice(0, READFILE_HISTORY_PREVIEW).join('\n') +
    `\n// ... (${lines.length - READFILE_HISTORY_PREVIEW} more lines omitted from history — use readFile if needed)`
  );
}
