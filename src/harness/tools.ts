import fs from 'fs/promises';
import path from 'path';
import { config } from '../core/config';
import { estimateTokens } from '../utils/tokens';
import { loadSkills } from '../core/skills';
import type { HarnessTool } from './types';

const workspaceRoot = process.cwd();
const maxFileReadChars = 16000;

function resolveWorkspacePath(inputPath: string): string {
  const normalizedInput = inputPath.replace(/\\/g, '/');
  const absolute = path.resolve(workspaceRoot, normalizedInput);
  const relative = path.relative(workspaceRoot, absolute);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside workspace root.');
  }

  return absolute;
}

async function getCurrentTime(): Promise<string> {
  const now = new Date();
  return JSON.stringify(
    {
      iso: now.toISOString(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      unixMs: now.getTime(),
    },
    null,
    2
  );
}

async function estimateTokensTool(args: Record<string, unknown>): Promise<string> {
  const text = typeof args.text === 'string' ? args.text : '';
  if (!text.trim()) {
    throw new Error('`text` is required and must be a non-empty string.');
  }

  return JSON.stringify(
    {
      tokens: estimateTokens(text),
      length: text.length,
    },
    null,
    2
  );
}

async function listSkillsTool(): Promise<string> {
  const skills = await loadSkills();
  return JSON.stringify(
    skills.map(skill => ({
      name: skill.name,
      description: skill.description,
      model: skill.model ?? config.LILAC_DEFAULT_MODEL,
      temperature: skill.temperature ?? 0.7,
    })),
    null,
    2
  );
}

async function readWorkspaceFileTool(args: Record<string, unknown>): Promise<string> {
  const relativePath = typeof args.path === 'string' ? args.path : '';
  if (!relativePath.trim()) {
    throw new Error('`path` is required and must be a non-empty string.');
  }

  const absolutePath = resolveWorkspacePath(relativePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) {
    throw new Error('Target is not a file.');
  }

  const content = await fs.readFile(absolutePath, 'utf-8');
  const trimmed = content.slice(0, maxFileReadChars);

  return JSON.stringify(
    {
      path: path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/'),
      truncated: content.length > maxFileReadChars,
      content: trimmed,
    },
    null,
    2
  );
}

export const harnessTools: HarnessTool[] = [
  {
    name: 'get_current_time',
    description: 'Get current runtime time in ISO/local timezone formats.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: getCurrentTime,
  },
  {
    name: 'estimate_tokens',
    description: 'Estimate token usage for a given text.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text that requires token estimation.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
    execute: estimateTokensTool,
  },
  {
    name: 'list_skills',
    description: 'List all available Lilac skills with metadata.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    execute: listSkillsTool,
  },
  {
    name: 'read_workspace_file',
    description: 'Read a UTF-8 text file inside workspace root. Use relative path.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from workspace root.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    execute: readWorkspaceFileTool,
  },
];

