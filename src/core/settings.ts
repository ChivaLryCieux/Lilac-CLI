import fs from 'fs/promises';
import path from 'path';
import type { LilacSettings, PermissionMode } from '../types';

const stateDir = path.join(process.cwd(), '.lilac');
const settingsPath = path.join(stateDir, 'settings.json');

export const defaultSettings: LilacSettings = {
  permissionMode: 'ask',
  maxToolOutputChars: 20000,
};

async function ensureStateDir() {
  await fs.mkdir(stateDir, { recursive: true });
}

function normalizeSettings(raw: Partial<LilacSettings>): LilacSettings {
  const permissionMode: PermissionMode = ['ask', 'auto', 'deny'].includes(raw.permissionMode ?? '')
    ? (raw.permissionMode as PermissionMode)
    : defaultSettings.permissionMode;

  return {
    ...defaultSettings,
    ...raw,
    permissionMode,
    maxToolOutputChars:
      typeof raw.maxToolOutputChars === 'number' && raw.maxToolOutputChars > 0
        ? raw.maxToolOutputChars
        : defaultSettings.maxToolOutputChars,
  };
}

export async function loadSettings(): Promise<LilacSettings> {
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    return normalizeSettings(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return defaultSettings;
  }
}

export async function saveSettings(settings: LilacSettings): Promise<void> {
  await ensureStateDir();
  await fs.writeFile(settingsPath, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`);
}

export function getStateDir(): string {
  return stateDir;
}
