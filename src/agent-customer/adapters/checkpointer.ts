import { BaseCheckpointSaver, WRITES_IDX_MAP, compareWritesSortKeys, writesSortKey, type Checkpoint, type CheckpointMetadata, type CheckpointTuple, type CheckpointListOptions, type ChannelVersions, type PendingWrite } from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import type { Database } from './database.js';
type Encoded = { type: string; data: string };
type Stored = { thread_id: string; namespace: string; checkpoint_id: string; parent_id: string | null; payload: { checkpoint: Encoded; metadata: Encoded } };
export class SqlCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly db: Database) { super(); }
  private async encode(value: unknown): Promise<Encoded> { const [type, data] = await this.serde.dumpsTyped(value); return { type, data: Buffer.from(data).toString('base64') }; }
  private async decode(value: Encoded): Promise<unknown> { return this.serde.loadsTyped(value.type, Buffer.from(value.data, 'base64')); }
  private config(thread: string, ns: string, id: string): RunnableConfig { return { configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id } }; }
  private async tuple(row: Stored): Promise<CheckpointTuple> {
    const writes = (await this.db.query<{ task_id: string; task_path: string; idx: number; payload: { channel: string; value: Encoded } }>(
      'SELECT task_id,task_path,idx,payload FROM agent_checkpoint_writes WHERE thread_id=$1 AND namespace=$2 AND checkpoint_id=$3', [row.thread_id, row.namespace, row.checkpoint_id])).rows;
    writes.sort((a, b) => compareWritesSortKeys(writesSortKey(a.task_path, a.task_id, a.idx), writesSortKey(b.task_path, b.task_id, b.idx)));
    return {
      config: this.config(row.thread_id, row.namespace, row.checkpoint_id),
      checkpoint: await this.decode(row.payload.checkpoint) as Checkpoint,
      metadata: await this.decode(row.payload.metadata) as CheckpointMetadata,
      parentConfig: row.parent_id ? this.config(row.thread_id, row.namespace, row.parent_id) : undefined,
      pendingWrites: await Promise.all(writes.map(async w => [w.task_id, w.payload.channel, await this.decode(w.payload.value)] as [string, string, unknown])),
    };
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const c = config.configurable; if (!c?.thread_id) return undefined;
    const row = (await this.db.query<Stored>(`SELECT * FROM agent_checkpoints WHERE thread_id=$1 AND namespace=$2
      ${c.checkpoint_id ? 'AND checkpoint_id=$3' : ''} ORDER BY checkpoint_id DESC LIMIT 1`, c.checkpoint_id ? [c.thread_id, c.checkpoint_ns ?? '', c.checkpoint_id] : [c.thread_id, c.checkpoint_ns ?? ''])).rows[0];
    return row ? this.tuple(row) : undefined;
  }
  async *list(config: RunnableConfig, options: CheckpointListOptions = {}): AsyncGenerator<CheckpointTuple> {
    const c = config.configurable; if (!c?.thread_id) return;
    const rows = (await this.db.query<Stored>(`SELECT * FROM agent_checkpoints WHERE thread_id=$1 AND namespace=$2
      AND ($3::text IS NULL OR checkpoint_id<$3) ORDER BY checkpoint_id DESC`, [c.thread_id, c.checkpoint_ns ?? '', options.before?.configurable?.checkpoint_id ?? null])).rows;
    let count = 0;
    for (const row of rows) {
      const tuple = await this.tuple(row);
      if (options.filter && !Object.entries(options.filter).every(([key, value]) => JSON.stringify((tuple.metadata as Record<string, unknown>)?.[key]) === JSON.stringify(value))) continue;
      if (options.limit !== undefined && count >= options.limit) break;
      yield tuple; count++;
    }
  }
  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions: ChannelVersions): Promise<RunnableConfig> {
    const c = config.configurable; if (!c?.thread_id) throw new Error('thread_id required');
    const payload = { checkpoint: await this.encode(checkpoint), metadata: await this.encode(metadata) };
    await this.db.query(`INSERT INTO agent_checkpoints(thread_id,namespace,checkpoint_id,parent_id,payload) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(thread_id,namespace,checkpoint_id) DO UPDATE SET payload=excluded.payload`, [c.thread_id, c.checkpoint_ns ?? '', checkpoint.id, c.checkpoint_id ?? null, JSON.stringify(payload)]);
    return this.config(c.thread_id, c.checkpoint_ns ?? '', checkpoint.id);
  }
  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string, taskPath = ''): Promise<void> {
    const c = config.configurable;
    if (!c?.thread_id || !c.checkpoint_id) throw new Error('checkpoint identity required');
    await this.db.transaction(async tx => {
      for (const [index, [channel, value]] of writes.entries()) {
        const idx = WRITES_IDX_MAP[channel] ?? index;
        const payload = { channel, value: await this.encode(value) };
        await tx.query(`INSERT INTO agent_checkpoint_writes(thread_id,namespace,checkpoint_id,task_id,task_path,idx,payload)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(thread_id,namespace,checkpoint_id,task_id,idx)
          ${idx < 0 ? 'DO UPDATE SET payload=excluded.payload,task_path=excluded.task_path' : 'DO NOTHING'}`, [c.thread_id, c.checkpoint_ns ?? '', c.checkpoint_id, taskId, taskPath, idx, JSON.stringify(payload)]);
      }
    });
  }
  async deleteThread(threadId: string): Promise<void> { await this.db.query('DELETE FROM agent_checkpoints WHERE thread_id=$1', [threadId]); }
}
