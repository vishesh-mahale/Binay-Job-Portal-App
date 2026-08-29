import { Injectable } from '@nestjs/common';

export type StoredObject = { bucket: string; path: string; checksum_sha256: string; size_bytes: number };

/** Server-only boundary for private document storage. Controllers must not receive credentials. */
export abstract class StorageAdapter {
  abstract put(bucket: string, path: string, body: Buffer, contentType: string): Promise<void>;
  abstract remove(bucket: string, path: string): Promise<void>;
}

/** Supabase Storage adapter using the server-only service-role credential at runtime. */
@Injectable()
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly baseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  private readonly serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  private headers(contentType?: string): Record<string, string> {
    if (!this.baseUrl || !this.serviceKey) throw new Error('STORAGE_NOT_CONFIGURED');
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...(contentType ? { 'Content-Type': contentType } : {}) };
  }

  async put(bucket: string, path: string, body: Buffer, contentType: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: this.headers(contentType), body: new Uint8Array(body),
    });
    if (!response.ok) throw new Error(`STORAGE_WRITE_FAILED:${response.status}`);
  }

  async remove(bucket: string, path: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: 'DELETE', headers: { ...this.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok) throw new Error(`STORAGE_DELETE_FAILED:${response.status}`);
  }
}