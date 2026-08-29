import { BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth';
import { UserContextClient, SystemClient } from './clients';
import { Allow } from 'class-validator';

export class RevokePresenceSessionDto {
  @Allow() session_id!: string;
}


@Injectable()
export class IdentityService {
  constructor(private readonly userClient: UserContextClient, private readonly system: SystemClient) {}

  async me(request: AuthenticatedRequest) {
    const token = request.rawAccessToken ?? '';
    const result = await this.userClient.queryAsUser(token, `
      SELECT id, email, first_name, middle_name, last_name, display_name, phone,
             avatar_path, role, status
      FROM public.users
      WHERE id = $1 AND deleted_at IS NULL
    `, [request.user?.sub]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0];
  }

  async sessions(userId: string) {
    const result = await this.system.query(`
      SELECT id, socket_id, device_type, user_agent, last_seen_at,
             is_online, created_at, updated_at
      FROM public.user_sessions WHERE user_id = $1 ORDER BY updated_at DESC
    `, [userId]);
    return result.rows;
  }

  async revoke(userId: string, sessionId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }
    const result = await this.system.query(`
      UPDATE public.user_sessions SET is_online = false, socket_id = NULL, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, socket_id, device_type, user_agent, last_seen_at, is_online, created_at, updated_at
    `, [sessionId, userId]);
    if (!result.rows[0]) throw new NotFoundException('NOT_FOUND');
    return result.rows[0];
  }
}

@Controller('api/v1/auth')
@UseGuards(AuthGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get('me')
  async me(@Req() request: AuthenticatedRequest) { return this.identity.me(request); }

  @Get('sessions')
  async sessions(@Req() request: AuthenticatedRequest) { return this.identity.sessions(request.user!.sub); }

  @Post('sessions/revoke')
  async revoke(@Req() request: AuthenticatedRequest, @Body() body: RevokePresenceSessionDto) {
    return this.identity.revoke(request.user!.sub, body.session_id);
  }
}
