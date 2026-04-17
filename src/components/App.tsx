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
import { estimateTokens } from '../utils/tokens';
import type { AppState, Message } from '../types';

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

  const createMessage = (role: Message['role'], content: string): Message => ({
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  });

  useEffect(() => {
    loadDefaultSkill().then(skill => {
      setState(s => ({ ...s, activeSkill: skill }));
    });
    
    // 4秒后自动隐藏欢迎界面
    const timer = setTimeout(() => setShowWelcome(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) exit();
    if (showWelcome) setShowWelcome(false);
  });

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

    const userMsg = createMessage('user', query);
    const assistantMsg = createMessage('assistant', '');

    const nextMessages = [...state.messages, userMsg];

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
      await createChatStream(nextMessages, state.activeSkill, (chunk) => {
        const chunkTokens = estimateTokens(chunk);
        setState(s => {
          const last = s.messages[s.messages.length - 1];
          if (!last || last.role !== 'assistant') {
            return s;
          }
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
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" padding={2}>
        <Gradient colors={['#818cf8', '#c084fc', '#e879f9']}>
          <BigText text="LILAC" font="block" />
        </Gradient>
        <Box marginTop={-1} marginBottom={1}>
          <Text color="gray">Author: </Text>
          <Text bold color="cyan">Tempsyche</Text>
        </Box>
        <Box borderStyle="round" borderColor="gray" paddingX={2}>
          <Text italic color="magenta">Designing a Skill-Driven CLI Agent</Text>
        </Box>
        <Box marginTop={2}>
          <Text color="gray">Press any key to start...</Text>
        </Box>
        {!hasApiKey && (
          <Box marginTop={1}>
            <Text color="yellow">⚠️ 提示: 尚未配置 API Key, 仅支持 UI 预览模式。</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} minHeight={10}>
      <Header 
        skillName={state.activeSkill?.name} 
        model={state.activeSkill?.model} 
        status={hasApiKey ? state.status : 'Config Required'} 
        tokens={state.sessionTokens}
      />

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
      
      <Box marginTop={1}>
        <Text color="gray">Press ESC or Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
};
