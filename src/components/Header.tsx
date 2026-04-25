import React from 'react';
import { Box, Text } from 'ink';
import { formatTokenCount } from '../utils/tokens';

interface HeaderProps {
  skillName?: string;
  model?: string;
  status: string;
  tokens: number;
  permissionMode: string;
}

export const Header: React.FC<HeaderProps> = ({ skillName, model, status, tokens, permissionMode }) => (
  <Box borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1} flexDirection="column">
    <Box justifyContent="space-between">
      <Text bold color="magenta">Lilac Agent v1.0</Text>
      <Box>
        <Text color="gray">Cost: </Text>
        <Text bold color={tokens > 5000 ? 'yellow' : 'cyan'}>
          {formatTokenCount(tokens)}
        </Text>
      </Box>
    </Box>
    <Box justifyContent="space-between">
      <Box>
        <Text>Active Skill: </Text>
        <Text color="cyan">{skillName || 'None'}</Text>
        <Box marginLeft={2}>
          <Text color="yellow">[{status}]</Text>
        </Box>
      </Box>
      <Text color="gray">{model || 'default'}</Text>
    </Box>
    <Box>
      <Text color="gray">Mode: </Text>
      <Text color={permissionMode === 'auto' ? 'green' : permissionMode === 'deny' ? 'red' : 'yellow'}>
        {permissionMode}
      </Text>
      <Text color="gray"> · Commands: /help</Text>
    </Box>
  </Box>
);
