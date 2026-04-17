import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { glob } from 'glob';
import { dirname, basename } from 'path';
import { Header } from '../components/Header.js';
import { Spinner } from '../components/Spinner.js';

interface StartGameScreenProps {
  onStartGame: (projectPath: string) => void;
}

export function StartGameScreen({ onStartGame }: StartGameScreenProps) {
  const [projects, setProjects] = useState<string[] | null>(null);

  useEffect(() => {
    glob('**/project.godot', {
      cwd: process.cwd(),
      ignore: ['node_modules/**', '.godot/**', 'templates/**'],
      absolute: true,
      maxDepth: 5,
    })
      .then((matches: string[]) => setProjects(matches.map((m: string) => dirname(m))))
      .catch(() => setProjects([]));
  }, []);

  if (projects === null) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness" subtitle="Start Game" hint="Scanning..." />
        <Spinner label="Scanning for Godot projects..." />
      </Box>
    );
  }

  if (projects.length === 0) {
    return (
      <Box flexDirection="column" height="100%">
        <Header title=" game-harness" subtitle="Start Game" hint="Esc to go back" />
        <Box marginX={4} marginTop={2} flexDirection="column">
          <Text color="yellow">No Godot projects found in the current directory tree.</Text>
          <Box marginTop={1}>
            <Text dimColor>Generate one first with </Text>
            <Text color="cyan">New Game</Text>
            <Text dimColor>.</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  const items = projects.map((p) => ({
    label: `${basename(p)}  ${p}`,
    value: p,
  }));

  return (
    <Box flexDirection="column" height="100%">
      <Header title=" game-harness" subtitle="Start Game" hint="↑↓ navigate · Enter launch" />
      <Box marginX={4} marginTop={1} flexDirection="column">
        <Text bold color="cyan">Select a project to open in Godot:</Text>
        <Box marginTop={1}>
          <SelectInput
            items={items}
            onSelect={(item) => onStartGame(item.value)}
          />
        </Box>
      </Box>
    </Box>
  );
}
