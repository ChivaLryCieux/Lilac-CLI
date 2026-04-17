import { harnessTools } from './tools';
import type { HarnessRunOptions } from './types';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: string;
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
};

const toolMap = new Map(harnessTools.map(tool => [tool.name, tool] as const));

export function getModelTools() {
  return harnessTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function toInitialMessages(options: HarnessRunOptions): ChatMessage[] {
  return [
    {
      role: 'system',
      content: options.skill?.systemPrompt?.trim() || 'You are a helpful assistant.',
    },
    ...options.messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];
}

export async function executeToolCalls(message: ChatMessage): Promise<ChatMessage[]> {
  const toolCalls = message.tool_calls ?? [];
  const toolMessages: ChatMessage[] = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name;
    const tool = toolName ? toolMap.get(toolName) : undefined;

    if (!tool) {
      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: `Tool not found: ${toolName ?? '(missing name)'}`,
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
        content: `Invalid JSON arguments for tool "${tool.name}".`,
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
