import 'dotenv/config';
import { mkdir } from 'node:fs/promises';
import { parseConfig } from './agent-customer/config.js';
import { openDatabase } from './agent-customer/adapters/database.js';
import { migrate } from './agent-customer/adapters/schema.js';
import { RunStore } from './agent-customer/adapters/run-store.js';
import { createModel } from './agent-customer/model.js';
import { createWorker } from './agent-customer/worker.js';
import { buildApp } from './app.js';
import { seedDemo } from './demo/seed.js';

// Explicitly disable inherited tracing: exporting content requires a sanitized integration.
process.env.LANGSMITH_TRACING = 'false'; process.env.LANGCHAIN_TRACING_V2 = 'false';
try {
  const config = parseConfig(process.env);
  if (!config.DATABASE_URL) await mkdir(config.DATA_DIR, { recursive: true });
  const db = await openDatabase({ url: config.DATABASE_URL, path: config.DATABASE_URL ? undefined : config.DATA_DIR });
  await migrate(db); await seedDemo(db);
  const model = createModel(config); const store = new RunStore(db, config.AGENT_ENABLED === 'true');
  const app = await buildApp({ db, model, tokens: new Map([[config.DEMO_TOKEN, { tenantId: 'acme', actorId: 'demo-operator', permissions: ['tickets:read', 'agent:run'] }]]), demo: true, enabled: config.AGENT_ENABLED === 'true', modelKind: config.MODEL_MODE });
  const worker = createWorker({ db, store, model });
  const jobs = setInterval(() => { void worker.tick().catch(() => console.error('WORKER_UNAVAILABLE')); }, 500);
  const retention = setInterval(() => { void store.prune().catch(() => console.error('MAINTENANCE_FAILED')); }, 3600000); retention.unref();
  await store.prune();
  await app.listen({ host: config.HOST, port: config.PORT });
  console.log(`agentCustomer: http://${config.HOST}:${config.PORT} | modelo: ${config.MODEL_MODE === 'demo' ? 'DEMONSTRAÇÃO determinística' : 'LLM configurada'}`);
  let stopping = false;
  const close = async () => {
    if (stopping) return; stopping = true; clearInterval(jobs); clearInterval(retention);
    await worker.stop(); await app.close(); await db.close();
  };
  process.on('SIGINT', () => { void close(); }); process.on('SIGTERM', () => { void close(); });
} catch {
  console.error('STARTUP_FAILED: confira APP_MODE=demo, variáveis de configuração e acesso ao banco. Nenhuma credencial foi registrada.'); process.exitCode = 1;
}
