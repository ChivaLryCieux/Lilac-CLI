import OpenAI from 'openai';
import { harnessTools } from './tools';
import type { HarnessRunOptions } from './types';

const defaultMaxSteps = 4;

const harnessInstruction = `
You are running inside Lilac Harness mode.

Rules:
1. You can call tools when useful, but keep calls minimal.
2. If a tool returns enough context, provide a direct answer.
3. Be explicit when a result comes from tool output.
4. Keep final answer concise and practical.
`.trim();

export async function runHarness(
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const maxSteps = options.maxSteps ?? defaultMaxSteps;
  const modelMessages: any[] = [
    {
      role: 'system',
      content: [options.skill?.systemPrompt, harnessInstruction].filter(Boolean).join('\n\n'),
    },
    ...options.messages.map(message => ({
      role: message.role,
      content: message.content,
    })),
  ];

  const tools = harnessTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  for (let step = 0; step < maxSteps; step++) {
    const completion = await client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      messages: modelMessages,
      tools,
      tool_choice: 'auto',
    });

    const choice = completion.choices[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) {
      onChunk('模型未返回有效响应。');
      return;
    }

    modelMessages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls ?? [];
    if (!toolCalls.length) {
      onChunk(assistantMessage.content ?? '');
      return;
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;
      const tool = harnessTools.find(item => item.name === toolName);

      if (!tool) {
        modelMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Tool not found: ${toolName}`,
        });
        continue;
      }

      let args: Record<string, unknown> = {};
      const rawArgs = toolCall.function?.arguments ?? '{}';

      try {
        args = JSON.parse(rawArgs);
      } catch {
        modelMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Invalid JSON arguments for tool "${toolName}".`,
        });
        continue;
      }

      try {
        const result = await tool.execute(args);
        modelMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown tool error';
        modelMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: `Tool execution failed: ${message}`,
        });
      }
    }
  }

  onChunk('Harness 达到最大推理步数，请尝试拆分问题或提供更多上下文。');
}

export const runBuiltinHarness = runHarness;
