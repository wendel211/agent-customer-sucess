import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createGraph } from './graph.js';
import { safeErrorCode } from './errors.js';
import { setTimeout as delay } from 'node:timers/promises';
import type { Database } from './adapters/database.js';
import type { RunStore } from './adapters/run-store.js';
export function createWorker(options: { db: Database; store: RunStore; model: BaseChatModel }) {
  let active = false; const shutdown = new AbortController();
  return {
    async stop() { shutdown.abort(); while (active) await delay(20); },
    async tick(): Promise<boolean> {
      if (active || shutdown.signal.aborted) return false;
      active = true;
      try {
        const job = await options.store.claim('local-worker'); if (!job) return false;
        const lease = new AbortController(); const signal = AbortSignal.any([shutdown.signal, lease.signal, AbortSignal.timeout(Math.max(1, job.deadlineAt - Date.now()))]);
        const heartbeat = setInterval(() => { void options.store.renew(job).then(ok => { if (!ok) lease.abort(); }).catch(() => lease.abort()); }, 5000);
        heartbeat.unref();
        try {
          const graph = createGraph({ ...options, job, signal });
          const config = { configurable: { thread_id: job.threadId }, signal, recursionLimit: 16 };
          const saved = await graph.getState(config);
          if (saved.values?.runId) await graph.invoke(null, config);
          else await graph.invoke({ runId: job.runId }, config);
        } catch (error) { const code = safeErrorCode(error); if (code === 'TICKET_CHANGED') await options.store.supersede(job); else await options.store.fail(job, code); }
        finally { clearInterval(heartbeat); }
        return true;
      } finally { active = false; }
    },
  };
}
