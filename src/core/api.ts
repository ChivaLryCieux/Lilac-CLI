import OpenAI from 'openai';
import { config } from './config';
import type { Message, Skill } from '../types';
import { runHarnessOrchestrator } from '../harness/orchestrator';

let openaiInstance: OpenAI | null = null;

function getOpenAIClient() {
  if (!openaiInstance) {
    if (!config.LILAC_API_KEY) {
      throw new Error('Missing LILAC_API_KEY in .env file.');
    }
    openaiInstance = new OpenAI({
      apiKey: config.LILAC_API_KEY,
      baseURL: config.LILAC_BASE_URL,
    });
  }
  return openaiInstance;
}

export async function createChatStream(
  messages: Message[],
  skill: Skill | null,
  modelOverride: string | undefined,
  onChunk: (text: string) => void
) {
  const client = getOpenAIClient();
  const model = modelOverride || skill?.model || config.LILAC_DEFAULT_MODEL;
  const temperature = skill?.temperature || 0.7;

  if (config.LILAC_ENABLE_HARNESS) {
    try {
      await runHarnessOrchestrator(
        client,
        {
          messages,
          skill,
          model,
          temperature,
          maxSteps: config.LILAC_MAX_REASONING_STEPS,
        },
        onChunk
      );
      return;
    } catch (error) {
      console.warn('Harness failed. Falling back to direct chat mode.', error);
    }
  }

  const systemPrompt = skill?.systemPrompt || 'You are a helpful assistant.';
  const apiMessages: any[] = [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))];

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: apiMessages,
      temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        onChunk(content);
      }
    }
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}
