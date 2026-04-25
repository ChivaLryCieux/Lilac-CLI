import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { config } from './config';
import type { Skill } from '../types';

let cachedSkills: Skill[] | null = null;

async function parseSkillFile(file: string): Promise<Skill> {
  const fullPath = path.join(config.LILAC_SKILLS_DIR, file);
  const markdown = await fs.readFile(fullPath, 'utf-8');
  const { data, content } = matter(markdown);

  return {
    name: data.name || path.basename(file, '.md'),
    description: data.description || '',
    model: data.model,
    temperature: data.temperature,
    systemPrompt: content.trim(),
  };
}

export async function loadSkills(options: { refresh?: boolean } = {}): Promise<Skill[]> {
  if (cachedSkills && !options.refresh) return cachedSkills;

  const dir = config.LILAC_SKILLS_DIR;
  const files = await fs.readdir(dir).catch(() => []);
  const markdownFiles = files.filter(file => file.endsWith('.md'));
  const skills = await Promise.all(markdownFiles.map(parseSkillFile));
  cachedSkills = skills;

  return skills;
}

export async function loadDefaultSkill(): Promise<Skill | null> {
  const skills = await loadSkills();
  return skills.find(s => s.name === 'Lilac-Core') || skills[0] || null;
}
