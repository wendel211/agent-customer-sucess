import { ChatOpenAI } from '@langchain/openai';
import type { AppConfig } from './config.js';
import { createDemoModel } from '../demo/model.js';
export function createModel(config: AppConfig) {
  if (config.MODEL_MODE === 'demo') return createDemoModel();
  return new ChatOpenAI({ model: config.AGENT_MODEL!, apiKey: config.OPENAI_API_KEY!, maxRetries: 0, timeout: 55000, temperature: 0 });
}
