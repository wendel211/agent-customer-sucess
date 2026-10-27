import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openDatabase, type Database } from '../../src/agent-customer/adapters/database.js';
import { migrate } from '../../src/agent-customer/adapters/schema.js';
import { seedDemo } from '../../src/demo/seed.js';
import { buildApp } from '../../src/app.js';
import { createDemoModel } from '../../src/demo/model.js';
import { actor } from '../fixtures.js';
describe('API autenticada', () => {
  let app: FastifyInstance; let db: Database;
  const headers = { authorization: 'Bearer test-token' };
  beforeAll(async () => {
    db = await openDatabase(); await migrate(db); await seedDemo(db);
    app = await buildApp({ db, tokens: new Map([['test-token', actor], ['reader-token', { ...actor, actorId: 'reader' }]]), model: createDemoModel(), demo: true });
  });
  afterAll(async () => { await app.close(); await db.close(); });
  it('rejeita requisição sem credencial', async () => expect((await app.inject({ url: '/api/tickets/T-1001' })).statusCode).toBe(401));
  it('não aceita tenantId no corpo nem rota para outro ticket', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tickets/T-1001/agent-runs', headers, payload: { ticketVersion: 1, idempotencyKey: 'bad', tenantId: 'other' } });
    expect(res.statusCode).toBe(400);
  });
  it('aceita análise e consulta a mesma execução', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tickets/T-1001/agent-runs', headers, payload: { ticketVersion: 1, idempotencyKey: 'http-1' } });
    expect(res.statusCode).toBe(202); const id = res.json().runId;
    const run = await app.inject({ url: `/api/tickets/T-1001/agent-runs/${id}`, headers });
    expect(run.statusCode).toBe(200); expect(run.json().status).toBe('queued');
    expect((await app.inject({ url: `/api/tickets/T-1002/agent-runs/${id}`, headers })).statusCode).toBe(404);
  });
  it('nega qualquer rota de envio público', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/tickets/T-1001/send', headers, payload: { body: 'Olá' } })).statusCode).toBe(404);
  });
  it('SSE retoma por Last-Event-ID e não envia payloads internos', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tickets/T-1001/agent-runs', headers, payload: { ticketVersion: 1, idempotencyKey: 'sse' } });
    const id = res.json().runId;
    await app.inject({ method: 'POST', url: `/api/tickets/T-1001/agent-runs/${id}/cancel`, headers });
    const stream = await app.inject({ url: `/api/tickets/T-1001/agent-runs/${id}/events`, headers: { ...headers, 'last-event-id': '1' } });
    expect(stream.statusCode).toBe(200); expect(stream.body).toContain('id: 2'); expect(stream.body).not.toContain('id: 1');
    expect(stream.body).not.toContain('INTERNAL-ONLY'); expect(stream.body).not.toContain('test-token');
  });
  it('usa headers de segurança e nunca devolve segredo no health', async () => {
    const res = await app.inject({ url: '/health' }); expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff'); expect(res.body).not.toContain('test-token');
  });
  it('permite acompanhar uma análise longa sem exceder o limite de leitura', async () => {
    const readHeaders = { authorization: 'Bearer reader-token' };
    const created = await app.inject({ method: 'POST', url: '/api/tickets/T-1001/agent-runs', headers: readHeaders, payload: { ticketVersion: 1, idempotencyKey: 'read-budget' } });
    expect(created.statusCode).toBe(202);
    for (let index = 0; index < 80; index++) {
      const result = await app.inject({ url: `/api/tickets/T-1001/agent-runs/${created.json().runId}`, headers: readHeaders });
      expect(result.statusCode).toBe(200);
    }
  });
});
