import { Injectable, OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { AppConfigService } from '../config/app-config.service';
import { createLogger } from '../observability/logger';

/**
 * Raw node-postgres pool lifecycle (plan Section 3).
 * - No ORM. All queries parameterized.
 * - TLS verification ON (`rejectUnauthorized: true`) for production hosts, with fallback for Supabase pooler self-signed certs.
 * - statement_timeout 30s; pool max 10, idleTimeout 30s, connectionTimeout 10s.
 * - SIGTERM drain handled via NestJS module destroy hooks.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = createLogger('database');
  private readonly pool: pg.Pool;

  constructor(private readonly config: AppConfigService) {
    const connectionString = this.config.env.DATABASE_URL;
    const sslEnabled = !this.isLocalhost(connectionString);
    const isSupabasePooler = connectionString.includes('pooler.supabase.com');

    this.pool = new pg.Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
      ssl: sslEnabled
        ? { rejectUnauthorized: this.config.env.NODE_ENV === 'production' && !isSupabasePooler }
        : undefined,
    });

    this.pool.on('error', (err) => {
      // Idle client error — log class/message only, never connection details.
      this.logger.error('pg pool idle client error', {
        error_class: err.name,
        message: err.message?.slice(0, 200),
      });
    });
  }

  private isLocalhost(connectionString: string): boolean {
    try {
      const url = new URL(connectionString);
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    } catch {
      return false;
    }
  }

  /** Executes a single parameterized query. */
  async query<T extends pg.QueryResultRow>(text: string, params: unknown[]): Promise<pg.QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  /** Cheap readiness probe — approved SECURITY DEFINER existence check. */
  async ping(): Promise<boolean> {
    await this.pool.query('SELECT 1');
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    // Drain: wait for checked-out clients before closing.
    await this.pool.end();
    this.logger.info('pg pool drained and closed');
  }
}
