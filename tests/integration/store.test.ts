import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../../src/agent-customer/adapters/database.js';
import { migrate } from '../../src/agent-customer/adapters/schema.js';
import { seedDemo } from '../../src/demo/seed.js';
import { SqlTicketGateway } from '../../src/agent-customer/adapters/tickets.js';
import { RunStore } from '../../src/agent-customer/adapters/run-store.js';
import { actor, foreignActor, request, suggestion } from '../fixtures.js';
describe('Execuções duráveis em PostgreSQL embarcado', () => {
  let db: Database; let store: RunStore;
  beforeAll(async () => { db = await openDatabase(); await migrate(db); store = new RunStore(db); });
  beforeEach(async () => { await db.query('TRUNCATE agent_events, agent_runs, demo_tickets, knowledge_documents CASCADE'); await seedDemo(db); });
  afterAll(async () => db.close());
  it('nega acesso ao ticket de outra organização', async () => {
    await expect(new SqlTicketGateway(db).getSnapshot(foreignActor, 'T-1001')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('retorna a mesma execução para pedidos duplicados e conflita com payload diferente', async () => {
    const a = await store.enqueue(actor, request);
    expect((await store.enqueue(actor, request)).runId).toBe(a.runId);
    await expect(store.enqueue(actor, { ...request, ticketVersion: 2 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('não revela execução de outra organização ou de outro ticket', async () => {
    const a = await store.enqueue(actor, request);
    await expect(store.get(foreignActor, 'T-1001', a.runId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(store.get(actor, 'T-1002', a.runId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('serializa jobs do mesmo ticket', async () => {
    await store.enqueue(actor, request); await store.enqueue(actor, { ...request, idempotencyKey: 'second' });
    const job = await store.claim('worker'); expect(job).not.toBeNull();
    expect(await store.claim('other-worker')).toBeNull();
  });
  it('grava resultado uma única vez após replay', async () => {
    const run = await store.enqueue(actor, request); const job = (await store.claim('worker'))!;
    expect(await store.complete(job, suggestion)).toBe('completed');
    expect(await store.complete(job, suggestion)).toBe('completed');
    expect((await store.events(actor, 'T-1001', run.runId, 0)).filter(e => e.type === 'result')).toHaveLength(1);
  });
  it('resultado desatualizado não substitui a versão atual', async () => {
    const run = await store.enqueue(actor, request); const job = (await store.claim('worker'))!;
    await db.query("UPDATE demo_tickets SET version = 2 WHERE id = 'T-1001'");
    expect(await store.complete(job, suggestion)).toBe('superseded');
    expect((await store.get(actor, 'T-1001', run.runId)).suggestion).toBeNull();
  });
  it('cancelamento impede gravação e é idempotente', async () => {
    const run = await store.enqueue(actor, request); const job = (await store.claim('worker'))!;
    await store.cancel(actor, 'T-1001', run.runId); await store.cancel(actor, 'T-1001', run.runId);
    expect(await store.complete(job, suggestion)).toBe('cancelled');
    expect((await store.get(actor, 'T-1001', run.runId)).suggestion).toBeNull();
  });
  it('worker com lease expirado perde a capacidade de gravar', async () => {
    await store.enqueue(actor, request); const old = (await store.claim('worker'))!;
    await db.query('UPDATE agent_runs SET lease_until = now() - interval \'1 second\' WHERE id = $1', [old.runId]);
    const next = (await store.claim('worker2'))!; expect(next.token).not.toBe(old.token);
    await expect(store.complete(old, suggestion)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    expect(await store.complete(next, suggestion)).toBe('completed');
  });
  it('filtra e retoma eventos por sequência', async () => {
    const run = await store.enqueue(actor, request); await store.claim('worker');
    const events = await store.events(actor, 'T-1001', run.runId, 0);
    expect(events.map(e => e.sequence)).toEqual([1, 2]);
    expect((await store.events(actor, 'T-1001', run.runId, 1)).map(e => e.sequence)).toEqual([2]);
  });
  it('não salva resultado depois do prazo persistido', async () => {
    const run = await store.enqueue(actor, request); const job = (await store.claim('worker'))!;
    await db.query("UPDATE agent_runs SET deadline_at=now()-interval '1 second' WHERE id=$1", [run.runId]);
    expect(await store.complete(job, suggestion)).toBe('failed');
    const result = await store.get(actor, 'T-1001', run.runId);
    expect(result.suggestion).toBeNull(); expect(result.errorCode).toBe('TIMEOUT');
  });
  it('preserva o orçamento de chamadas após recuperar o job', async () => {
    await store.enqueue(actor, request); const first = (await store.claim('worker'))!;
    for (let index = 0; index < 4; index++) await store.reserve(first, 'model');
    await db.query("UPDATE agent_runs SET lease_until=now()-interval '1 second' WHERE id=$1", [first.runId]);
    const recovered = (await store.claim('recovery'))!;
    await expect(store.reserve(recovered, 'model')).rejects.toMatchObject({ code: 'MODEL_BUDGET_EXCEEDED' });
  });
  it('cancelar uma execução concluída não devolve sugestão de revisão antiga', async () => {
    const run = await store.enqueue(actor, request); const job = (await store.claim('worker'))!;
    await store.complete(job, suggestion);
    await db.query("UPDATE demo_tickets SET version=2 WHERE id='T-1001'");
    const result = await store.cancel(actor, 'T-1001', run.runId);
    expect(result.status).toBe('superseded'); expect(result.suggestion).toBeNull();
    const duplicate = await store.enqueue(actor, request);
    expect(duplicate.status).toBe('superseded'); expect(duplicate.suggestion).toBeNull();
  });
});
