import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type AgentSuggestion, type TicketSnapshot } from './contracts.js';
import { AppError } from './errors.js';
import { analyzeSnapshot } from './agent.js';
import { SqlTicketGateway } from './adapters/tickets.js';
import { SqlKnowledgeGateway } from './adapters/knowledge.js';
import { SqlCheckpointSaver } from './adapters/checkpointer.js';
import type { Database } from './adapters/database.js';
import type { ClaimedJob, RunStore } from './adapters/run-store.js';
const State = Annotation.Root({ runId: Annotation<string>(), snapshot: Annotation<TicketSnapshot>(), suggestion: Annotation<AgentSuggestion>() });
export function createGraph(options: { db: Database; store: RunStore; model: BaseChatModel; job: ClaimedJob; signal: AbortSignal }) {
  const { db, store, model, job, signal } = options;
  const tickets = new SqlTicketGateway(db); const knowledge = new SqlKnowledgeGateway(db);
  return new StateGraph(State)
    .addNode('load_context', async () => {
      signal.throwIfAborted(); const snapshot = await tickets.getSnapshot(job.actor, job.ticketId);
      if (snapshot.version !== job.ticketVersion) throw new AppError('TICKET_CHANGED', 409);
      await store.progress(job, 'Lendo o histórico do ticket'); return { snapshot };
    })
    .addNode('analyze', async state => {
      await store.progress(job, 'Consultando procedimentos e preparando a sugestão');
      return { suggestion: await analyzeSnapshot(job.actor, state.snapshot, knowledge, model, signal, kind => store.reserve(job, kind)) };
    })
    .addNode('validate', async state => { signal.throwIfAborted(); return { suggestion: state.suggestion }; })
    .addNode('persist_result', async state => { signal.throwIfAborted(); await store.complete(job, state.suggestion); return {}; })
    .addEdge(START, 'load_context').addEdge('load_context', 'analyze').addEdge('analyze', 'validate').addEdge('validate', 'persist_result').addEdge('persist_result', END)
    .compile({ checkpointer: new SqlCheckpointSaver(db) });
}
