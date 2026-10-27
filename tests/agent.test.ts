import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../src/agent-customer/adapters/database.js';
import { migrate } from '../src/agent-customer/adapters/schema.js';
import { seedDemo } from '../src/demo/seed.js';
import { SqlTicketGateway } from '../src/agent-customer/adapters/tickets.js';
import { SqlKnowledgeGateway } from '../src/agent-customer/adapters/knowledge.js';
import { analyzeSnapshot } from '../src/agent-customer/agent.js';
import { createReadTools } from '../src/agent-customer/tools.js';
import { createDemoModel } from '../src/demo/model.js';
import { validateSuggestion } from '../src/agent-customer/validate-result.js';
import { ExecutionBudget } from '../src/agent-customer/policy.js';
import { actor, foreignActor, suggestion } from './fixtures.js';
describe('Agente e conhecimento', () => {
  let db: Database; let tickets: SqlTicketGateway; let knowledge: SqlKnowledgeGateway;
  beforeAll(async () => { db = await openDatabase(); await migrate(db); await seedDemo(db); tickets = new SqlTicketGateway(db); knowledge = new SqlKnowledgeGateway(db); });
  afterAll(async () => db.close());
  it('busca pública exclui notas internas e outras organizações', async () => {
    const result = await knowledge.search(actor, { text: 'acesso senha', audience: 'public', limit: 6 });
    expect(result.map(e => e.id)).toEqual(['access-guide:1']);
    expect(await knowledge.search(foreignActor, { text: 'acesso senha', audience: 'public', limit: 6 })).toEqual([]);
  });
  it('retira documentos revogados da recuperação', async () => {
    await db.query("UPDATE knowledge_documents SET active = false WHERE id = 'billing-guide'");
    expect(await knowledge.search(actor, { text: 'cobrança fatura', audience: 'public', limit: 6 })).toEqual([]);
  });
  it('ferramentas públicas não retornam notas internas ou permitem mudar ticket', async () => {
    const snapshot = await tickets.getSnapshot(actor, 'T-1001');
    const tools = createReadTools(actor, snapshot, knowledge, new ExecutionBudget());
    expect(tools.map(t => t.name)).toEqual(['get_ticket', 'get_customer_context', 'search_knowledge']);
    const payload = await tools[0]!.invoke({}); expect(JSON.stringify(payload)).not.toContain('INTERNAL-ONLY');
    await expect(tools[0]!.invoke({ ticketId: 'other' } as never)).rejects.toThrow();
  });
  it('executa LangChain e retorna rascunho fundamentado', async () => {
    const snapshot = await tickets.getSnapshot(actor, 'T-1001');
    const result = await analyzeSnapshot(actor, snapshot, knowledge, createDemoModel(), AbortSignal.timeout(10000));
    expect(result.category).toBe('access'); expect(result.disposition).toBe('draft');
    expect(result.evidenceRefs).toEqual([{ kind: 'document', id: 'access-guide:1', version: '1' }]);
    expect(result.publicDraft).toContain('Esqueci minha senha');
    expect(result.publicDraft).not.toContain('INTERNAL-ONLY');
  });
  it('encaminha sem inventar quando a base não tem resposta', async () => {
    const result = await analyzeSnapshot(actor, await tickets.getSnapshot(actor, 'T-1002'), knowledge, createDemoModel(), AbortSignal.timeout(10000));
    expect(result.disposition).toBe('needs_information'); expect(result.publicDraft).toBeNull();
  });
  it('rejeita referência inventada', async () => {
    expect(() => validateSuggestion(suggestion, [], awaitSnapshot())).toThrow();
    function awaitSnapshot() { return { id: 'T-1', tenantId: 'acme', version: 1, status: 'open', subject: 'Teste', messages: [], customerFacts: [] }; }
  });
  it('limita ferramentas e chamadas do modelo por execução', () => {
    const budget = new ExecutionBudget(); for (let i = 0; i < 8; i++) budget.tool();
    expect(() => budget.tool()).toThrow();
    const modelBudget = new ExecutionBudget(); for (let i = 0; i < 4; i++) modelBudget.model();
    expect(() => modelBudget.model()).toThrow();
  });
});
