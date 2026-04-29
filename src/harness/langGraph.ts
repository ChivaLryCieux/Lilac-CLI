import OpenAI from 'openai';
import type { HarnessRunOptions } from './types';
import { type ChatMessage, executeToolCalls, getModelTools, resolveMaxSteps, toInitialMessages } from './chatRuntime';
import { dynamicImport } from './dynamicImport';

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

  const tools = getModelTools();

  const maxSteps = resolveMaxSteps(options);
  let turns = 0;

  const graph = new MessageGraphCtor();

  graph.addNode('agent', async (state: ChatMessage[]) => {
    const completion = await client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      messages: state as any,
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
