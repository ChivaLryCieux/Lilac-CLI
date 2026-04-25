import fs from 'fs/promises';
import path from 'path';
import type { Message, Session } from '../types';
import { getStateDir } from './settings';

const sessionsDir = path.join(getStateDir(), 'sessions');
const latestSessionPath = path.join(getStateDir(), 'latest-session.json');

function createSessionId(): string {
  return `session-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

async function ensureSessionDir() {
  await fs.mkdir(sessionsDir, { recursive: true });
}

export async function loadLatestSession(): Promise<Session> {
  try {
    const pointer = JSON.parse(await fs.readFile(latestSessionPath, 'utf-8')) as { id?: string };
    if (!pointer.id) {
      throw new Error('Missing latest session id.');
    }
    const session = JSON.parse(await fs.readFile(path.join(sessionsDir, `${pointer.id}.json`), 'utf-8')) as Session;
    return {
      ...session,
      messages: session.messages ?? [],
      createdAt: session.createdAt ?? Date.now(),
      updatedAt: session.updatedAt ?? session.createdAt ?? Date.now(),
      sessionTokens: session.sessionTokens ?? 0,
    };
  } catch {
    const now = Date.now();
    return {
      id: createSessionId(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      sessionTokens: 0,
    };
  }
}

export async function saveSession(session: Session): Promise<void> {
  await ensureSessionDir();
  const nextSession: Session = {
    ...session,
    updatedAt: Date.now(),
  };
  await fs.writeFile(path.join(sessionsDir, `${session.id}.json`), `${JSON.stringify(nextSession, null, 2)}\n`);
  await fs.writeFile(latestSessionPath, `${JSON.stringify({ id: session.id }, null, 2)}\n`);
}

export function createSystemMessage(content: string): Message {
  return {
    id: crypto.randomUUID(),
    role: 'system',
    content,
    timestamp: Date.now(),
  };
}

