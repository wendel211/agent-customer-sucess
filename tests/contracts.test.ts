import { describe, expect, it } from 'vitest';
import { RunRequestSchema, AgentSuggestionSchema } from '../src/agent-customer/contracts.js';
import { parseConfig } from '../src/agent-customer/config.js';
import { request, suggestion } from './fixtures.js';
describe('Contratos de fronteira', () => {
  it('rejeita organização enviada no corpo', () => expect(() => RunRequestSchema.parse({ ...request, tenantId: 'other' })).toThrow());
  it('rejeita categorias desconhecidas e propriedades extras', () => {
    expect(() => AgentSuggestionSchema.parse({ ...suggestion, category: 'made_up' })).toThrow();
    expect(() => AgentSuggestionSchema.parse({ ...suggestion, sendNow: true })).toThrow();
  });
  it('rejeita rascunho sem referências e encaminhamento com texto público', () => {
    expect(() => AgentSuggestionSchema.parse({ ...suggestion, evidenceRefs: [] })).toThrow();
    expect(() => AgentSuggestionSchema.parse({ ...suggestion, disposition: 'handoff' })).toThrow();
  });
  it('não habilita demonstração implicitamente', () => expect(() => parseConfig({})).toThrow());
  it('exige credenciais e modelo quando usa LLM', () => expect(() => parseConfig({ APP_MODE: 'demo', MODEL_MODE: 'llm' })).toThrow());
  it('rejeita modo de autenticação e porta inválidos', () => {
    expect(() => parseConfig({ APP_MODE: 'production', MODEL_MODE: 'demo' })).toThrow();
    expect(() => parseConfig({ APP_MODE: 'demo', PORT: 'NaN' })).toThrow();
  });
});
