import type { JWTPayload, JWTVerifyOptions } from 'jose';

export interface VerifiedJwtUser { sub: string; role?: string; [key: string]: unknown; }

/** Verification material. A URL selects Supabase's asymmetric JWKS; a string is
 * retained only for explicitly configured legacy HS256 projects. */
export type JwtVerificationKey = string | { jwksUrl: string };

export interface JwtVerifier {
  verify(token: string, key: JwtVerificationKey, options?: Pick<JWTVerifyOptions, 'issuer' | 'audience'>): Promise<VerifiedJwtUser>;
}

/** Isolates the ESM-first JOSE package from the CommonJS NestJS application. */
export class JoseJwtVerifier implements JwtVerifier {
  async verify(token: string, key: JwtVerificationKey, options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}): Promise<VerifiedJwtUser> {
    const loadJose = new Function('return import("jose")') as () => Promise<typeof import('jose')>;
    const { jwtVerify, createRemoteJWKSet } = await loadJose();
    const isJwks = typeof key !== 'string';
    const verificationKey = isJwks
      ? createRemoteJWKSet(new URL(key.jwksUrl))
      : new TextEncoder().encode(key);
    const result = await jwtVerify<JWTPayload>(token, verificationKey, {
      algorithms: isJwks ? ['ES256', 'RS256'] : ['HS256'],
      ...options,
    });
    if (typeof result.payload.sub !== 'string' || result.payload.sub.length === 0) throw new Error('JWT subject is missing');
    return result.payload as VerifiedJwtUser;
  }
}
