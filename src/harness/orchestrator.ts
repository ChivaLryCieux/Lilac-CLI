import OpenAI from 'openai';
import { config } from '../core/config';
import type { HarnessRunOptions } from './types';
import { runBuiltinHarness } from './runner';
import { runWithOpenAIAgents } from './openaiAgents';
import { runWithLangGraph } from './langGraph';

type OrchestratorKind = 'builtin' | 'openai-agents' | 'langgraph';
type HarnessRunner = (
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) => Promise<void>;

const orchestrators: Record<OrchestratorKind, HarnessRunner> = {
  'openai-agents': runWithOpenAIAgents,
  langgraph: runWithLangGraph,
  builtin: runBuiltinHarness,
};

const orchestratorOrders: Record<typeof config.LILAC_ORCHESTRATOR, OrchestratorKind[]> = {
  'openai-agents': ['openai-agents', 'langgraph', 'builtin'],
  langgraph: ['langgraph', 'openai-agents', 'builtin'],
  builtin: ['builtin'],
  auto: ['openai-agents', 'langgraph', 'builtin'],
};

async function tryRun(
  kind: OrchestratorKind,
  client: OpenAI,
  options: HarnessRunOptions,
  onChunk: (text: string) => void
) {
  await orchestrators[kind](client, options, onChunk);
}

function getExecutionOrder(): OrchestratorKind[] {
  return orchestratorOrders[config.LILAC_ORCHESTRATOR] ?? orchestratorOrders.auto;
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
