import { config } from '../core/config';
import { loadSettings } from '../core/settings';
import { runWorkspaceShell } from '../core/shell';
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  searchWorkspace,
  writeWorkspaceFile,
} from '../core/workspace';
import { estimateTokens } from '../utils/tokens';
import { loadSkills } from '../core/skills';
import type { HarnessTool } from './types';

const maxFileReadChars = 16000;

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

  return JSON.stringify(await readWorkspaceFile(relativePath, maxFileReadChars), null, 2);
}

async function listWorkspaceFilesTool(args: Record<string, unknown>): Promise<string> {
  const relativePath = typeof args.path === 'string' ? args.path : '.';
  const limit = typeof args.limit === 'number' ? args.limit : 120;
  const files = await listWorkspaceFiles(relativePath, limit);
  return JSON.stringify({ path: relativePath, count: files.length, files }, null, 2);
}

async function searchWorkspaceTool(args: Record<string, unknown>): Promise<string> {
  const pattern = typeof args.pattern === 'string' ? args.pattern : '';
  if (!pattern.trim()) {
    throw new Error('`pattern` is required and must be a non-empty string.');
  }
  const relativePath = typeof args.path === 'string' ? args.path : '.';
  const limit = typeof args.limit === 'number' ? args.limit : 80;
  const matches = await searchWorkspace(pattern, relativePath, limit);
  return JSON.stringify({ pattern, path: relativePath, count: matches.length, matches }, null, 2);
}

async function writeWorkspaceFileTool(args: Record<string, unknown>): Promise<string> {
  const settings = await loadSettings();
  if (settings.permissionMode !== 'auto') {
    throw new Error(`Writing files requires /permissions auto. Current mode is ${settings.permissionMode}.`);
  }

  const relativePath = typeof args.path === 'string' ? args.path : '';
  const content = typeof args.content === 'string' ? args.content : '';
  if (!relativePath.trim()) {
    throw new Error('`path` is required and must be a non-empty string.');
  }

  return JSON.stringify(await writeWorkspaceFile(relativePath, content), null, 2);
}

async function runShellCommandTool(args: Record<string, unknown>): Promise<string> {
  const command = typeof args.command === 'string' ? args.command : '';
  if (!command.trim()) {
    throw new Error('`command` is required and must be a non-empty string.');
  }
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined;
  return JSON.stringify(await runWorkspaceShell(command, timeoutMs), null, 2);
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
  {
    name: 'list_workspace_files',
    description: 'List files inside the workspace, ignoring heavy generated directories.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative directory or file path from workspace root.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of files to return.',
        },
      },
      additionalProperties: false,
    },
    execute: listWorkspaceFilesTool,
  },
  {
    name: 'search_workspace',
    description: 'Search workspace text with ripgrep and return line-numbered matches.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Ripgrep search pattern.',
        },
        path: {
          type: 'string',
          description: 'Relative path to search from.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of matches to return.',
        },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    execute: searchWorkspaceTool,
  },
  {
    name: 'write_workspace_file',
    description: 'Write a UTF-8 text file inside workspace root. Requires permission mode auto.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from workspace root.',
        },
        content: {
          type: 'string',
          description: 'Full file content to write.',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    execute: writeWorkspaceFileTool,
  },
  {
    name: 'run_shell_command',
    description: 'Run a shell command in the workspace. Requires permission mode auto.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to run from workspace root.',
        },
        timeoutMs: {
          type: 'number',
          description: 'Optional timeout in milliseconds.',
        },
      },
      required: ['command'],
      additionalProperties: false,
    },
    execute: runShellCommandTool,
  },
];
