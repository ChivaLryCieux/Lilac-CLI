import { harnessTools } from './tools';
import type { HarnessRunOptions } from './types';

export const defaultMaxSteps = 4;

const harnessInstruction = `
You are running inside Lilac Harness mode.

Rules:
1. You can call tools when useful, but keep calls minimal.
2. If a tool returns enough context, provide a direct answer.
3. Be explicit when a result comes from tool output.
4. Keep final answer concise and practical.
5. File writes and shell commands are guarded by Lilac permission mode; if blocked, tell the user which /permissions mode is required.
`.trim();

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

export function resolveMaxSteps(options: HarnessRunOptions): number {
  return options.maxSteps ?? defaultMaxSteps;
}

export function getSystemPrompt(options: HarnessRunOptions): string {
  const basePrompt = options.skill?.systemPrompt?.trim() || 'You are a helpful assistant.';
  return [basePrompt, harnessInstruction].filter(Boolean).join('\n\n');
}

export function toInitialMessages(options: HarnessRunOptions): ChatMessage[] {
  return [
    {
      role: 'system',
      content: getSystemPrompt(options),
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
