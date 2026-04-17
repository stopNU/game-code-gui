import React from 'react';
import { Box, Text } from 'ink';

interface ProgressBarProps {
  used: number;
  total: number;
  label?: string;
  width?: number;
}

export function ProgressBar({ used, total, label, width = 20 }: ProgressBarProps) {
  const ratio = Math.min(used / total, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pct = Math.round(ratio * 100);
  const usedK = Math.round(used / 1000);
  const totalK = Math.round(total / 1000);

  return (
    <Box>
      {label ? <Text dimColor>{label} </Text> : null}
      <Text color={ratio > 0.8 ? 'red' : ratio > 0.5 ? 'yellow' : 'green'}>{bar}</Text>
      <Text dimColor> {usedK}k/{totalK}k ({pct}%)</Text>
    </Box>
  );
}
