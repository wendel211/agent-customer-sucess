import { randomUUID } from 'node:crypto';
import { BaseChatModel, type BaseChatModelParams, type BindToolsInput } from '@langchain/core/language_models/chat_models';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

// Only for synthetic fixtures: this is deliberately not a language model.
class DemoChatModel extends BaseChatModel {
  private readonly bound: BindToolsInput[];
  constructor(bound: BindToolsInput[] = []) { super({} as BaseChatModelParams); this.bound = bound; }
  _llmType(): string { return 'agent-customer-demo'; }
  bindTools(tools: BindToolsInput[]) { return new DemoChatModel(tools); }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = [...messages].reverse().find(m => m.getType() === 'human');
    const input = JSON.parse(String(message?.content ?? '{}'));
    const text = `${input.ticket?.subject ?? ''} ${(input.ticket?.messages ?? []).map((m: { body: string }) => m.body).join(' ')}`.toLowerCase();
    const category = /senha|acess|login/.test(text) ? 'access' : /fatura|cobran|pagamento/.test(text) ? 'billing' : /erro|falha|indispon/.test(text) ? 'technical' : 'unknown';
    const urgent = /todos.*(fora|indispon)|indisponibilidade geral/.test(text);
    const args = input.task === 'triage' ? {
      summary: input.ticket.subject, category, priority: urgent ? 'urgent' : 'normal',
      priorityReason: urgent ? 'Relato explícito de indisponibilidade geral.' : 'Não há relato de indisponibilidade geral.',
    } : input.evidence?.length ? {
      publicDraft: `Olá! ${input.evidence[0].excerpt}`,
      evidenceRefs: [{ kind: 'document', id: input.evidence[0].id, version: input.evidence[0].documentVersion }],
      missingInformation: [], disposition: 'draft', handoffReason: null,
    } : {
      publicDraft: null, evidenceRefs: [], missingInformation: ['Descreva o resultado esperado e o comportamento observado.'], disposition: 'needs_information', handoffReason: null,
    };
    const responseTool = this.bound.map(t => t as { name?: string; function?: { name?: string } })
      .map(t => t.function?.name ?? t.name).find(name => name && !['get_ticket', 'get_customer_context', 'search_knowledge'].includes(name));
    if (!responseTool) throw new Error('Demo requires structured output tool');
    return { generations: [{ text: '', message: new AIMessage({ content: '', tool_calls: [{ id: randomUUID(), name: responseTool, args, type: 'tool_call' }] }) }] };
  }
}
export function createDemoModel(): BaseChatModel { return new DemoChatModel(); }
