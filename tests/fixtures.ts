import type { ActorContext, AgentSuggestion } from '../src/agent-customer/contracts.js';
export const actor: ActorContext = { tenantId: 'acme', actorId: 'operator', permissions: ['tickets:read', 'agent:run'] };
export const foreignActor: ActorContext = { ...actor, tenantId: 'other' };
export const suggestion: AgentSuggestion = {
  schemaVersion: 1, summary: 'Cliente não consegue acessar a conta.', category: 'access',
  priority: 'normal', priorityReason: 'Uma conta afetada, sem indisponibilidade geral.',
  publicDraft: 'Use a opção Esqueci minha senha na tela de acesso.',
  evidenceRefs: [{ kind: 'document', id: 'access-guide:1', version: '1' }],
  missingInformation: [], disposition: 'draft', handoffReason: null,
};
export const request = { ticketId: 'T-1001', ticketVersion: 1, idempotencyKey: 'request-1' };
