import type { Message, Skill } from '../types';

export type HarnessTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
};

export type HarnessRunOptions = {
  messages: Message[];
  skill: Skill | null;
  model: string;
  temperature: number;
  maxSteps?: number;
};

