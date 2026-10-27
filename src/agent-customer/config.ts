import { z } from 'zod';
const EnvSchema = z.object({
  APP_MODE: z.literal('demo'), MODEL_MODE: z.enum(['demo', 'llm']).default('demo'),
  HOST: z.literal('127.0.0.1').default('127.0.0.1'), PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().min(1).default('.data/agent-customer'), DATABASE_URL: z.string().url().optional(),
  DEMO_TOKEN: z.string().min(12).default('demo-local-token'),
  OPENAI_API_KEY: z.string().min(1).optional(), AGENT_MODEL: z.string().min(1).optional(),
  AGENT_ENABLED: z.enum(['true', 'false']).default('true'),
}).superRefine((v, ctx) => {
  if (v.MODEL_MODE === 'llm' && (!v.OPENAI_API_KEY || !v.AGENT_MODEL)) ctx.addIssue({ code: 'custom', message: 'LLM exige OPENAI_API_KEY e AGENT_MODEL.' });
});
export function parseConfig(env: Record<string, string | undefined>) { return EnvSchema.parse(env); }
export type AppConfig = ReturnType<typeof parseConfig>;
