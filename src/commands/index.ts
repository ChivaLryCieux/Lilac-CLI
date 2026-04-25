import path from 'path';
import { config, hasApiKey } from '../core/config';
import { loadSkills } from '../core/skills';
import { saveSettings } from '../core/settings';
import { createSystemMessage } from '../core/session';
import type { LilacSettings, Message, Skill } from '../types';

export type CommandContext = {
  messages: Message[];
  activeSkill: Skill | null;
  settings: LilacSettings;
  sessionTokens: number;
};

export type CommandResult = {
  messages?: Message[];
  clearMessages?: boolean;
  nextSkill?: Skill | null;
  nextSettings?: LilacSettings;
  nextSessionTokens?: number;
  exit?: boolean;
};

type CommandHandler = (args: string[], context: CommandContext) => Promise<CommandResult> | CommandResult;

type CommandDefinition = {
  name: string;
  aliases?: string[];
  summary: string;
  usage: string;
  handler: CommandHandler;
};

function system(content: string): CommandResult {
  return { messages: [createSystemMessage(content)] };
}

function formatCommands() {
  return commandDefinitions
    .map(command => `${command.usage.padEnd(24)} ${command.summary}`)
    .join('\n');
}

async function updateSettings(
  context: CommandContext,
  patch: Partial<LilacSettings>
): Promise<LilacSettings> {
  const nextSettings = { ...context.settings, ...patch };
  await saveSettings(nextSettings);
  return nextSettings;
}

function summarizeMessages(messages: Message[]): string {
  const source = messages.filter(message => message.role === 'user' || message.role === 'assistant');
  if (!source.length) {
    return 'No conversation to compact.';
  }

  const lines = source.slice(-12).map(message => {
    const content = message.content.replace(/\s+/g, ' ').trim().slice(0, 220);
    return `${message.role}: ${content}`;
  });

  return [
    'Conversation compacted locally. Keep this summary as context:',
    '',
    ...lines,
  ].join('\n');
}

const commandDefinitions: CommandDefinition[] = [
  {
    name: 'help',
    aliases: ['?'],
    summary: 'Show commands',
    usage: '/help',
    handler: () => system(`Lilac commands:\n\n${formatCommands()}`),
  },
  {
    name: 'status',
    summary: 'Show runtime status',
    usage: '/status',
    handler: (_args, context) =>
      system(
        [
          `cwd: ${process.cwd()}`,
          `api: ${hasApiKey ? 'configured' : 'missing LILAC_API_KEY'}`,
          `baseURL: ${config.LILAC_BASE_URL}`,
          `model: ${context.settings.defaultModel ?? context.activeSkill?.model ?? config.LILAC_DEFAULT_MODEL}`,
          `skill: ${context.activeSkill?.name ?? 'none'}`,
          `permissionMode: ${context.settings.permissionMode}`,
          `messages: ${context.messages.length}`,
          `tokens: ${context.sessionTokens}`,
          `skillsDir: ${path.relative(process.cwd(), config.LILAC_SKILLS_DIR) || '.'}`,
        ].join('\n')
      ),
  },
  {
    name: 'model',
    summary: 'Show or set model override',
    usage: '/model [name]',
    handler: async (args, context) => {
      const model = args.join(' ').trim();
      if (!model) {
        return system(`Current model: ${context.settings.defaultModel ?? context.activeSkill?.model ?? config.LILAC_DEFAULT_MODEL}`);
      }
      const nextSettings = await updateSettings(context, { defaultModel: model });
      return {
        nextSettings,
        messages: [createSystemMessage(`Model override set to ${model}.`)],
      };
    },
  },
  {
    name: 'skills',
    aliases: ['skill'],
    summary: 'List or switch skills',
    usage: '/skills [name]',
    handler: async (args, context) => {
      const skills = await loadSkills({ refresh: true });
      const requested = args.join(' ').trim();
      if (!requested) {
        const list = skills
          .map(skill => `${skill.name === context.activeSkill?.name ? '*' : '-'} ${skill.name}: ${skill.description || 'No description'}`)
          .join('\n');
        return system(`Available skills:\n\n${list || 'No skills found.'}`);
      }

      const nextSkill = skills.find(skill => skill.name.toLowerCase() === requested.toLowerCase());
      if (!nextSkill) {
        return system(`Skill not found: ${requested}`);
      }

      const nextSettings = await updateSettings(context, { activeSkillName: nextSkill.name });
      return {
        nextSkill,
        nextSettings,
        messages: [createSystemMessage(`Active skill switched to ${nextSkill.name}.`)],
      };
    },
  },
  {
    name: 'permissions',
    aliases: ['permission'],
    summary: 'Show or set tool permission mode',
    usage: '/permissions [ask|auto|deny]',
    handler: async (args, context) => {
      const mode = args[0];
      if (!mode) {
        return system(`Permission mode: ${context.settings.permissionMode}`);
      }
      if (!['ask', 'auto', 'deny'].includes(mode)) {
        return system('Usage: /permissions [ask|auto|deny]');
      }
      const nextSettings = await updateSettings(context, { permissionMode: mode as LilacSettings['permissionMode'] });
      return {
        nextSettings,
        messages: [createSystemMessage(`Permission mode set to ${mode}.`)],
      };
    },
  },
  {
    name: 'compact',
    summary: 'Replace chat with a local summary',
    usage: '/compact',
    handler: (_args, context) => ({
      clearMessages: true,
      messages: [createSystemMessage(summarizeMessages(context.messages))],
      nextSessionTokens: 0,
    }),
  },
  {
    name: 'clear',
    summary: 'Clear visible conversation',
    usage: '/clear',
    handler: () => ({
      clearMessages: true,
      messages: [createSystemMessage('Conversation cleared.')],
      nextSessionTokens: 0,
    }),
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    summary: 'Exit Lilac',
    usage: '/exit',
    handler: () => ({ exit: true }),
  },
];

const commandMap = new Map<string, CommandDefinition>();
for (const command of commandDefinitions) {
  commandMap.set(command.name, command);
  for (const alias of command.aliases ?? []) {
    commandMap.set(alias, command);
  }
}

export function isSlashCommand(input: string): boolean {
  return input.trimStart().startsWith('/');
}

export async function executeSlashCommand(input: string, context: CommandContext): Promise<CommandResult> {
  const trimmed = input.trim();
  const [rawName = '', ...args] = trimmed.slice(1).split(/\s+/);
  const command = commandMap.get(rawName.toLowerCase());

  if (!command) {
    return system(`Unknown command: /${rawName}\nRun /help to see available commands.`);
  }

  return command.handler(args, context);
}

