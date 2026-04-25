#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { App } from './components/App';
import { createChatStream } from './core/api';
import { config, hasApiKey } from './core/config';
import { loadSettings } from './core/settings';
import { loadDefaultSkill, loadSkills } from './core/skills';
import type { Message } from './types';

const version = '1.0.0';

function printHelp() {
  console.log(`Lilac ${version}

Usage:
  lilac                 Start interactive TUI
  lilac "prompt"        Run one non-interactive prompt
  lilac --tui           Force interactive TUI
  lilac --help          Show this help
  lilac --version       Show version

Inside TUI:
  /help, /status, /model, /skills, /permissions, /files, /search, /doctor, /compact, /clear, /exit`);
}

async function runPrompt(prompt: string) {
  if (!hasApiKey) {
    console.error('Missing LILAC_API_KEY. Configure .env or environment before non-interactive use.');
    process.exitCode = 1;
    return;
  }

  const settings = await loadSettings();
  const skills = await loadSkills();
  const skill =
    (settings.activeSkillName && skills.find(candidate => candidate.name === settings.activeSkillName)) ||
    (await loadDefaultSkill());

  const message: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
  };

  await createChatStream([message], skill, settings.defaultModel ?? config.LILAC_DEFAULT_MODEL, chunk => {
    process.stdout.write(chunk);
  });
  process.stdout.write('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(version);
    return;
  }

  if (args.length > 0 && !args.includes('--tui')) {
    await runPrompt(args.join(' '));
    return;
  }

  render(<App />);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
