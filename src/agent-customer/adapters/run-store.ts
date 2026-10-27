import { createHash, randomUUID } from 'node:crypto';
import { ActorSchema, AgentSuggestionSchema, RunRequestSchema, type ActorContext, type AgentSuggestion, type RunEvent, type RunRequest, type RunStatus, type RunView } from '../contracts.js';
import { AppError, requirePermission } from '../errors.js';
import type { Database } from './database.js';
type RunRow = {
  id: string; tenant_id: string; actor: ActorContext; ticket_id: string; ticket_version: number;
  request_hash: string; status: RunStatus; suggestion: AgentSuggestion | null; error_code: string | null;
  lease_token: string | null; lease_until: Date | null; deadline_at: Date; thread_id: string; attempt_count: number;
};
export type ClaimedJob = { runId: string; token: string; threadId: string; actor: ActorContext; ticketId: string; ticketVersion: number; deadlineAt: number };
const terminal = (s: RunStatus) => !['queued', 'running'].includes(s);
function view(row: RunRow): RunView { return { runId: row.id, ticketId: row.ticket_id, ticketVersion: row.ticket_version, status: row.status, suggestion: row.suggestion, errorCode: row.error_code }; }
async function event(db: Database, runId: string, type: RunEvent['type'], payload: Record<string, unknown>): Promise<void> {
  const seq = (await db.query<{ event_seq: number }>('UPDATE agent_runs SET event_seq=event_seq+1,updated_at=now() WHERE id=$1 RETURNING event_seq', [runId])).rows[0]!;
  await db.query('INSERT INTO agent_events(run_id,sequence,type,payload) VALUES($1,$2,$3,$4)', [runId, seq.event_seq, type, JSON.stringify(payload)]);
}
export class RunStore {
  constructor(private readonly db: Database, private readonly enabled = true) {}
  async enqueue(ctx: ActorContext, raw: RunRequest): Promise<RunView> {
    requirePermission(ctx, 'agent:run'); requirePermission(ctx, 'tickets:read');
    if (!this.enabled) throw new AppError('AGENT_DISABLED', 503);
    const req = RunRequestSchema.parse(raw);
    const hash = createHash('sha256').update(JSON.stringify([req.ticketId, req.ticketVersion])).digest('hex');
    return this.db.transaction(async tx => {
      // The ticket lock serializes requests for this resource and conditional writes.
      const ticket = (await tx.query<{ version: number }>('SELECT version FROM demo_tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [ctx.tenantId, req.ticketId])).rows[0];
      if (!ticket) throw new AppError('NOT_FOUND', 404);
      const prior = (await tx.query<RunRow>('SELECT * FROM agent_runs WHERE tenant_id=$1 AND idempotency_key=$2', [ctx.tenantId, req.idempotencyKey])).rows[0];
      if (prior) { if (prior.request_hash !== hash) throw new AppError('IDEMPOTENCY_CONFLICT', 409); return this.currentView(tx, prior); }
      if (ticket.version !== req.ticketVersion) throw new AppError('TICKET_CHANGED', 409);
      const active = (await tx.query<{ n: string }>("SELECT count(*) AS n FROM agent_runs WHERE tenant_id=$1 AND status IN ('queued','running')", [ctx.tenantId])).rows[0]!;
      if (Number(active.n) >= 20) throw new AppError('QUEUE_LIMIT', 429);
      const runId = randomUUID(); const threadId = randomUUID();
      const row = (await tx.query<RunRow>(`INSERT INTO agent_runs(id,tenant_id,actor,ticket_id,ticket_version,idempotency_key,request_hash,status,thread_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,'queued',$8) RETURNING *`, [runId, ctx.tenantId, JSON.stringify(ActorSchema.parse(ctx)), req.ticketId, req.ticketVersion, req.idempotencyKey, hash, threadId])).rows[0]!;
      await event(tx, runId, 'status', { status: 'queued' }); return view(row);
    });
  }
  private async authorized(db: Database, ctx: ActorContext, ticketId: string, runId: string, lock = false): Promise<RunRow> {
    requirePermission(ctx, 'tickets:read');
    const row = (await db.query<RunRow>(`SELECT r.* FROM agent_runs r JOIN demo_tickets t ON t.tenant_id=r.tenant_id AND t.id=r.ticket_id
      WHERE r.tenant_id=$1 AND r.ticket_id=$2 AND r.id=$3 ${lock ? 'FOR UPDATE OF r' : ''}`, [ctx.tenantId, ticketId, runId])).rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404); return row;
  }
  private async currentView(db: Database, row: RunRow): Promise<RunView> {
    if (row.status !== 'completed') return view(row);
    const ticket = (await db.query<{ version: number }>('SELECT version FROM demo_tickets WHERE tenant_id=$1 AND id=$2', [row.tenant_id, row.ticket_id])).rows[0];
    if (!ticket) throw new AppError('NOT_FOUND', 404);
    if (ticket.version !== row.ticket_version) return { ...view(row), status: 'superseded', suggestion: null };
    return view(row);
  }
  async get(ctx: ActorContext, ticketId: string, runId: string): Promise<RunView> {
    return this.currentView(this.db, await this.authorized(this.db, ctx, ticketId, runId));
  }
  async cancel(ctx: ActorContext, ticketId: string, runId: string): Promise<RunView> {
    requirePermission(ctx, 'agent:run');
    return this.db.transaction(async tx => {
      const row = await this.authorized(tx, ctx, ticketId, runId, true);
      if (terminal(row.status)) return this.currentView(tx, row);
      await tx.query("UPDATE agent_runs SET status='cancelled',lease_token=null,lease_until=null WHERE id=$1", [runId]);
      await event(tx, runId, 'status', { status: 'cancelled' }); return { ...view(row), status: 'cancelled', suggestion: null };
    });
  }
  async events(ctx: ActorContext, ticketId: string, runId: string, after: number): Promise<RunEvent[]> {
    await this.authorized(this.db, ctx, ticketId, runId);
    const { rows } = await this.db.query<{ sequence: number; type: RunEvent['type']; payload: Record<string, unknown> }>('SELECT sequence,type,payload FROM agent_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100', [runId, after]);
    return rows.map(row => ({ ...row, runId }));
  }
  async claim(_workerId: string): Promise<ClaimedJob | null> {
    return this.db.transaction(async tx => {
      const exhausted = (await tx.query<RunRow>("UPDATE agent_runs SET status='failed',error_code=CASE WHEN deadline_at<now() THEN 'TIMEOUT' ELSE 'RECOVERY_LIMIT' END,lease_token=null,lease_until=null WHERE status='running' AND lease_until<now() AND (attempt_count>=3 OR deadline_at<now()) RETURNING *")).rows;
      for (const row of exhausted) await event(tx, row.id, 'error', { code: row.error_code });
      const row = (await tx.query<RunRow>(`SELECT r.* FROM agent_runs r JOIN demo_tickets t ON t.tenant_id=r.tenant_id AND t.id=r.ticket_id
        WHERE r.attempt_count<3 AND ((r.status='running' AND r.lease_until<now()) OR
          (r.status='queued' AND NOT EXISTS(SELECT 1 FROM agent_runs a WHERE a.tenant_id=r.tenant_id AND a.ticket_id=r.ticket_id AND a.status='running')))
        ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE OF t,r SKIP LOCKED`)).rows[0];
      if (!row) return null;
      const token = randomUUID();
      const updated = (await tx.query<RunRow>("UPDATE agent_runs SET status='running',lease_token=$2,lease_until=now()+interval '30 seconds',deadline_at=coalesce(deadline_at,now()+interval '60 seconds'),attempt_count=attempt_count+1 WHERE id=$1 RETURNING *", [row.id, token])).rows[0]!;
      await event(tx, row.id, 'status', { status: 'running' });
      return { runId: row.id, token, threadId: row.thread_id, actor: ActorSchema.parse(row.actor), ticketId: row.ticket_id, ticketVersion: row.ticket_version, deadlineAt: new Date(updated.deadline_at).getTime() };
    });
  }
  async renew(job: ClaimedJob): Promise<boolean> {
    const rows = (await this.db.query("UPDATE agent_runs SET lease_until=now()+interval '30 seconds' WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() RETURNING id", [job.runId, job.token])).rows;
    return rows.length === 1;
  }
  async reserve(job: ClaimedJob, kind: 'model' | 'tool'): Promise<void> {
    const column = kind === 'model' ? 'model_calls' : 'tool_calls'; const limit = kind === 'model' ? 4 : 8;
    const rows = (await this.db.query(`UPDATE agent_runs SET ${column}=${column}+1 WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() AND deadline_at>now() AND ${column}<$3 RETURNING id`, [job.runId, job.token, limit])).rows;
    if (!rows.length) throw new AppError(kind === 'model' ? 'MODEL_BUDGET_EXCEEDED' : 'TOOL_BUDGET_EXCEEDED', 422);
  }
  async supersede(job: ClaimedJob): Promise<void> {
    await this.db.transaction(async tx => {
      const rows = (await tx.query("UPDATE agent_runs SET status='superseded',lease_token=null,lease_until=null WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id", [job.runId, job.token])).rows;
      if (rows.length) await event(tx, job.runId, 'status', { status: 'superseded' });
    });
  }
  async progress(job: ClaimedJob, message: string): Promise<void> {
    await this.db.transaction(async tx => {
      const row = (await tx.query<RunRow>("SELECT * FROM agent_runs WHERE id=$1 AND lease_token=$2 AND status='running' AND lease_until>now() FOR UPDATE", [job.runId, job.token])).rows[0];
      if (!row) throw new AppError('LEASE_LOST', 409);
      await event(tx, job.runId, 'progress', { message });
    });
  }
  async complete(job: ClaimedJob, raw: AgentSuggestion): Promise<RunStatus> {
    const suggestion = AgentSuggestionSchema.parse(raw);
    return this.db.transaction(async tx => {
      const ticket = (await tx.query<{ version: number }>('SELECT version FROM demo_tickets WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [job.actor.tenantId, job.ticketId])).rows[0];
      const row = (await tx.query<RunRow>('SELECT * FROM agent_runs WHERE id=$1 FOR UPDATE', [job.runId])).rows[0];
      if (!row || row.tenant_id !== job.actor.tenantId) throw new AppError('NOT_FOUND', 404);
      if (terminal(row.status)) return row.status;
      if (row.lease_token !== job.token || !row.lease_until || new Date(row.lease_until).getTime() <= Date.now()) throw new AppError('LEASE_LOST', 409);
      if (new Date(row.deadline_at).getTime() <= Date.now()) {
        await tx.query("UPDATE agent_runs SET status='failed',error_code='TIMEOUT',suggestion=null,lease_token=null,lease_until=null WHERE id=$1", [job.runId]);
        await event(tx, job.runId, 'error', { code: 'TIMEOUT' }); return 'failed';
      }
      const status = ticket?.version === row.ticket_version ? 'completed' : 'superseded';
      await tx.query('UPDATE agent_runs SET status=$2,suggestion=$3,lease_token=null,lease_until=null WHERE id=$1', [job.runId, status, status === 'completed' ? JSON.stringify(suggestion) : null]);
      await event(tx, job.runId, status === 'completed' ? 'result' : 'status', { status }); return status;
    });
  }
  async fail(job: ClaimedJob, code: string): Promise<void> {
    await this.db.transaction(async tx => {
      const rows = (await tx.query("UPDATE agent_runs SET status='failed',error_code=$3,lease_token=null,lease_until=null WHERE id=$1 AND lease_token=$2 AND status='running' RETURNING id", [job.runId, job.token, code])).rows;
      if (rows.length) await event(tx, job.runId, 'error', { code });
    });
  }
  async prune(): Promise<void> {
    await this.db.transaction(async tx => {
      await tx.query("DELETE FROM agent_checkpoint_writes WHERE thread_id IN (SELECT thread_id::text FROM agent_runs WHERE created_at<now()-interval '30 days' AND status NOT IN ('queued','running'))");
      await tx.query("DELETE FROM agent_checkpoints WHERE thread_id IN (SELECT thread_id::text FROM agent_runs WHERE created_at<now()-interval '30 days' AND status NOT IN ('queued','running'))");
      await tx.query("DELETE FROM agent_events WHERE run_id IN (SELECT id FROM agent_runs WHERE created_at<now()-interval '30 days' AND status NOT IN ('queued','running'))");
      await tx.query("UPDATE agent_runs SET suggestion=null,actor=jsonb_build_object('tenantId',tenant_id,'actorId','[expired]','permissions',jsonb_build_array()) WHERE created_at<now()-interval '30 days' AND status NOT IN ('queued','running')");
      await tx.query("DELETE FROM agent_runs WHERE created_at<now()-interval '90 days' AND status NOT IN ('queued','running')");
    });
  }
}
