import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
export interface Database {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function openDatabase(options: { url?: string; path?: string } = {}): Promise<Database> {
  if (options.url) {
    const pool = new pg.Pool({ connectionString: options.url, max: 5, connectionTimeoutMillis: 10000 });
    const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
      query: async <T>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as T[] }),
      transaction: async fn => {
        const conn = 'connect' in client ? await (client as pg.Pool).connect() : client as pg.PoolClient;
        try { await conn.query('BEGIN'); const result = await fn(wrap(conn)); await conn.query('COMMIT'); return result; }
        catch (error) { await conn.query('ROLLBACK'); throw error; }
        finally { if ('connect' in client) conn.release(); }
      },
      close: async () => { if ('end' in client) await pool.end(); },
    });
    await pool.query('SELECT 1'); return wrap(pool);
  }
  const db = await PGlite.create(options.path);
  const wrap = (client: Pick<PGlite, 'query'>, tx = false): Database => ({
    query: async <T>(sql: string, params: unknown[] = []) => ({ rows: (await client.query<T>(sql, params)).rows }),
    transaction: async fn => tx ? fn(wrap(client, true)) : db.transaction(inner => fn(wrap(inner, true))),
    close: async () => { if (!tx) await db.close(); },
  });
  return wrap(db);
}
