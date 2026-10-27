import { describe, expect, it, vi } from 'vitest';
import { ExecutionBudget, redact } from '../src/agent-customer/policy.js';
describe('Proteções da execução', () => {
  it('mascara e-mail, telefone e CPF antes da chamada externa', () => {
    const result = redact('contato cliente@example.com telefone (11) 99999-1234 documento 123.456.789-00');
    expect(result).toBe('contato [email] telefone [telefone] documento [documento]');
  });
  it('não continua após cancelamento', () => {
    const controller = new AbortController(); const budget = new ExecutionBudget(controller.signal);
    controller.abort(); expect(() => budget.model()).toThrow();
  });
  it('não reinicia o prazo a cada chamada', () => {
    vi.useFakeTimers(); try { const budget = new ExecutionBudget(); vi.advanceTimersByTime(60001); expect(() => budget.tool()).toThrow(); } finally { vi.useRealTimers(); }
  });
  it('reserva orçamento persistido antes de permitir uma chamada', async () => {
    const budget = new ExecutionBudget(undefined, async () => { throw new Error('limite persistido'); });
    await expect(budget.callModel()).rejects.toThrow('limite persistido');
  });
});
