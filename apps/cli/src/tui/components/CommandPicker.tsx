import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

const COMMANDS = [
  {
    value: 'new-game' as const,
    label: 'New Game',
    description: 'Generate a new Godot deckbuilder from a text brief',
  },
  {
    value: 'plan-game' as const,
    label: 'Plan Game',
    description: 'Create an implementation plan to review before building',
  },
  {
    value: 'implement-task' as const,
    label: 'Implement Task',
    description: 'Run the agent loop on a task in an existing project',
  },
  {
    value: 'iterate' as const,
    label: 'Iterate',
    description: 'Fix bugs or add features to an existing game',
  },
  {
    value: 'start-game' as const,
    label: 'Start Game',
    description: 'Open an existing Godot project in the editor',
  },
];

interface CommandPickerProps {
  onSelect: (command: 'new-game' | 'plan-game' | 'implement-task' | 'iterate' | 'start-game') => void;
}

export function CommandPicker({ onSelect }: CommandPickerProps) {
  const [index, setIndex] = useState(0);

  useInput((_, key) => {
    if (key.upArrow || key.tab) {
      setIndex((i) => (i + COMMANDS.length - 1) % COMMANDS.length);
    } else if (key.downArrow) {
      setIndex((i) => (i + 1) % COMMANDS.length);
    } else if (key.return) {
      onSelect(COMMANDS[index]!.value);
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} justifyContent="center" paddingX={4}>
      <Text bold color="cyan">What would you like to do?</Text>
      <Box flexDirection="column" marginTop={1}>
        {COMMANDS.map((cmd, i) => {
          const active = i === index;
          return (
            <Box key={cmd.value} marginTop={i === 0 ? 0 : 1}>
              <Text {...(active ? { color: 'green' as const } : {})} bold={active}>
                {active ? '❯ ' : '  '}
              </Text>
              <Box flexDirection="column">
                <Text bold={active} color={active ? 'green' : 'white'}>{cmd.label}</Text>
                <Text dimColor>{cmd.description}</Text>
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
