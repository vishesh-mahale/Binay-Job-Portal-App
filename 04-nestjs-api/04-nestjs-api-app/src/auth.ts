import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JoseJwtVerifier, type JwtVerifier, type JwtVerificationKey, type VerifiedJwtUser } from './security/jwt-verifier';
import type { JWTVerifyOptions } from 'jose';

import { SystemClient } from './clients';

export type RequestUser = VerifiedJwtUser;
export type AuthenticatedRequest = Request & { user?: RequestUser; rawAccessToken?: string; cookies?: Record<string, string> };
export async function verifyBearer(request: Request, key: JwtVerificationKey, verifier: JwtVerifier = new JoseJwtVerifier(), options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}): Promise<RequestUser> {
  const cookieToken = (request as Request & { cookies?: Record<string, string> }).cookies?.binay_access_token;
  const header = request.header('authorization');
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = cookieToken || headerToken;
  if (!token) throw new UnauthorizedException('UNAUTHORIZED');
  try { return await verifier.verify(token, key, options); }
  catch { throw new UnauthorizedException('UNAUTHORIZED'); }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly key: JwtVerificationKey, private readonly verifier: JwtVerifier = new JoseJwtVerifier(), private readonly options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}, private readonly system?: SystemClient) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieToken = req.cookies?.binay_access_token;
    const header = req.header('authorization');
    const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.rawAccessToken = cookieToken || headerToken;
    req.user = await verifyBearer(req, this.key, this.verifier, this.options);
    if (this.system && req.user?.sub) {
      const dbCheck = await this.system.query<{ status: string; deleted_at: string | null; locked_until: string | null }>(
        'SELECT status, deleted_at, locked_until FROM public.users WHERE id = $1',
        [req.user.sub]
      );
      const user = dbCheck.rows[0];
      if (!user || user.deleted_at || user.status !== 'active' || (user.locked_until && new Date(user.locked_until).getTime() > Date.now())) {
        throw new UnauthorizedException('UNAUTHORIZED');
      }
    }
    return true;
  }
}
