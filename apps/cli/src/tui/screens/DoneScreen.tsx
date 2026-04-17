import React from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import { Header } from '../components/Header.js';
import type { DoneData } from '../types.js';

interface DoneScreenProps {
  data: DoneData;
  agentWasRunning?: boolean;
  onStartGame?: () => void;
}

export function DoneScreen({ data, onStartGame }: DoneScreenProps) {
  const canStart = data.success && data.outputPath !== undefined && onStartGame !== undefined;

  useInput((_, key) => {
    if (!canStart && (key.return || key.escape)) process.exit(0);
  });

  const actions = [
    ...(canStart ? [{ label: '▶  Start game', value: 'start' }] : []),
    { label: 'Exit', value: 'exit' },
  ];

  return (
    <Box flexDirection="column">
      <Header
        title={data.success ? ' Done' : ' Failed'}
        hint={canStart ? '↑↓ navigate · Enter confirm' : 'Enter or Esc to exit'}
      />

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={data.success ? 'green' : 'red'}
        paddingX={2}
        paddingY={1}
        marginX={1}
      >
        {data.gameTitle ? (
          <Text bold color="cyan">{data.gameTitle}</Text>
        ) : null}

        <Text color={data.success ? 'green' : 'red'} bold>
          {data.success ? '✓ Success' : '✗ Failed'}
        </Text>

        <Box marginTop={1}>
          <Text>{data.summary}</Text>
        </Box>

        {data.outputPath ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Project:</Text>
            <Text color="cyan">  {data.outputPath}</Text>
            <Box marginTop={1}><Text dimColor>To run:</Text></Box>
            <Text>  godot --path {data.outputPath}</Text>
          </Box>
        ) : null}

        {data.filesModified.length > 0 ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Files modified:</Text>
            {data.filesModified.slice(0, 12).map((f) => (
              <Text key={f} color="cyan">  {f}</Text>
            ))}
            {data.filesModified.length > 12 ? (
              <Text dimColor>  …and {data.filesModified.length - 12} more</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>

      <Box marginTop={1} marginX={2}>
        <SelectInput
          items={actions}
          onSelect={(item) => {
            if (item.value === 'start') {
              onStartGame!();
            } else {
              process.exit(0);
            }
          }}
        />
      </Box>
    </Box>
  );
}
