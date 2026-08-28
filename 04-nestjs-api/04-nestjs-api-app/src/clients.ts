import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from './database';

/** User-context reads are deliberately a separate injectable boundary. */
@Injectable()
export class UserContextClient {
  constructor(private readonly db: DatabaseService) {}
  async queryAsUser<T extends QueryResultRow = QueryResultRow>(jwt: string, sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    if (!/^\s*select\b/i.test(sql)) throw new Error('UserContextClient permits SELECT statements only');
    const parts = jwt.split('.'); if (parts.length !== 3) throw new Error('Invalid user JWT');
    const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='), 'base64').toString('utf8')) as Record<string, unknown>;
    return this.db.transaction(async (client) => {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(claims)]);
      return client.query<T>(sql, values);
    });
  }
}

/** System client is server-only and must never be exposed to controllers/browser DTOs. */
@Injectable()
export class SystemClient {
  constructor(private readonly db: DatabaseService) {}
  query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<QueryResult<T>> { return this.db.query<T>(sql, values); }
  transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { return this.db.transaction(work); }
}
