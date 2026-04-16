import OpenAI from 'openai';
import { config } from '../core/config';
import type { HarnessRunOptions } from './types';
import { runBuiltinHarness } from './runner';
import { runWithOpenAIAgents } from './openaiAgents';
import { runWithLangGraph } from './langGraph';

type OrchestratorKind = 'builtin' | 'openai-agents' | 'langgraph';

async function tryRun(
  kind: OrchestratorKind,
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  if (kind === 'openai-agents') {
    await runWithOpenAIAgents(client, options, onChunk);
    return;
  }

  if (kind === 'langgraph') {
    await runWithLangGraph(client, options, onChunk);
    return;
  }

  await runBuiltinHarness(client, options, onChunk);
}

function getExecutionOrder(): OrchestratorKind[] {
  switch (config.LILAC_ORCHESTRATOR) {
    case 'openai-agents':
      return ['openai-agents', 'langgraph', 'builtin'];
    case 'langgraph':
      return ['langgraph', 'openai-agents', 'builtin'];
    case 'builtin':
      return ['builtin'];
    case 'auto':
    default:
      return ['openai-agents', 'langgraph', 'builtin'];
  }
}

export async function runHarnessOrchestrator(
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  const order = getExecutionOrder();
  const errors: string[] = [];

  for (const kind of order) {
    try {
      await tryRun(kind, client, options, onChunk);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${kind}: ${message}`);
    }
  }

  throw new Error(`All orchestrators failed. ${errors.join(' | ')}`);
}

