import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z, ZodError } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ActorContext } from './agent-customer/contracts.js';
import { RunRequestSchema } from './agent-customer/contracts.js';
import { AppError } from './agent-customer/errors.js';
import { SqlTicketGateway } from './agent-customer/adapters/tickets.js';
import { RunStore } from './agent-customer/adapters/run-store.js';
import type { Database } from './agent-customer/adapters/database.js';
declare module 'fastify' { interface FastifyRequest { actor: ActorContext | null } }
export type AppOptions = { db: Database; tokens: Map<string, ActorContext>; model: BaseChatModel; demo: boolean; enabled?: boolean; modelKind?: 'demo' | 'llm' };
const paramsSchema = z.object({ ticketId: z.string().min(1).max(200), runId: z.string().uuid().optional() });
const cursorSchema = z.coerce.number().int().min(0).max(2147483647).default(0);
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 65536, forceCloseConnections: true });
  const tickets = new SqlTicketGateway(options.db); const store = new RunStore(options.db, options.enabled ?? true);
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('x-content-type-options', 'nosniff').header('referrer-policy', 'no-referrer')
      .header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
      .header('cache-control', 'no-store');
  });
  app.addHook('preValidation', async request => {
    if (!request.url.startsWith('/api/')) return;
    const token = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')?.[1];
    if (token) {
      const hash = createHash('sha256').update(token).digest();
      for (const [candidate, actor] of options.tokens) if (timingSafeEqual(hash, createHash('sha256').update(candidate).digest())) { request.actor = structuredClone(actor); break; }
    }
    if (!request.actor) throw new AppError('UNAUTHORIZED', 401);
  });
  await app.register(rateLimit, { max: 60, timeWindow: '1 minute', hook: 'preHandler', keyGenerator: req => req.actor ? `${req.actor.tenantId}:${req.actor.actorId}` : req.ip });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ error: { code: error.code } });
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'INVALID_REQUEST' } });
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.code(429).send({ error: { code: 'RATE_LIMITED' } });
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: { code: 'INVALID_REQUEST' } });
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR' } });
  });
  app.get('/health', async () => ({ status: 'ok', service: 'agentCustomer', mode: options.demo ? 'demo' : 'integrated', modelKind: options.modelKind ?? 'demo' }));
  if (options.demo) {
    app.get('/api/tickets', async req => tickets.list(req.actor!));
    app.get('/api/tickets/:ticketId', async req => tickets.getSnapshot(req.actor!, paramsSchema.parse(req.params).ticketId));
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    for (const [route, name, mime] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/assets/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/assets/style.css', 'style.css', 'text/css; charset=utf-8']]) {
      app.get(route!, async (_req, reply) => reply.type(mime!).send(await readFile(`${publicDir}${name}`, 'utf8')));
    }
  }
  app.post('/api/tickets/:ticketId/agent-runs', async (req, reply) => {
    const { ticketId } = paramsSchema.parse(req.params);
    const body = RunRequestSchema.omit({ ticketId: true }).parse(req.body);
    const run = await store.enqueue(req.actor!, { ...body, ticketId }); return reply.code(202).send({ runId: run.runId, status: run.status });
  });
  app.get('/api/tickets/:ticketId/agent-runs/:runId', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async req => {
    const { ticketId, runId } = paramsSchema.parse(req.params); return store.get(req.actor!, ticketId, runId!);
  });
  app.post('/api/tickets/:ticketId/agent-runs/:runId/cancel', async req => {
    const { ticketId, runId } = paramsSchema.parse(req.params); return store.cancel(req.actor!, ticketId, runId!);
  });
  app.get('/api/tickets/:ticketId/agent-runs/:runId/events', async (req, reply) => {
    const { ticketId, runId } = paramsSchema.parse(req.params); let after = cursorSchema.parse(req.headers['last-event-id'] ?? 0);
    await store.get(req.actor!, ticketId, runId!);
    reply.hijack(); reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    reply.raw.write(': connected\n\n');
    let closed = false; let busy = false;
    const close = () => { if (!closed) { closed = true; clearInterval(timer); clearTimeout(expiry); reply.raw.end(); } };
    const flush = async () => {
      if (busy || closed) return; busy = true;
      try {
        const events = await store.events(req.actor!, ticketId, runId!, after);
        for (const event of events) { if (closed) return; reply.raw.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); after = event.sequence; }
        const run = await store.get(req.actor!, ticketId, runId!);
        if (!['queued', 'running'].includes(run.status) && events.length < 100) close();
      } catch { if (!closed) reply.raw.write('event: error\ndata: {"code":"STREAM_UNAVAILABLE"}\n\n'); close(); }
      finally { busy = false; }
    };
    const timer = setInterval(() => { void flush(); }, 500); timer.unref();
    const expiry = setTimeout(close, 300000); expiry.unref();
    reply.raw.on('close', close); void flush();
  });
  return app;
}
