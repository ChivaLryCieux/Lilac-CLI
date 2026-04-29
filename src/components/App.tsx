import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, useWindowSize } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import { Header } from './Header';
import { MessageItem } from './MessageItem';
import { loadDefaultSkill, loadSkills } from '../core/skills';
import { createChatStream } from '../core/api';
import { config, hasApiKey } from '../core/config';
import { defaultSettings, loadSettings } from '../core/settings';
import { loadLatestSession, saveSession } from '../core/session';
import { executeSlashCommand, isSlashCommand } from '../commands';
import { estimateTokens } from '../utils/tokens';
import type { AppState, Message } from '../types';

function estimateWrappedLines(text: string, width: number): number {
  const lines = text.split('\n');
  return lines.reduce((total, line) => total + Math.max(1, Math.ceil(line.length / width)), 0);
}

function estimateMessageRows(message: Message, width: number): number {
  return estimateWrappedLines(message.content || ' ', width) + 3;
}

function truncateMessageToRows(message: Message, width: number, rows: number): Message {
  const availableContentRows = Math.max(1, rows - 4);
  const maxChars = Math.max(width, availableContentRows * width);
  if (message.content.length <= maxChars) {
    return message;
  }

  return {
    ...message,
    content: `[Earlier output hidden]\n${message.content.slice(-maxChars)}`,
  };
}

function getVisibleMessages(messages: Message[], columns: number, rows: number): Message[] {
  const contentWidth = Math.max(24, columns - 8);
  let remainingRows = Math.max(3, rows);
  const visible: Message[] = [];

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    const messageRows = estimateMessageRows(message, contentWidth);

    if (messageRows <= remainingRows) {
      visible.unshift(message);
      remainingRows -= messageRows;
      continue;
    }

    if (visible.length === 0) {
      visible.unshift(truncateMessageToRows(message, contentWidth, remainingRows));
    }
    break;
  }

  return visible;
}

export const App: React.FC = () => {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [showWelcome, setShowWelcome] = useState(true);
  const [state, setState] = useState<AppState>({
    messages: [],
    activeSkill: null,
    isStreaming: false,
    error: null,
    status: 'idle',
    sessionTokens: 0,
    settings: defaultSettings,
    sessionId: crypto.randomUUID(),
  });
  const [input, setInput] = useState('');
  const terminalRows = Math.max(12, rows);
  const messageRows = Math.max(3, terminalRows - (state.error ? 12 : 9));
  const visibleMessages = useMemo(
    () => getVisibleMessages(state.messages, columns, messageRows),
    [columns, messageRows, state.messages]
  );

  const createMessage = (role: Message['role'], content: string): Message => ({
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  });

  useEffect(() => {
    Promise.all([loadSettings(), loadLatestSession(), loadSkills()]).then(async ([settings, session, skills]) => {
      const activeSkill =
        (settings.activeSkillName && skills.find(skill => skill.name === settings.activeSkillName)) ||
        (await loadDefaultSkill());

      setState(s => ({
        ...s,
        activeSkill,
        settings,
        messages: session.messages ?? [],
        sessionId: session.id,
        sessionTokens: session.sessionTokens ?? 0,
      }));
    });
    
    // 4秒后自动隐藏欢迎界面
    const timer = setTimeout(() => setShowWelcome(false), 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    saveSession({
      id: state.sessionId,
      messages: state.messages,
      activeSkillId: state.activeSkill?.name,
      createdAt: Date.now(),
      sessionTokens: state.sessionTokens,
    }).catch(error => {
      setState(s => ({ ...s, error: error instanceof Error ? error.message : String(error), status: 'error' }));
    });
  }, [state.activeSkill?.name, state.messages, state.sessionId, state.sessionTokens]);

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) exit();
    if (showWelcome) setShowWelcome(false);
  });

  const handleSubmit = async (query: string) => {
    if (showWelcome) setShowWelcome(false);
    if (!query.trim() || state.isStreaming) return;

    if (isSlashCommand(query)) {
      setInput('');
      setState(s => ({ ...s, status: 'command', error: null }));
      try {
        const result = await executeSlashCommand(query, {
          messages: state.messages,
          activeSkill: state.activeSkill,
          settings: state.settings,
          sessionTokens: state.sessionTokens,
        });

        if (result.exit) {
          exit();
          return;
        }

        setState(s => ({
          ...s,
          messages: [...(result.clearMessages ? [] : s.messages), ...(result.messages ?? [])],
          activeSkill: result.nextSkill === undefined ? s.activeSkill : result.nextSkill,
          settings: result.nextSettings ?? s.settings,
          sessionTokens: result.nextSessionTokens ?? s.sessionTokens,
          status: 'idle',
        }));
      } catch (err: any) {
        setState(s => ({ ...s, error: err.message, status: 'error' }));
      }
      return;
    }

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
      await createChatStream(nextMessages, state.activeSkill, state.settings.defaultModel ?? config.LILAC_DEFAULT_MODEL, (chunk) => {
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
    <Box flexDirection="column" padding={1} height={terminalRows} minHeight={10} overflow="hidden">
      <Header 
        skillName={state.activeSkill?.name} 
        model={state.settings.defaultModel ?? config.LILAC_DEFAULT_MODEL ?? state.activeSkill?.model} 
        status={hasApiKey ? state.status : 'Config Required'} 
        tokens={state.sessionTokens}
        permissionMode={state.settings.permissionMode}
      />

      <Box flexDirection="column" height={messageRows} overflow="hidden" marginBottom={1}>
        {state.messages.length === 0 && (
          <Box padding={2} flexDirection="column">
            <Text color="gray">No messages yet. Start a conversation or run /help.</Text>
            <Text color="gray">Claude-Code-like commands are available: /status, /skills, /model, /permissions.</Text>
          </Box>
        )}
        {visibleMessages.map(msg => (
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
