import type { ActorContext, Evidence, KnowledgeGateway, SearchQuery } from '../contracts.js';
import { requirePermission } from '../errors.js';
import type { Database } from './database.js';
export class SqlKnowledgeGateway implements KnowledgeGateway {
  constructor(private readonly db: Database) {}
  async search(ctx: ActorContext, query: SearchQuery): Promise<Evidence[]> {
    requirePermission(ctx, 'tickets:read');
    const terms = query.text.match(/[\p{L}\p{N}]{2,40}/gu)?.slice(0, 50); if (!terms?.length) return [];
    const limit = Math.max(1, Math.min(6, Math.floor(query.limit) || 6));
    const { rows } = await this.db.query<{ id: string; version: string; content: string; audience: 'public' | 'internal'; updated_at: Date }>(
      `SELECT id,version,content,audience,updated_at FROM knowledge_documents
       WHERE tenant_id=$1 AND active=true AND audience=$2 AND search_vector @@ websearch_to_tsquery('portuguese',$3)
       ORDER BY ts_rank(search_vector,websearch_to_tsquery('portuguese',$3)) DESC,id LIMIT $4`,
      [ctx.tenantId, query.audience, terms.join(' OR '), limit]);
    return rows.map(row => ({ id: `${row.id}:${row.version}`, documentId: row.id, documentVersion: row.version,
      passageId: `${row.id}:${row.version}`, excerpt: row.content.slice(0, 4000), audience: row.audience, updatedAt: new Date(row.updated_at).toISOString() }));
  }
}
