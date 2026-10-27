import { describe, expect, it } from 'vitest';
import { analyzeSnapshot } from '../src/agent-customer/agent.js';
import { createDemoModel } from '../src/demo/model.js';
import { createReadTools } from '../src/agent-customer/tools.js';
import { ExecutionBudget } from '../src/agent-customer/policy.js';
import type { Evidence, KnowledgeGateway, TicketSnapshot } from '../src/agent-customer/contracts.js';
import { actor } from './fixtures.js';
const snapshot: TicketSnapshot = { id: 'T-1001', tenantId: 'acme', version: 1, status: 'open', subject: 'Recuperar senha de acesso', messages: [
  { id: 'm1', body: 'Quero recuperar minha senha.', visibility: 'public', createdAt: '2026-10-23T12:00:00Z' },
  { id: 'm2', body: 'INTERNAL-ONLY-739', visibility: 'internal', createdAt: '2026-10-23T12:00:00Z' },
], customerFacts: [] };
const evidence: Evidence = { id: 'guide:1', documentId: 'guide', documentVersion: '1', passageId: 'guide:1', excerpt: 'Use a opção Esqueci minha senha.', audience: 'public', updatedAt: '2026-10-23T12:00:00Z' };
const knowledge: KnowledgeGateway = { async search() { return [evidence]; } };
describe('Pipeline LangChain sem rede', () => {
  it('produz saída estruturada referenciada através do agente real', async () => {
    const result = await analyzeSnapshot(actor, snapshot, knowledge, createDemoModel(), AbortSignal.timeout(10000));
    expect(result.category).toBe('access'); expect(result.publicDraft).toContain('Esqueci minha senha');
    expect(result.publicDraft).not.toContain('INTERNAL-ONLY'); expect(result.evidenceRefs).toEqual([{ kind: 'document', id: 'guide:1', version: '1' }]);
  });
  it('não tenta resolver um caso sem conhecimento aprovado', async () => {
    const result = await analyzeSnapshot(actor, snapshot, { async search() { return []; } }, createDemoModel(), AbortSignal.timeout(10000));
    expect(result.disposition).toBe('needs_information'); expect(result.publicDraft).toBeNull();
  });
  it('nega mudança de organização antes de chamar a recuperação', async () => {
    await expect(analyzeSnapshot({ ...actor, tenantId: 'foreign' }, snapshot, knowledge, createDemoModel(), AbortSignal.timeout(10000))).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('não permite ampliar a audiência pela ferramenta', async () => {
    const tools = createReadTools(actor, snapshot, knowledge, new ExecutionBudget());
    await expect(tools[2]!.invoke({ text: 'senha', audience: 'internal' } as never)).rejects.toThrow();
  });
});
