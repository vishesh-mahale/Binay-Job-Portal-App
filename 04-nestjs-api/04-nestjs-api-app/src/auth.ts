import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { JoseJwtVerifier, type JwtVerifier, type VerifiedJwtUser } from './security/jwt-verifier';
import type { JWTVerifyOptions } from 'jose';

export type RequestUser = VerifiedJwtUser;
export type AuthenticatedRequest = Request & { user?: RequestUser; rawAccessToken?: string; cookies?: Record<string, string> };
export async function verifyBearer(request: Request, secret: string, verifier: JwtVerifier = new JoseJwtVerifier(), options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}): Promise<RequestUser> {
  const cookieToken = (request as Request & { cookies?: Record<string, string> }).cookies?.binay_access_token;
  const header = request.header('authorization');
  const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = cookieToken || headerToken;
  if (!token) throw new UnauthorizedException('UNAUTHORIZED');
  try { return await verifier.verify(token, secret, options); }
  catch { throw new UnauthorizedException('UNAUTHORIZED'); }
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly secret: string, private readonly verifier: JwtVerifier = new JoseJwtVerifier(), private readonly options: Pick<JWTVerifyOptions, 'issuer' | 'audience'> = {}) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieToken = req.cookies?.binay_access_token;
    const header = req.header('authorization');
    const headerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    req.rawAccessToken = cookieToken || headerToken;
    req.user = await verifyBearer(req, this.secret, this.verifier, this.options);
    return true;
  }
}
