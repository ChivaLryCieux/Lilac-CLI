import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

dotenvConfig();

const configSchema = z.object({
  LILAC_API_KEY: z.string().optional(), // 改为可选，允许先进入 TUI
  LILAC_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  LILAC_DEFAULT_MODEL: z.string().default('gpt-4o'),
  LILAC_SKILLS_DIR: z.string().default(path.join(process.cwd(), 'skills')),
  LILAC_ENABLE_HARNESS: z
    .string()
    .default('true')
    .transform(v => v.toLowerCase() !== 'false'),
  LILAC_ORCHESTRATOR: z
    .enum(['auto', 'openai-agents', 'langgraph', 'builtin'])
    .default('auto'),
  LILAC_MAX_REASONING_STEPS: z.coerce.number().int().min(1).max(12).default(4),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ 配置验证失败:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export const hasApiKey = !!config.LILAC_API_KEY;
