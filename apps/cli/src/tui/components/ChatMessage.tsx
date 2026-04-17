import React from 'react';
import { Box, Text } from 'ink';
import type { ChatEntry } from '../types.js';

interface ChatMessageProps {
  entry: ChatEntry;
}

function truncate(s: string, max = 120): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function formatInput(input: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(input);
    return truncate(s, 100);
  } catch {
    return '';
  }
}

export function ChatMessage({ entry }: ChatMessageProps) {
  if (entry.kind === 'system') {
    return (
      <Box marginY={0}>
        <Text dimColor>─ {entry.text}</Text>
      </Box>
    );
  }

  if (entry.kind === 'thinking') {
    return (
      <Box flexDirection="column" marginY={0}>
        <Box>
          <Text color="cyan" bold> Agent  </Text>
          <Text>{entry.text}</Text>
        </Box>
      </Box>
    );
  }

  if (entry.kind === 'tool-call') {
    const inputStr = formatInput(entry.input);
    return (
      <Box marginY={0}>
        <Text color="yellow">  ▶ </Text>
        <Text color="yellow" bold>{entry.toolName}</Text>
        {inputStr ? <Text dimColor>  {inputStr}</Text> : null}
      </Box>
    );
  }

  if (entry.kind === 'tool-result') {
    return (
      <Box marginY={0}>
        <Text color={entry.success ? 'green' : 'red'}>  {entry.success ? '◀' : '✗'} </Text>
        <Text color={entry.success ? 'green' : 'red'} bold>{entry.toolName}</Text>
        {entry.preview ? <Text dimColor>  {truncate(entry.preview, 80)}</Text> : null}
      </Box>
    );
  }

  if (entry.kind === 'error') {
    return (
      <Box marginY={0} borderStyle="round" borderColor="red" paddingX={1}>
        <Text color="red" bold>✗ Error: </Text>
        <Text color="red">{truncate(entry.text, 200)}</Text>
      </Box>
    );
  }

  if (entry.kind === 'done') {
    const borderColor = entry.success ? 'green' as const : 'red' as const;
    const labelColor = entry.success ? 'green' as const : 'red' as const;
    return (
      <Box flexDirection="column" marginY={1} borderStyle="round" borderColor={borderColor} paddingX={2} paddingY={1}>
        <Text color={labelColor} bold>{entry.success ? '✓ Done' : '✗ Failed'}</Text>
        <Text>{truncate(entry.summary, 300)}</Text>
        {entry.filesModified.length > 0 ? (
          <Box flexDirection="column" marginTop={1}>
            <Text dimColor>Files modified:</Text>
            {entry.filesModified.slice(0, 10).map((f) => (
              <Text key={f} color="cyan">  {f}</Text>
            ))}
            {entry.filesModified.length > 10 ? (
              <Text dimColor>  …and {entry.filesModified.length - 10} more</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    );
  }

  return null;
}
