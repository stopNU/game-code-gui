import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { MODELS } from '@agent-harness/core';

interface ModelPickerProps {
  onSelect: (modelId: string) => void;
}

export function ModelPicker({ onSelect }: ModelPickerProps) {
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.upArrow || key.tab) {
      setIndex((i) => (i + MODELS.length - 1) % MODELS.length);
    } else if (key.downArrow) {
      setIndex((i) => (i + 1) % MODELS.length);
    } else if (key.return) {
      onSelect(MODELS[index]!.id);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
      <Text bold color="cyan">Select model:</Text>
      <Box flexDirection="column" marginTop={1}>
        {MODELS.map((m, i) => {
          const active = i === index;
          return (
            <Box key={m.id} marginTop={i === 0 ? 0 : 1}>
              <Text {...(active ? { color: 'green' as const } : {})} bold={active}>
                {active ? '❯ ' : '  '}
              </Text>
              <Box flexDirection="column">
                <Box>
                  <Text bold={active} color={active ? 'green' : 'white'}>{m.label}</Text>
                  <Text dimColor>  {m.costHint}</Text>
                </Box>
                <Text dimColor>{m.description}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={2}>
        <Text dimColor>↑/↓ navigate · Enter confirm</Text>
      </Box>
    </Box>
  );
}
