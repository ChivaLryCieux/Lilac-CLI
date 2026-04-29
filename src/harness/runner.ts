import OpenAI from 'openai';
import type { HarnessRunOptions } from './types';
import { executeToolCalls, getModelTools, resolveMaxSteps, toInitialMessages } from './chatRuntime';

export async function runHarness(
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const maxSteps = resolveMaxSteps(options);
  const modelMessages = toInitialMessages(options);
  const tools = getModelTools();

  for (let step = 0; step < maxSteps; step++) {
    const completion = await client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      messages: modelMessages as any,
      tools,
      tool_choice: 'auto',
    });

    const choice = completion.choices[0];
    const assistantMessage = choice?.message;
    if (!assistantMessage) {
      onChunk('模型未返回有效响应。');
      return;
    }

    modelMessages.push({
      ...assistantMessage,
      content: assistantMessage.content ?? '',
    } as any);

    if (!(assistantMessage.tool_calls?.length)) {
      onChunk(assistantMessage.content ?? '');
      return;
    }

    const toolMessages = await executeToolCalls({
      ...assistantMessage,
      content: assistantMessage.content ?? '',
    } as any);
    modelMessages.push(...toolMessages);
  }

  onChunk('Harness 达到最大推理步数，请尝试拆分问题或提供更多上下文。');
}

export const runBuiltinHarness = runHarness;
