import type { JWTPayload, JWTVerifyOptions } from 'jose';

export interface VerifiedJwtUser { sub: string; role?: string; [key: string]: unknown; }

export interface JwtVerifier {
  verify(token: string, secret: string, options?: Pick<JWTVerifyOptions, 'issuer' | 'audience'>): Promise<VerifiedJwtUser>;
}

/** Isolates the ESM-first JOSE package from the CommonJS NestJS application. */
export class JoseJwtVerifier implements JwtVerifier {
  async verify(token: string, secret: string, options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}): Promise<VerifiedJwtUser> {
    const loadJose = new Function('return import("jose")') as () => Promise<typeof import('jose')>;
    const { jwtVerify } = await loadJose();
    const result = await jwtVerify<JWTPayload>(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      ...options,
    });
    if (typeof result.payload.sub !== 'string' || result.payload.sub.length === 0) throw new Error('JWT subject is missing');
    return result.payload as VerifiedJwtUser;
  }
}
