import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Database } from '../../src/agent-customer/adapters/database.js';
import { migrate } from '../../src/agent-customer/adapters/schema.js';
import { seedDemo } from '../../src/demo/seed.js';
import { RunStore } from '../../src/agent-customer/adapters/run-store.js';
import { createWorker } from '../../src/agent-customer/worker.js';
import { createDemoModel } from '../../src/demo/model.js';
import { SqlCheckpointSaver } from '../../src/agent-customer/adapters/checkpointer.js';
import { actor, request } from '../fixtures.js';
describe('Worker com grafo real', () => {
  let db: Database; let store: RunStore;
  beforeAll(async () => { db = await openDatabase(); await migrate(db); store = new RunStore(db); });
  beforeEach(async () => { await db.query('TRUNCATE agent_events, agent_runs, demo_tickets, knowledge_documents, agent_checkpoints CASCADE'); await seedDemo(db); });
  afterAll(async () => db.close());
  it('consome fila, executa LangGraph e persiste sugestão', async () => {
    const run = await store.enqueue(actor, request);
    const worker = createWorker({ db, store, model: createDemoModel() });
    expect(await worker.tick()).toBe(true);
    const result = await store.get(actor, 'T-1001', run.runId);
    expect(result.status).toBe('completed'); expect(result.suggestion?.category).toBe('access');
    expect((await store.events(actor, 'T-1001', run.runId, 0)).some(e => e.type === 'result')).toBe(true);
    expect(await worker.tick()).toBe(false);
  });
  it('checkpoints sobrevivem a uma nova instância do saver', async () => {
    const run = await store.enqueue(actor, request);
    await createWorker({ db, store, model: createDemoModel() }).tick();
    const rows = await db.query<{ thread_id: string }>('SELECT DISTINCT thread_id FROM agent_checkpoints');
    expect(rows.rows).toHaveLength(1);
    const saved = await new SqlCheckpointSaver(db).getTuple({ configurable: { thread_id: rows.rows[0]!.thread_id } });
    expect(saved?.checkpoint.channel_values).toHaveProperty('suggestion');
  });
  it('marca superseded quando a revisão muda antes de iniciar', async () => {
    const run = await store.enqueue(actor, request);
    await db.query("UPDATE demo_tickets SET version=2 WHERE id='T-1001'");
    await createWorker({ db, store, model: createDemoModel() }).tick();
    expect((await store.get(actor, 'T-1001', run.runId)).status).toBe('superseded');
  });
});
