import React from 'react';
import { Box, Text } from 'ink';
import { ChatMessage } from './ChatMessage.js';
import { Spinner } from './Spinner.js';
import type { ChatEntry } from '../types.js';

const MAX_VISIBLE = 12;

interface ChatLogProps {
  entries: ChatEntry[];
  isRunning: boolean;
  spinnerLabel?: string | undefined;
  streamingText?: string | undefined;
}

export function ChatLog({ entries, isRunning, spinnerLabel, streamingText }: ChatLogProps) {
  // Show a sliding window of the most recent entries — no <Static>, no permanent
  // stdout writes. This avoids the height-mismatch flicker that occurs when Static
  // interacts with a dynamic layout (Header, side panel, etc.).
  const visible = entries.slice(-MAX_VISIBLE);

  return (
    <Box flexDirection="column">
      {visible.map((entry) => (
        <Box key={entry.timestamp}>
          <ChatMessage entry={entry} />
        </Box>
      ))}
      {isRunning && streamingText ? (
        <Box marginY={0}>
          <Text color="cyan" bold> Agent  </Text>
          <Text color="gray">{streamingText.slice(-500)}</Text>
        </Box>
      ) : null}
      {isRunning ? (
        <Box marginTop={1}>
          <Spinner label={spinnerLabel ?? 'Agent is thinking...'} />
        </Box>
      ) : null}
    </Box>
  );
}
