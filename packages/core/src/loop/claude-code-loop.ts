import { spawn } from 'child_process';
import { createInterface } from 'readline';
import type { AgentContext, AgentLoopOptions, ClaudeMessage } from '../types/agent.js';
import type { TaskResult } from '../types/task.js';
import { buildTaskPrompt } from './task-prompt.js';

/** Model ID passed to the claude CLI when using the subscription backend. */
const SUBSCRIPTION_MODEL = 'claude-sonnet-4-6';

/**
 * Run the agent loop via the local Claude Code CLI (`claude --print`).
 *
 * Uses the user's existing Claude Code subscription (OAuth) instead of an
 * Anthropic API key. Claude Code handles tool execution internally; we parse
 * the stream-json output to fire the same callbacks as `runAgentLoop`.
 *
 * Stream-json event shapes (with --verbose --include-partial-messages):
 *   {"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."},...},...}
 *   {"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"..."},...},...}
 *   {"type":"assistant","message":{"content":[...],...},...}
 *   {"type":"result","subtype":"success","result":"...","usage":{...},...}
 */
export async function runClaudeCodeLoop(
  ctx: AgentContext,
  opts: AgentLoopOptions,
): Promise<TaskResult> {
  if (opts.signal?.aborted) {
    return cancelled();
  }

  const claudeBin = process.env['CLAUDE_BIN'] ?? 'claude';
  const prompt = buildTaskPrompt(ctx);

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', SUBSCRIPTION_MODEL,
    '--dangerously-skip-permissions',
    '--add-dir', ctx.task.context.projectPath,
    '--append-system-prompt', ctx.config.systemPrompt,
    '--no-session-persistence',
  ];

  // Unset CLAUDECODE so the child isn't blocked by the nested-session guard
  // (fires when the harness itself runs inside a Claude Code session).
  // Unset ANTHROPIC_API_KEY so the CLI uses subscription OAuth auth instead
  // of charging API credits — which is the whole point of this backend.
  const childEnv = { ...process.env };
  delete childEnv['CLAUDECODE'];
  delete childEnv['ANTHROPIC_API_KEY'];

  let proc: ReturnType<typeof spawn>;
  try {
    proc = spawn(claudeBin, args, {
      cwd: ctx.task.context.projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: childEnv,
    });
  } catch (err) {
    return {
      success: false,
      summary: `Failed to start Claude Code CLI: ${err instanceof Error ? err.message : String(err)}. Make sure 'claude' is in your PATH or set CLAUDE_BIN.`,
      filesModified: [],
      toolCallCount: 0,
      tokensUsed: { input: 0, output: 0, cached: 0 },
    };
  }

  if (opts.signal) {
    opts.signal.addEventListener('abort', () => { proc.kill(); });
  }

  // Collect stderr so we can surface it on failure
  const stderrChunks: Buffer[] = [];
  proc.stderr!.on('data', (chunk: Buffer) => { stderrChunks.push(chunk); });

  // Write the task prompt to stdin
  proc.stdin!.write(prompt);
  proc.stdin!.end();

  const rl = createInterface({ input: proc.stdout! });

  let toolCallCount = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;
  let finalSummary = '';
  let gotResult = false;
  let success = false;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (opts.signal?.aborted) break;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = event['type'] as string | undefined;

    if (type === 'stream_event') {
      // Streaming text deltas and tool_use starts arrive wrapped in stream_event
      const inner = event['event'] as Record<string, unknown> | undefined;
      if (!inner) continue;

      const innerType = inner['type'] as string | undefined;

      if (innerType === 'content_block_delta') {
        const delta = inner['delta'] as Record<string, unknown> | undefined;
        if (isRecord(delta) && delta['type'] === 'text_delta') {
          const text = (delta['text'] as string | undefined) ?? '';
          if (text) opts.onText?.(text);
        }
      } else if (innerType === 'content_block_start') {
        const block = inner['content_block'] as Record<string, unknown> | undefined;
        if (isRecord(block) && block['type'] === 'tool_use') {
          toolCallCount++;
          opts.onToolCall?.({
            name: (block['name'] as string | undefined) ?? 'unknown',
            input: {},
          });
        }
      }
    } else if (type === 'assistant') {
      // Full assistant message — emit for onMessage (text content only)
      const message = event['message'] as Record<string, unknown> | undefined;
      if (!message) continue;
      const content = message['content'];
      if (!Array.isArray(content)) continue;

      const text = content
        .filter(isRecord)
        .filter((b) => b['type'] === 'text')
        .map((b) => (b['text'] as string | undefined) ?? '')
        .join('');

      if (text) {
        opts.onMessage?.({ role: 'assistant', content: text } as ClaudeMessage);
      }
    } else if (type === 'result') {
      gotResult = true;
      const subtype = event['subtype'] as string | undefined;
      const isError = event['is_error'] as boolean | undefined;
      success = subtype === 'success' && !isError;
      finalSummary = (event['result'] as string | undefined) ?? '';

      const usage = event['usage'] as Record<string, unknown> | undefined;
      if (usage) {
        totalInput = (usage['input_tokens'] as number | undefined) ?? 0;
        totalOutput = (usage['output_tokens'] as number | undefined) ?? 0;
        totalCached = (usage['cache_read_input_tokens'] as number | undefined) ?? 0;
        opts.onTokens?.({ input: totalInput, output: totalOutput, cached: totalCached });
      }
    }
  }

  // Wait for process to exit
  const exitCode = await new Promise<number | null>((resolve) => {
    proc.on('close', (code) => resolve(code));
    proc.on('error', () => resolve(null));
  });

  if (opts.signal?.aborted) {
    return cancelled([], toolCallCount, { input: totalInput, output: totalOutput, cached: totalCached });
  }

  if (!gotResult) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const exitInfo = exitCode !== null ? ` (exit code ${exitCode})` : '';
    const detail = stderr ? `\n\nCLI error output:\n${stderr}` : '';
    return {
      success: false,
      summary: `Claude Code CLI exited without producing a result${exitInfo}.${detail}`,
      filesModified: [],
      toolCallCount,
      tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
    };
  }

  const result: TaskResult = {
    success,
    summary: finalSummary || (success ? 'Task completed.' : 'Claude Code returned an error result.'),
    filesModified: [],
    toolCallCount,
    tokensUsed: { input: totalInput, output: totalOutput, cached: totalCached },
  };

  opts.onComplete?.(result);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cancelled(
  filesModified: string[] = [],
  toolCallCount = 0,
  tokensUsed: TaskResult['tokensUsed'] = { input: 0, output: 0, cached: 0 },
): TaskResult {
  return {
    success: false,
    summary: 'Agent loop cancelled by user.',
    filesModified,
    toolCallCount,
    tokensUsed,
  };
}
