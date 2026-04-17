import { useState, useCallback, useRef } from 'react';
import type { TaskState, TaskPlan, TaskResult, ClaudeMessage, ClaudeContentBlock } from '@agent-harness/core';
import { runTask } from '../../commands/implement-task.js';
import type { ChatEntry } from '../types.js';

export type AgentStreamStatus = 'idle' | 'running' | 'done' | 'error';

export interface UseAgentStreamResult {
  entries: ChatEntry[];
  status: AgentStreamStatus;
  result: TaskResult | null;
  tokensUsed: number;
  streamingText: string;
  start: () => Promise<void>;
  reset: () => void;
  abort: () => void;
}

function extractTextFromMessage(message: ClaudeMessage): string | null {
  if (typeof message.content === 'string') {
    return message.content.trim() || null;
  }
  const blocks = message.content as ClaudeContentBlock[];
  const textBlocks = blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!.trim())
    .filter(Boolean);
  return textBlocks.length > 0 ? textBlocks.join('\n') : null;
}

export function useAgentStream(
  projectPath: string,
  task: TaskState,
  plan: TaskPlan,
  mode: 'simple' | 'advanced' = 'advanced',
): UseAgentStreamResult {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [status, setStatus] = useState<AgentStreamStatus>('idle');
  const [result, setResult] = useState<TaskResult | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [streamingText, setStreamingText] = useState('');

  const abortRef = useRef<AbortController | null>(null);

  const append = useCallback((entry: ChatEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setStatus('idle');
    setResult(null);
    setTokensUsed(0);
    setStreamingText('');
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('running');
    setStreamingText('');
    append({ kind: 'system', text: `Starting: ${task.title}`, timestamp: Date.now() });

    try {
      const taskResult = await runTask(
        projectPath,
        task,
        plan,
        undefined, // onProgress
        mode,
        ({ name, input }) => {
          append({ kind: 'tool-call', toolName: name, input, timestamp: Date.now() });
          setStreamingText((prev) => {
            if (prev.trim()) {
              append({ kind: 'thinking', text: prev.trim(), timestamp: Date.now() });
            }
            return '';
          });
        },
        (message) => {
          if (message.role !== 'assistant') return;
          const text = extractTextFromMessage(message);
          if (text) setStreamingText('');
        },
        ({ input, output }) => {
          setTokensUsed(input + output);
        },
        controller.signal,
        (delta) => {
          setStreamingText((prev) => prev + delta);
        },
      );

      setStreamingText('');
      setResult(taskResult);
      setStatus(taskResult.success ? 'done' : 'error');
      append({
        kind: 'done',
        success: taskResult.success,
        summary: taskResult.summary,
        filesModified: taskResult.filesModified,
        timestamp: Date.now(),
      });
    } catch (err) {
      setStreamingText('');
      setStatus('error');
      append({ kind: 'error', text: String(err), timestamp: Date.now() });
    }
  }, [projectPath, task, plan, mode, append]);

  return { entries, status, result, tokensUsed, streamingText, start, reset, abort };
}
