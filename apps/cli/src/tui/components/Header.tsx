import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  title: string;
  subtitle?: string | undefined;
  hint?: string | undefined;
}

export function Header({ title, subtitle, hint }: HeaderProps) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={0}>
        <Text bold color="cyan">
          {title}
        </Text>
        {subtitle ? <Text color="gray">  {subtitle}</Text> : null}
        <Box flexGrow={1} />
        {hint ? <Text dimColor>{hint}</Text> : null}
      </Box>
    </Box>
  );
}
