import OpenAI from 'openai';
import type { HarnessRunOptions } from './types';
import { executeToolCalls, getModelTools, toInitialMessages } from './chatRuntime';

const defaultMaxSteps = 4;

const harnessInstruction = `
You are running inside Lilac Harness mode.

Rules:
1. You can call tools when useful, but keep calls minimal.
2. If a tool returns enough context, provide a direct answer.
3. Be explicit when a result comes from tool output.
4. Keep final answer concise and practical.
5. File writes and shell commands are guarded by Lilac permission mode; if blocked, tell the user which /permissions mode is required.
`.trim();

export async function runHarness(
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const maxSteps = options.maxSteps ?? defaultMaxSteps;
  const modelMessages = toInitialMessages(options);
  modelMessages[0]!.content = [modelMessages[0]!.content, harnessInstruction].filter(Boolean).join('\n\n');
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
