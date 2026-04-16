import OpenAI from 'openai';
import { harnessTools } from './tools';
import type { HarnessRunOptions } from './types';

type DynamicImportFn = <T = unknown>(moduleName: string) => Promise<T>;

const dynamicImport: DynamicImportFn = async <T = unknown>(moduleName: string) => {
  const importer = new Function('m', 'return import(m)') as (m: string) => Promise<T>;
  return importer(moduleName);
};

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

function toInitialMessages(options: HarnessRunOptions): ChatMessage[] {
  return [
    {
      role: 'system',
      content: options.skill?.systemPrompt || 'You are a helpful assistant.',
    },
    ...options.messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

async function executeToolCalls(message: ChatMessage): Promise<ChatMessage[]> {
  const toolCalls = message.tool_calls ?? [];
  const toolMessages: ChatMessage[] = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name;
    const tool = harnessTools.find(item => item.name === toolName);

    if (!tool) {
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: `Tool not found: ${toolName}`,
      });
      continue;
    }

    const rawArgs = toolCall.function?.arguments ?? '{}';
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(rawArgs);
    } catch {
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: `Invalid JSON arguments for tool "${toolName}".`,
      });
      continue;
    }

    try {
      const result = await tool.execute(args);
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: `Tool execution failed: ${message}`,
      });
    }
  }

  return toolMessages;
}

export async function runWithLangGraph(
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const moduleName = '@langchain/langgraph';
  const lg = await dynamicImport<Record<string, unknown>>(moduleName).catch(() => null);
  if (!lg) {
    throw new Error(`Package "${moduleName}" is not installed.`);
  }

  const MessageGraphCtor = lg.MessageGraph as (new () => any) | undefined;
  const END = (lg.END as string | undefined) ?? '__end__';

  if (!MessageGraphCtor) {
    throw new Error('LangGraph MessageGraph API is unavailable in current package version.');
  }

  const tools = harnessTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const maxSteps = options.maxSteps ?? 4;
  let turns = 0;

  const graph = new MessageGraphCtor();

  graph.addNode('agent', async (state: ChatMessage[]) => {
    const completion = await client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      messages: state,
      tools,
      tool_choice: 'auto',
    });

    const assistant = completion.choices[0]?.message;
    if (!assistant) {
      return [{ role: 'assistant', content: '模型未返回有效响应。' }];
    }

    return [assistant as ChatMessage];
  });

  graph.addNode('tools', async (state: ChatMessage[]) => {
    const lastMessage = state[state.length - 1];
    if (!lastMessage) return [];
    return executeToolCalls(lastMessage);
  });

  graph.addConditionalEdges('agent', (state: ChatMessage[]) => {
    turns += 1;
    if (turns >= maxSteps) return END;
    const lastMessage = state[state.length - 1];
    const hasToolCall = Boolean(lastMessage?.tool_calls?.length);
    return hasToolCall ? 'tools' : END;
  });

  graph.addEdge('tools', 'agent');
  graph.setEntryPoint('agent');

  const app = graph.compile();
  const resultState = (await app.invoke(toInitialMessages(options))) as ChatMessage[];
  const lastAssistant = [...resultState].reverse().find(message => message.role === 'assistant');
  const text = lastAssistant?.content?.toString() || 'LangGraph 未返回可解析文本。';
  onChunk(text);
}

