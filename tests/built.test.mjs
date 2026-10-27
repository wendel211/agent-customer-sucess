import { test } from 'node:test';
import assert from 'node:assert/strict';

test('artefato compilado rejeita identidade controlada pelo cliente', async () => {
  const { RunRequestSchema } = await import('../dist/agent-customer/contracts.js');
  assert.throws(() => RunRequestSchema.parse({ ticketId: 'T-1', ticketVersion: 1, idempotencyKey: 'one', tenantId: 'other' }));
});

test('artefato compilado recusa configuração implícita ou produção sem integração', async () => {
  const { parseConfig } = await import('../dist/agent-customer/config.js');
  assert.throws(() => parseConfig({}));
  assert.throws(() => parseConfig({ APP_MODE: 'production' }));
});
