import { TicketSchema, type ActorContext, type TicketGateway, type TicketSnapshot } from '../contracts.js';
import { AppError, requirePermission } from '../errors.js';
import type { Database } from './database.js';
export class SqlTicketGateway implements TicketGateway {
  constructor(private readonly db: Database) {}
  async getSnapshot(ctx: ActorContext, ticketId: string): Promise<TicketSnapshot> {
    requirePermission(ctx, 'tickets:read');
    const { rows } = await this.db.query<{ snapshot: unknown; version: number }>('SELECT snapshot,version FROM demo_tickets WHERE tenant_id=$1 AND id=$2', [ctx.tenantId, ticketId]);
    const row = rows[0]; if (!row) throw new AppError('NOT_FOUND', 404);
    const snapshot = TicketSchema.parse(row.snapshot);
    if (snapshot.tenantId !== ctx.tenantId || snapshot.id !== ticketId) throw new AppError('NOT_FOUND', 404);
    return { ...snapshot, version: row.version };
  }
  async isCurrent(ctx: ActorContext, ticketId: string, version: number): Promise<boolean> { return (await this.getSnapshot(ctx, ticketId)).version === version; }
  async list(ctx: ActorContext): Promise<{ id: string; subject: string; version: number }[]> {
    requirePermission(ctx, 'tickets:read');
    const { rows } = await this.db.query<{ id: string; subject: string; version: number }>("SELECT id,snapshot->>'subject' AS subject,version FROM demo_tickets WHERE tenant_id=$1 ORDER BY id", [ctx.tenantId]); return rows;
  }
}
