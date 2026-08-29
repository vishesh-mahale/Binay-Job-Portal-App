import { Global, Module } from '@nestjs/common';
import { loadConfig } from './config/config';
import { DatabaseService } from './database/database';
import { UserContextClient, SystemClient } from './database/clients';
import { StorageAdapter, SupabaseStorageAdapter } from './storage/storage';
import { AuthGuard } from '../modules/auth/auth';
import { JoseJwtVerifier } from '../security/jwt-verifier';
import { SupabaseAuthProvider } from '../modules/auth/auth-provider';
import { AuthAuditService } from '../modules/auth/auth-audit';

const config = loadConfig();
const jwtKey = config.SUPABASE_JWKS_URL
  ? { jwksUrl: config.SUPABASE_JWKS_URL }
  : config.SUPABASE_URL
    ? { jwksUrl: `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` }
    : config.SUPABASE_JWT_SECRET!;

@Global()
@Module({
  providers: [
    { provide: 'APP_CONFIG', useValue: config },
    { provide: DatabaseService, useFactory: () => new DatabaseService(config) },
    { provide: 'JWT_VERIFICATION_KEY', useValue: jwtKey },
    { provide: 'JWT_VERIFIER', useFactory: () => new JoseJwtVerifier() },
    { provide: 'JWT_OPTIONS', useValue: { issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE } },
    AuthGuard,
    { provide: SupabaseAuthProvider, useFactory: () => new SupabaseAuthProvider(config) },
    { provide: StorageAdapter, useClass: SupabaseStorageAdapter },
    UserContextClient,
    SystemClient,
    AuthAuditService,
  ],
  exports: [DatabaseService, UserContextClient, SystemClient, StorageAdapter, AuthGuard, SupabaseAuthProvider, AuthAuditService],
})
export class CoreModule {}
