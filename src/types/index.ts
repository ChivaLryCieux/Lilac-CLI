export interface SkillMetadata {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
}

export interface Skill extends SkillMetadata {
  systemPrompt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  messages: Message[];
  activeSkillId?: string;
  createdAt: number;
}

export type AppState = {
  messages: Message[];
  activeSkill: Skill | null;
  isStreaming: boolean;
  error: string | null;
  status: 'idle' | 'thinking' | 'error' | 'success';
  sessionTokens: number;
};
