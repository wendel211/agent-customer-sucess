import type { Database } from './database.js';
const statements = [
  `CREATE TABLE IF NOT EXISTS demo_tickets (
    tenant_id text NOT NULL, id text NOT NULL, version integer NOT NULL CHECK (version > 0),
    snapshot jsonb NOT NULL, PRIMARY KEY (tenant_id,id))`,
  `CREATE TABLE IF NOT EXISTS knowledge_documents (
    tenant_id text NOT NULL, id text NOT NULL, version text NOT NULL, title text NOT NULL,
    content text NOT NULL, audience text NOT NULL CHECK (audience IN ('public','internal')),
    active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('portuguese',title || ' ' || content)) STORED,
    PRIMARY KEY (tenant_id,id))`,
  `CREATE INDEX IF NOT EXISTS knowledge_search_idx ON knowledge_documents USING gin(search_vector)`,
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id uuid PRIMARY KEY, tenant_id text NOT NULL, actor jsonb NOT NULL, ticket_id text NOT NULL,
    ticket_version integer NOT NULL, idempotency_key text NOT NULL, request_hash text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued','running','completed','superseded','failed','cancelled')),
    suggestion jsonb, error_code text, event_seq integer NOT NULL DEFAULT 0, attempt_count integer NOT NULL DEFAULT 0,
    lease_token uuid, lease_until timestamptz, deadline_at timestamptz, thread_id uuid NOT NULL,
    model_calls integer NOT NULL DEFAULT 0, tool_calls integer NOT NULL DEFAULT 0,
    model_id text NOT NULL DEFAULT 'configured', prompt_version text NOT NULL DEFAULT '1',
    policy_version text NOT NULL DEFAULT '1', created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,idempotency_key))`,
  `CREATE INDEX IF NOT EXISTS runs_ticket_idx ON agent_runs(tenant_id,ticket_id,status)`,
  `CREATE INDEX IF NOT EXISTS runs_queue_idx ON agent_runs(created_at) WHERE status IN ('queued','running')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_running_ticket_idx ON agent_runs(tenant_id,ticket_id) WHERE status='running'`,
  `CREATE TABLE IF NOT EXISTS agent_events (
    run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    sequence integer NOT NULL, type text NOT NULL, payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (run_id,sequence))`,
  `CREATE TABLE IF NOT EXISTS agent_checkpoints (
    thread_id text NOT NULL, namespace text NOT NULL DEFAULT '', checkpoint_id text NOT NULL,
    parent_id text, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (thread_id,namespace,checkpoint_id))`,
  `CREATE TABLE IF NOT EXISTS agent_checkpoint_writes (
    thread_id text NOT NULL, namespace text NOT NULL, checkpoint_id text NOT NULL,
    task_id text NOT NULL, task_path text NOT NULL DEFAULT '', idx integer NOT NULL, payload jsonb NOT NULL,
    PRIMARY KEY (thread_id,namespace,checkpoint_id,task_id,idx),
    FOREIGN KEY(thread_id,namespace,checkpoint_id) REFERENCES agent_checkpoints(thread_id,namespace,checkpoint_id) ON DELETE CASCADE)`,
];
export async function migrate(db: Database) { await db.transaction(async tx => { for (const sql of statements) await tx.query(sql); }); }
