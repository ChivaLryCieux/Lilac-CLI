import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import { Header } from './Header';
import { MessageItem } from './MessageItem';
import { loadDefaultSkill } from '../core/skills';
import { createChatStream } from '../core/api';
import { hasApiKey } from '../core/config';
import type { AppState, Message } from '../types';

import { estimateTokens } from '../utils/tokens';

export const App: React.FC = () => {
  const { exit } = useApp();
  const [showWelcome, setShowWelcome] = useState(true);
  const [state, setState] = useState<AppState>({
    messages: [],
    activeSkill: null,
    isStreaming: false,
    error: null,
    status: 'idle',
    sessionTokens: 0,
  });
  const [input, setInput] = useState('');

  // ... (中间代码省略，仅展示 handleSubmit 中的修改点)

  const handleSubmit = async (query: string) => {
    if (showWelcome) setShowWelcome(false);
    if (!query.trim() || state.isStreaming) return;

    if (!hasApiKey) {
      setState(s => ({ ...s, error: 'API Key 未配置！请在 .env 文件中填入 LILAC_API_KEY 并在重启后尝试。', status: 'error' }));
      setInput('');
      return;
    }

    // 计算输入 Token
    const inputTokens = estimateTokens(query);

    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: query,
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg, assistantMsg],
      isStreaming: true,
      status: 'thinking',
      error: null,
      sessionTokens: s.sessionTokens + inputTokens
    }));
    setInput('');

    try {
      await createChatStream([...state.messages, userMsg], state.activeSkill, (chunk) => {
        // 实时计算每个 chunk 的 Token 并累加
        const chunkTokens = estimateTokens(chunk);
        setState(s => {
          const last = s.messages[s.messages.length - 1];
          const updated = { ...last, content: last.content + chunk };
          return { 
            ...s, 
            messages: [...s.messages.slice(0, -1), updated], 
            status: 'idle',
            sessionTokens: s.sessionTokens + chunkTokens
          };
        });
      });
    } catch (err: any) {
      setState(s => ({ ...s, error: err.message, status: 'error' }));
    } finally {
      setState(s => ({ ...s, isStreaming: false }));
    }
  };

  if (showWelcome) {
    // ...
  }

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      <Header 
        skillName={state.activeSkill?.name} 
        model={state.activeSkill?.model} 
        status={hasApiKey ? state.status : 'Config Required'} 
        tokens={state.sessionTokens}
      />
      {/* ... */}

      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        {state.messages.length === 0 && (
          <Box padding={2} justifyContent="center">
            <Text color="gray">No messages yet. Start a conversation!</Text>
          </Box>
        )}
        {state.messages.map(msg => (
          <MessageItem key={msg.id} message={msg} />
        ))}
      </Box>

      {state.error && (
        <Box borderStyle="single" borderColor="red" paddingX={1} marginBottom={1}>
          <Text color="red">⚠️ {state.error}</Text>
        </Box>
      )}

      <Box borderStyle="single" borderColor={hasApiKey ? "blue" : "gray"} paddingX={1}>
        <Box marginRight={1}>
          <Text color={hasApiKey ? "blue" : "gray"}>❯</Text>
        </Box>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder={hasApiKey ? "Type your message..." : "Please configure API Key in .env first..."}
        />
        {state.isStreaming && (
          <Box marginLeft={1}>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
