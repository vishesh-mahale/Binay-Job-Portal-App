import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { AppConfig } from '../config/config';

export const USER_CONTEXT_CLIENT = Symbol('USER_CONTEXT_CLIENT');
export const SYSTEM_CLIENT = Symbol('SYSTEM_CLIENT');

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  constructor(private readonly config: AppConfig) { this.pool = new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, application_name: 'binay-nestjs-api' }); this.pool.on('error', () => { /* keep idle-client errors from terminating the process */ }); }
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<T>> { return this.pool.query<T>(text, values); }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> { const c = await this.pool.connect(); try { await c.query('BEGIN'); const result = await work(c); await c.query('COMMIT'); return result; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
  async onModuleDestroy(): Promise<void> { await this.pool.end(); }
}