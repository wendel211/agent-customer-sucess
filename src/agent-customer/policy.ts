import { AppError } from './errors.js';
export class ExecutionBudget {
  private modelCalls = 0; private toolCalls = 0;
  private readonly started = Date.now();
  constructor(private readonly signal?: AbortSignal, private readonly reserve?: (kind: 'model' | 'tool') => Promise<void>) {}
  check(): void { this.signal?.throwIfAborted(); if (Date.now() - this.started >= 60000) throw new AppError('TIMEOUT', 504); }
  model(): void { this.check(); if (++this.modelCalls > 4) throw new AppError('MODEL_BUDGET_EXCEEDED', 422); }
  tool(): void { this.check(); if (++this.toolCalls > 8) throw new AppError('TOOL_BUDGET_EXCEEDED', 422); }
  async callModel(): Promise<void> { this.model(); await this.reserve?.('model'); }
  async callTool(): Promise<void> { this.tool(); await this.reserve?.('tool'); }
}
export function redact(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/(?:\+55\s*)?(?:\(\d{2}\)|\b\d{2})\s*9?\d{4}[-\s]?\d{4}\b/g, '[telefone]');
}
export function publicProjection<T extends { messages: { visibility: string; body: string }[]; customerFacts: { audience: string; value: string }[]; subject: string }>(snapshot: T): T {
  return { ...snapshot, subject: redact(snapshot.subject), messages: snapshot.messages.filter(m => m.visibility === 'public').slice(-20).map(m => ({ ...m, body: redact(m.body).slice(0, 4000) })), customerFacts: snapshot.customerFacts.filter(f => f.audience === 'public').map(f => ({ ...f, value: redact(f.value).slice(0, 1000) })) } as T;
}
