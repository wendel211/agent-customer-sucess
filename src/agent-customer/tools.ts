import { tool } from 'langchain';
import { z } from 'zod';
import type { ActorContext, TicketSnapshot, KnowledgeGateway } from './contracts.js';
import { requirePermission } from './errors.js';
import { ExecutionBudget, publicProjection, redact } from './policy.js';
export function createReadTools(ctx: ActorContext, snapshot: TicketSnapshot, knowledge: KnowledgeGateway, budget: ExecutionBudget) {
  requirePermission(ctx, 'tickets:read');
  if (ctx.tenantId !== snapshot.tenantId) throw new Error('Invalid execution scope');
  const projected = publicProjection(snapshot);
  return [
    tool(async () => { await budget.callTool(); return JSON.stringify({ id: projected.id, subject: projected.subject, messages: projected.messages }); }, { name: 'get_ticket', description: 'Lê exclusivamente as mensagens públicas do ticket desta execução.', schema: z.object({}).strict() }),
    tool(async () => { await budget.callTool(); return JSON.stringify(projected.customerFacts); }, { name: 'get_customer_context', description: 'Lê fatos autorizados para divulgação pública neste ticket.', schema: z.object({}).strict() }),
    tool(async ({ text }) => { await budget.callTool(); return JSON.stringify((await knowledge.search(ctx, { text, audience: 'public', limit: 6 })).map(e => ({ ...e, excerpt: redact(e.excerpt) }))); }, { name: 'search_knowledge', description: 'Busca procedimentos públicos aprovados para esta organização.', schema: z.object({ text: z.string().min(1).max(500) }).strict() }),
  ] as const;
}
