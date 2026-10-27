import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../../src/agent-customer/adapters/database.js';
import { migrate } from '../../src/agent-customer/adapters/schema.js';
import { RunStore } from '../../src/agent-customer/adapters/run-store.js';
import { createWorker } from '../../src/agent-customer/worker.js';
import { createDemoModel } from '../../src/demo/model.js';
import { seedDemo } from '../../src/demo/seed.js';
process.env.LANGSMITH_TRACING = 'false'; process.env.LANGCHAIN_TRACING_V2 = 'false';
const db = await openDatabase();
try {
  await migrate(db); await seedDemo(db); const store = new RunStore(db);
  const worker = createWorker({ db, store, model: createDemoModel() });
  const actor = { tenantId: 'acme', actorId: 'evaluation', permissions: ['tickets:read', 'agent:run'] };
  const cases = (await readFile(new URL('./dataset.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const results = [];
  for (const item of cases) {
    const started = performance.now();
    const run = await store.enqueue(actor, { ticketId: item.ticketId, ticketVersion: 1, idempotencyKey: randomUUID() });
    await worker.tick(); const result = await store.get(actor, item.ticketId, run.runId); const s = result.suggestion;
    const passed = result.status === 'completed' && s?.category === item.category && s?.disposition === item.disposition && (item.publicContains === null ? s?.publicDraft === null : s?.publicDraft?.includes(item.publicContains));
    results.push({ ticket: item.ticketId, passed: !!passed, ms: Math.round(performance.now() - started), status: result.status });
  }
  const passed = results.filter(r => r.passed).length;
  const report = `# Avaliação sintética do fluxo\n\nData: ${new Date().toISOString()}\n\nModo: DEMONSTRAÇÃO determinística, sem LLM externa. Corpus: ${cases.length} casos sintéticos.\n\nResultado: ${passed}/${cases.length}. Isso valida contratos e execução; não mede qualidade semântica de uma IA, F1 em tickets reais ou prontidão de produção.\n\n| Ticket | Passou | Tempo local (ms) | Estado |\n| --- | --- | --- | --- |\n${results.map(r => `| ${r.ticket} | ${r.passed} | ${r.ms} | ${r.status} |`).join('\n')}\n\nPendente: corpus sanitizado real, revisão humana, benchmark de modelos e teste de carga conforme a especificação.\n`;
  await writeFile(new URL('./report.md', import.meta.url), report); console.log(`${passed}/${cases.length} casos sintéticos aprovados.`);
  if (passed !== cases.length) process.exitCode = 1;
} finally { await db.close(); }
