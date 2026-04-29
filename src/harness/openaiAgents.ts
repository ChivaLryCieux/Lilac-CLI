import OpenAI from 'openai';
import { harnessTools } from './tools';
import type { HarnessRunOptions } from './types';
import { dynamicImport } from './dynamicImport';
import { getSystemPrompt, resolveMaxSteps } from './chatRuntime';

function getLatestUserMessage(options: HarnessRunOptions): string {
  const latest = [...options.messages].reverse().find(message => message.role === 'user');
  return latest?.content || '';
}

export async function runWithOpenAIAgents(
  _client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const moduleName = '@openai/agents';
  const sdk = await dynamicImport<Record<string, unknown>>(moduleName).catch(() => null);

  if (!sdk) {
    throw new Error(`Package "${moduleName}" is not installed.`);
  }

  const AgentCtor = sdk.Agent as (new (args: Record<string, unknown>) => unknown) | undefined;
  const runFn = sdk.run as ((agent: unknown, input: string, opts?: Record<string, unknown>) => Promise<unknown>) | undefined;
  const toolFactory = sdk.tool as ((args: Record<string, unknown>) => unknown) | undefined;

  if (!AgentCtor || !runFn) {
    throw new Error('OpenAI Agents SDK API shape is not supported by current integration.');
  }

  const tools = harnessTools.map(tool => {
    const execute = async (rawArgs: unknown) => {
      const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
      return tool.execute(args);
    };

    if (toolFactory) {
      return toolFactory({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        execute,
      });
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute,
    };
  });

  const agent = new AgentCtor({
    name: 'LilacHarnessAgent',
    instructions: getSystemPrompt(options),
    model: options.model,
    tools,
  });

  const userInput = getLatestUserMessage(options);
  const result = await runFn(agent, userInput, {
    maxTurns: resolveMaxSteps(options),
    temperature: options.temperature,
  });

  const maybeText = (result as { finalOutput?: unknown; output_text?: unknown })?.finalOutput
    ?? (result as { output_text?: unknown })?.output_text
    ?? '';

  if (typeof maybeText === 'string' && maybeText.trim()) {
    onChunk(maybeText);
    return;
  }

  const fallbackText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  onChunk(fallbackText || 'OpenAI Agents 未返回可解析文本。');
}
