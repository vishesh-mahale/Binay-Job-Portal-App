import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Injectable, NotFoundException, Optional, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsBoolean, IsEmail, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { InvitationTokenUtil } from './invitation-token.util';
import { setSessionCookies, SupabaseAuthProvider } from '../auth/auth-provider';
import type { AppConfig } from '../../infrastructure/config/config';

export class CreateCompanyInvitationDto {
  @Allow() @IsNotEmpty() @IsEmail() email!: string;
  @Allow() @IsOptional() @IsString() title?: string;
  @Allow() @IsOptional() @IsUUID() branch_id?: string;
  @Allow() @IsOptional() @IsUUID() department_id?: string;
  @Allow() @IsOptional() @IsUUID() team_id?: string;
  @Allow() @IsOptional() @IsBoolean() is_primary_hr?: boolean;
  @Allow() @IsOptional() @IsObject() permissions?: Record<string, unknown>;
}

export class SignupWithInviteDto {
  @Allow() @IsNotEmpty() @IsString() token!: string;
  @Allow() @IsNotEmpty() @IsString() @MinLength(6) password!: string;
  @Allow() @IsOptional() @IsString() full_name?: string;
}

type AuthReq = Request & { user?: RequestUser };

const INVITATION_PUBLIC_FIELDS = 'id, company_id, email, role, status, title, is_primary_hr, expires_at, created_at, updated_at';

import { OutboxWorkerService } from './outbox-worker';

@Injectable()
export class CompanyInvitationService {
  constructor(
    private readonly db: SystemClient,
    @Optional() @Inject(SupabaseAuthProvider) private readonly authProvider?: SupabaseAuthProvider,
    @Optional() @Inject('APP_CONFIG') private readonly config?: AppConfig,
    @Optional() @Inject(OutboxWorkerService) private readonly outboxWorker?: OutboxWorkerService,
  ) {}

  private async assertAdminOrOwner(client: any, actorUserId: string, companyId: string) {
    const r = await client.query(
      `SELECT id, name, verification_status, owner_id FROM public.companies WHERE id = $1 AND deleted_at IS NULL`,
      [companyId]
    );

    if (!r.rowCount) {
      throw new NotFoundException('NOT_FOUND');
    }

    const company = r.rows[0];
    if (company.verification_status !== 'verified') {
      throw new ForbiddenException('COMPANY_NOT_VERIFIED');
    }

    const isOwner = company.owner_id === actorUserId;

    if (!isOwner) {
      const userRes = await client.query(`SELECT role FROM public.users WHERE id = $1 AND deleted_at IS NULL`, [actorUserId]);
      const isPlatformAdmin = userRes.rows[0]?.role === 'admin';
      if (!isPlatformAdmin) {
        throw new ForbiddenException('INSUFFICIENT_PERMISSIONS');
      }
    }

    return company;
  }

  private async validateOrganizationReferences(client: any, cid: string, branchId?: string, departmentId?: string, teamId?: string) {
    const refs = await client.query(
      `SELECT
        ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM public.company_branches b WHERE b.id = $2 AND b.company_id = $1 AND b.is_active = true)) AS branch_ok,
        ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM public.departments d WHERE d.id = $3 AND d.company_id = $1 AND d.is_active = true)) AS department_ok,
        ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM public.teams t JOIN public.departments d ON d.id = t.department_id WHERE t.id = $4 AND d.company_id = $1 AND t.is_active = true AND d.is_active = true)) AS team_ok`,
      [cid, branchId ?? null, departmentId ?? null, teamId ?? null]
    );

    if (!refs.rows[0].branch_ok || !refs.rows[0].department_ok || !refs.rows[0].team_ok) {
      throw new BadRequestException('INVALID_ORGANIZATION_REFERENCE');
    }
  }

  private async internalCreateInvitation(client: any, actorUserId: string, companyId: string, dto: CreateCompanyInvitationDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const company = await this.assertAdminOrOwner(client, actorUserId, companyId);
    await this.validateOrganizationReferences(client, companyId, dto.branch_id, dto.department_id, dto.team_id);

    const existingUserCheck = await client.query(
      `SELECT id FROM public.users WHERE LOWER(email) = $1 AND deleted_at IS NULL`,
      [normalizedEmail]
    );
    if (existingUserCheck.rowCount) {
      throw new BadRequestException('EXISTING_USER_CANNOT_BE_INVITED');
    }

    const activeUserCheck = await client.query(
      `SELECT m.id, m.company_id
       FROM public.company_members m
       JOIN public.users u ON u.id = m.user_id
       WHERE LOWER(u.email) = $1 AND m.is_active = true`,
      [normalizedEmail]
    );
    if (activeUserCheck.rowCount) {
      throw new BadRequestException('USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE');
    }

    await client.query(
      `UPDATE public.company_invitations
       SET status = 'expired', updated_at = NOW()
       WHERE company_id = $1 AND LOWER(email) = $2 AND status = 'pending' AND expires_at <= NOW()`,
      [companyId, normalizedEmail]
    );

    const existingPending = await client.query(
      `SELECT id FROM public.company_invitations
       WHERE company_id = $1 AND LOWER(email) = $2 AND status = 'pending' AND expires_at > NOW()
       FOR UPDATE`,
      [companyId, normalizedEmail]
    );
    if (existingPending.rowCount) {
      throw new BadRequestException('PENDING_INVITATION_ALREADY_EXISTS');
    }

    const { rawToken, tokenHash } = InvitationTokenUtil.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invRes = await client.query(
      `INSERT INTO public.company_invitations (
        company_id, email, invited_by_user_id, role, token_hash, status,
        branch_id, department_id, team_id, title, permissions, is_primary_hr, expires_at
      ) VALUES ($1, $2, $3, 'hr', $4, 'pending', $5, $6, $7, $8, $9, $10, $11)
      RETURNING ${INVITATION_PUBLIC_FIELDS}`,
      [
        companyId,
        normalizedEmail,
        actorUserId,
        tokenHash,
        dto.branch_id ?? null,
        dto.department_id ?? null,
        dto.team_id ?? null,
        dto.title ?? null,
        dto.permissions ? JSON.stringify(dto.permissions) : '{}',
        dto.is_primary_hr ?? false,
        expiresAt,
      ]
    );

    const invitation = invRes.rows[0];

    const outboxPayload = InvitationTokenUtil.encryptPayload({
      invitation_id: invitation.id,
      company_id: companyId,
      company_name: company.name,
      email: normalizedEmail,
      raw_token: rawToken,
      title: dto.title,
    });

    await client.query(
      `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, status)
       VALUES ('invitation.created', 'company_invitation', $1, $2::jsonb, 'pending')`,
      [invitation.id, JSON.stringify(outboxPayload)]
    );

    await client.query(
      `INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1::uuid, $2::uuid, 'invitation.created', 'company_invitation', $3::uuid, jsonb_build_object('email', $4::text, 'role', 'hr'))`,
      [companyId, actorUserId, invitation.id, normalizedEmail]
    );

    return invitation;
  }

  async createInvitation(actorUserId: string, companyId: string, dto: CreateCompanyInvitationDto) {
    const inv = await this.db.transaction(async (client) => {
      return this.internalCreateInvitation(client, actorUserId, companyId, dto);
    });

    // Event-driven trigger: Instantly deliver email without any periodic DB polling loop!
    if (this.outboxWorker) {
      setImmediate(() => this.outboxWorker?.processPendingInvitations().catch(() => {}));
    }

    return inv;
  }

  async getCompanyInvitations(actorUserId: string, companyId: string) {
    return this.db.transaction(async (client) => {
      await this.assertAdminOrOwner(client, actorUserId, companyId);

      const res = await client.query(
        `SELECT id, company_id, email, role, status, branch_id, department_id, team_id,
                title, is_primary_hr, expires_at, created_at, updated_at
         FROM public.company_invitations
         WHERE company_id = $1
         ORDER BY created_at DESC`,
        [companyId]
      );

      return res.rows;
    });
  }

  async verifyInvitation(rawToken: string) {
    if (!rawToken || !rawToken.trim()) {
      throw new BadRequestException('TOKEN_REQUIRED');
    }

    const tokenHash = InvitationTokenUtil.hashToken(rawToken);

    return this.db.transaction(async (client) => {
      const res = await client.query(
        `SELECT i.id, i.company_id, i.email, i.role, i.status, i.title, i.expires_at,
                c.name as company_name, c.slug as company_slug, c.logo_path
         FROM public.company_invitations i
         JOIN public.companies c ON c.id = i.company_id
         WHERE i.token_hash = $1 AND c.deleted_at IS NULL`,
        [tokenHash]
      );

      if (!res.rowCount) {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }

      const inv = res.rows[0];

      if (inv.status === 'revoked') {
        throw new BadRequestException('INVITATION_REVOKED');
      }

      if (inv.status === 'accepted') {
        throw new BadRequestException('INVITATION_ALREADY_ACCEPTED');
      }

      if (inv.status === 'expired' || new Date(inv.expires_at) <= new Date()) {
        throw new BadRequestException('INVITATION_EXPIRED');
      }

      const userLookup = await client.query(`SELECT id FROM public.users WHERE LOWER(email) = $1 AND deleted_at IS NULL`, [inv.email.toLowerCase()]);
      const isExistingUser = !!userLookup.rowCount;

      return {
        id: inv.id,
        company_id: inv.company_id,
        company_name: inv.company_name,
        company_slug: inv.company_slug,
        company_logo: inv.logo_path,
        email: inv.email,
        role: inv.role,
        title: inv.title,
        status: 'pending',
        expires_at: inv.expires_at,
        is_existing_user: isExistingUser,
      };
    });
  }

  async revokeInvitation(actorUserId: string, companyId: string, invitationId: string, reason?: string) {
    return this.db.transaction(async (client) => {
      await this.assertAdminOrOwner(client, actorUserId, companyId);

      const invCheck = await client.query(
        `SELECT id, status FROM public.company_invitations
         WHERE id = $1 AND company_id = $2 FOR UPDATE`,
        [invitationId, companyId]
      );

      if (!invCheck.rowCount) {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }

      const inv = invCheck.rows[0];
      if (inv.status === 'accepted') {
        throw new BadRequestException('CANNOT_REVOKE_ACCEPTED_INVITATION');
      }

      if (inv.status === 'revoked') {
        throw new BadRequestException('INVITATION_ALREADY_REVOKED');
      }

      const res = await client.query(
        `UPDATE public.company_invitations
         SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $3, revoke_reason = $4, updated_at = NOW()
         WHERE id = $1 AND company_id = $2
         RETURNING ${INVITATION_PUBLIC_FIELDS}`,
        [invitationId, companyId, actorUserId, reason ?? 'Revoked by owner/admin']
      );

      await client.query(
        `INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, old_values, new_values)
         VALUES ($1::uuid, $2::uuid, 'invitation.revoked', 'company_invitation', $3::uuid, jsonb_build_object('status', $4::text), jsonb_build_object('status', 'revoked'))`,
        [companyId, actorUserId, invitationId, inv.status]
      );

      return res.rows[0];
    });
  }

  async resendInvitation(actorUserId: string, companyId: string, invitationId: string) {
    return this.db.transaction(async (client) => {
      await this.assertAdminOrOwner(client, actorUserId, companyId);

      const oldInv = await client.query(
        `SELECT * FROM public.company_invitations WHERE id = $1 AND company_id = $2 FOR UPDATE`,
        [invitationId, companyId]
      );

      if (!oldInv.rowCount) {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }

      const targetEmail = oldInv.rows[0].email;
      if (oldInv.rows[0].status === 'pending') {
        await client.query(
          `UPDATE public.company_invitations SET status = 'revoked', revoked_at = NOW(), revoked_by_user_id = $3, revoke_reason = 'Superceded by resend' WHERE id = $1`,
          [invitationId, companyId, actorUserId]
        );
      }

      return this.internalCreateInvitation(client, actorUserId, companyId, {
        email: targetEmail,
        title: oldInv.rows[0].title,
        branch_id: oldInv.rows[0].branch_id,
        department_id: oldInv.rows[0].department_id,
        team_id: oldInv.rows[0].team_id,
        is_primary_hr: oldInv.rows[0].is_primary_hr,
        permissions: oldInv.rows[0].permissions,
      });
    });
  }

  async internalAcceptInvitation(client: any, userId: string, authenticatedEmail: string, rawToken: string) {
    const tokenHash = InvitationTokenUtil.hashToken(rawToken);

    const invRes = await client.query(
      `SELECT * FROM public.company_invitations WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    );

    if (!invRes.rowCount) {
      throw new NotFoundException('INVITATION_NOT_FOUND');
    }

    const inv = invRes.rows[0];

    // Replay Check Ordering rule: Check invitation.status FIRST!
    if (inv.status === 'accepted') {
      throw new BadRequestException('INVITATION_ALREADY_ACCEPTED');
    }

    if (inv.status === 'revoked') {
      throw new BadRequestException('INVITATION_REVOKED');
    }

    if (inv.status === 'expired' || new Date(inv.expires_at) <= new Date()) {
      throw new BadRequestException('INVITATION_EXPIRED');
    }

    // Authenticated email binding validation (Case-insensitive)
    if (inv.email.trim().toLowerCase() !== authenticatedEmail.trim().toLowerCase()) {
      throw new BadRequestException('EMAIL_MISMATCH');
    }

    const activeAppsRes = await client.query(
      `SELECT COUNT(*) FROM public.job_applications ja
       JOIN public.candidate_profiles cp ON ja.candidate_id = cp.id
       WHERE cp.user_id = $1 AND ja.deleted_at IS NULL
         AND ja.status IN ('applied','under_review','shortlisted','screening','interview_scheduled','interview_completed','selected','offer_extended','on_hold')`,
      [userId]
    );

    if (parseInt(activeAppsRes.rows[0].count, 10) > 0) {
      throw new BadRequestException('CANDIDATE_HAS_ACTIVE_APPLICATIONS');
    }

    const activeMemRes = await client.query(
      `SELECT 1 FROM public.company_members WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    if (activeMemRes.rowCount) {
      throw new BadRequestException('USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE');
    }

    await client.query(
      `UPDATE public.users SET role = 'hr', updated_at = NOW() WHERE id = $1`,
      [userId]
    );

    // Sanitize organization references in case a branch/department/team was deleted/deactivated after invitation creation
    const validBranch = inv.branch_id ? await client.query('SELECT 1 FROM public.company_branches WHERE id = $1 AND company_id = $2 AND is_active = true', [inv.branch_id, inv.company_id]) : null;
    const validDept = inv.department_id ? await client.query('SELECT 1 FROM public.departments WHERE id = $1 AND company_id = $2 AND is_active = true', [inv.department_id, inv.company_id]) : null;
    const validTeam = inv.team_id ? await client.query('SELECT 1 FROM public.teams t JOIN public.departments d ON d.id = t.department_id WHERE t.id = $1 AND d.company_id = $2 AND t.is_active = true', [inv.team_id, inv.company_id]) : null;

    const finalBranchId = validBranch?.rowCount ? inv.branch_id : null;
    const finalDepartmentId = validDept?.rowCount ? inv.department_id : null;
    const finalTeamId = validTeam?.rowCount ? inv.team_id : null;

    const existingMem = await client.query(
      `SELECT id FROM public.company_members WHERE company_id = $1 AND user_id = $2 FOR UPDATE`,
      [inv.company_id, userId]
    );

    let memberId: string;
    if (existingMem.rowCount) {
      memberId = existingMem.rows[0].id;
      await client.query(
        `UPDATE public.company_members
         SET is_active = true, joined_at = NOW(), left_at = NULL,
             branch_id = $1, department_id = $2, team_id = $3, title = $4,
             is_primary_hr = $5, permissions = $6, updated_at = NOW()
         WHERE id = $7`,
        [finalBranchId, finalDepartmentId, finalTeamId, inv.title, inv.is_primary_hr, inv.permissions, memberId]
      );
    } else {
      const newMem = await client.query(
        `INSERT INTO public.company_members (
          company_id, user_id, is_active, joined_at, branch_id, department_id, team_id,
          title, is_primary_hr, permissions
        ) VALUES ($1, $2, true, NOW(), $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [inv.company_id, userId, finalBranchId, finalDepartmentId, finalTeamId, inv.title, inv.is_primary_hr, inv.permissions]
      );
      memberId = newMem.rows[0].id;
    }

    await client.query(
      `UPDATE public.company_invitations
       SET status = 'accepted', accepted_at = NOW(), accepted_by_user_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [inv.id, userId]
    );

    await client.query(
      `INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, new_values)
       VALUES ($1::uuid, $2::uuid, 'invitation.accepted', 'company_invitation', $3::uuid, jsonb_build_object('user_id', $2::uuid, 'status', 'accepted'))`,
      [inv.company_id, userId, inv.id]
    );

    const companyRes = await client.query(
      `SELECT id, name, slug FROM public.companies WHERE id = $1`,
      [inv.company_id]
    );

    return {
      invitation_id: inv.id,
      company: companyRes.rows[0],
    };
  }

  async prevalidateToken(rawToken: string) {
    if (!rawToken || !rawToken.trim()) {
      throw new BadRequestException('TOKEN_REQUIRED');
    }

    const tokenHash = InvitationTokenUtil.hashToken(rawToken);

    return this.db.transaction(async (client) => {
      const invRes = await client.query(
        `SELECT id, email, status, expires_at FROM public.company_invitations WHERE token_hash = $1`,
        [tokenHash]
      );

      if (!invRes.rowCount) {
        throw new NotFoundException('INVITATION_NOT_FOUND');
      }

      const inv = invRes.rows[0];

      if (inv.status === 'accepted') {
        throw new BadRequestException('INVITATION_ALREADY_ACCEPTED');
      }
      if (inv.status === 'revoked') {
        throw new BadRequestException('INVITATION_REVOKED');
      }
      if (inv.status === 'expired' || new Date(inv.expires_at) <= new Date()) {
        throw new BadRequestException('INVITATION_EXPIRED');
      }

      return inv;
    });
  }

  async signupWithInvite(dto: SignupWithInviteDto, res: Response) {
    const normalizedToken = dto.token.trim();

    // Step 1: Pre-validate token
    const pendingInv = await this.prevalidateToken(normalizedToken);
    const targetEmail = pendingInv.email.trim().toLowerCase();

    // Step 2: Unregistered Email Enforcement - existing registered users cannot accept HR invitations!
    const existingUser = await this.db.transaction(async (client) => {
      const r = await client.query(`SELECT id FROM public.users WHERE LOWER(email) = $1 AND deleted_at IS NULL`, [targetEmail]);
      return r.rowCount ? r.rows[0].id : null;
    });

    if (existingUser) {
      throw new BadRequestException('EXISTING_USER_CANNOT_BE_INVITED');
    }

    // Step 3: Out-of-transaction Supabase Auth provisioning for NEW user
    let userId: string;
    const secretKey = this.config?.SUPABASE_SECRET_KEY || this.config?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    const supabaseUrl = this.config?.SUPABASE_URL || process.env.SUPABASE_URL;

    if (secretKey && supabaseUrl) {
      const createRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          password: dto.password,
          email_confirm: true,
          user_metadata: { full_name: dto.full_name, application_role: 'candidate' },
          app_metadata: { application_role: 'candidate' },
        }),
      });

      if (createRes.ok) {
        const supabaseUser = await createRes.json();
        userId = supabaseUser.id;
      } else {
        const errBody = await createRes.json().catch(() => ({}));
        console.error('[SignupWithInvite] Supabase Admin create user failed:', createRes.status, errBody);

        const lookupRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users?email=${encodeURIComponent(targetEmail)}`, {
          headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
        });
        const rawUsers = await lookupRes.json().catch(() => ({}));
        const usersList = Array.isArray(rawUsers) ? rawUsers : (Array.isArray(rawUsers?.users) ? rawUsers.users : []);

        if (usersList.length > 0) {
          // Existing accounts are outside the invite-first flow and must never
          // be converted or attached through an invitation.
          throw new BadRequestException('EXISTING_USER_CANNOT_BE_INVITED');
        } else {
          const detailMsg = errBody?.msg || errBody?.message || errBody?.error_description;
          throw new BadRequestException(detailMsg ? `SUPABASE_ERROR: ${detailMsg}` : 'SUPABASE_ACCOUNT_PROVISIONING_FAILED');
        }
      }
    } else {
      throw new BadRequestException('SUPABASE_NOT_CONFIGURED');
    }

    // Step 4: Single atomic PostgreSQL DB acceptance transaction
    let acceptResult: any;
    try {
      acceptResult = await this.db.transaction(async (client) => {
        const existingAccountCheck = await client.query(
          `SELECT id FROM public.users WHERE LOWER(email) = $1 AND id != $2 AND deleted_at IS NULL`,
          [targetEmail, userId]
        );
        if (existingAccountCheck.rowCount) {
          throw new BadRequestException('EXISTING_USER_CANNOT_BE_INVITED');
        }

        const dbUser = await client.query(`SELECT id FROM public.users WHERE id = $1`, [userId]);
        if (!dbUser.rowCount) {
          await client.query(
            `INSERT INTO public.users (id, email, full_name, role, status) VALUES ($1, $2, $3, 'candidate', 'active')`,
            [userId, targetEmail, dto.full_name || 'HR Invitee']
          );
        }

        return this.internalAcceptInvitation(client, userId, targetEmail, normalizedToken);
      });
    } catch (err) {
      throw err;
    }

    // Step 5: Server-side password sign-in & HttpOnly cookie set using existing setSessionCookies helper!
    try {
      if (this.authProvider) {
        const authSession = await this.authProvider.login({ email: targetEmail, password: dto.password });
        if (authSession.accessToken) {
          const secure = process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test';
          setSessionCookies(res, authSession, secure);

          return res.status(201).json({
            statusCode: 201,
            data: {
              is_accepted: true,
              requires_login: false,
              user: {
                id: userId,
                email: targetEmail,
                full_name: dto.full_name || 'HR Invitee',
                role: 'hr',
              },
              company: acceptResult.company,
            },
          });
        }
      }
    } catch {
      return res.status(200).json({
        statusCode: 200,
        data: {
          is_accepted: true,
          requires_login: true,
          message: 'Account created and company invitation accepted! Please log in to reach your HR Dashboard.',
        },
      });
    }

    return res.status(200).json({
      statusCode: 200,
      data: {
        is_accepted: true,
        requires_login: true,
        message: 'Account created and company invitation accepted! Please log in to reach your HR Dashboard.',
      },
    });
  }
}

@Controller('api/v1')
export class CompanyInvitationController {
  constructor(private readonly invitationService: CompanyInvitationService) {}

  @Get('invitations/verify')
  async verifyInvitation(@Query('token') token: string) {
    const data = await this.invitationService.verifyInvitation(token);
    return { statusCode: 200, data };
  }

  @Get('companies/:companyId/invitations')
  @UseGuards(AuthGuard)
  async getCompanyInvitations(@Req() req: AuthReq, @Param('companyId') companyId: string) {
    if (!req.user?.sub) throw new ForbiddenException('UNAUTHORIZED');
    const data = await this.invitationService.getCompanyInvitations(req.user.sub, companyId);
    return { statusCode: 200, data };
  }

  @Post('companies/:companyId/invitations')
  @UseGuards(AuthGuard)
  async createInvitation(@Req() req: AuthReq, @Param('companyId') companyId: string, @Body() dto: CreateCompanyInvitationDto) {
    if (!req.user?.sub) throw new ForbiddenException('UNAUTHORIZED');
    const data = await this.invitationService.createInvitation(req.user.sub, companyId, dto);
    return { statusCode: 201, data };
  }

  @Delete('companies/:companyId/invitations/:invitationId')
  @UseGuards(AuthGuard)
  async revokeInvitation(@Req() req: AuthReq, @Param('companyId') companyId: string, @Param('invitationId') invitationId: string, @Body('reason') reason?: string) {
    if (!req.user?.sub) throw new ForbiddenException('UNAUTHORIZED');
    const data = await this.invitationService.revokeInvitation(req.user.sub, companyId, invitationId, reason);
    return { statusCode: 200, data };
  }

  @Post('companies/:companyId/invitations/:invitationId/resend')
  @UseGuards(AuthGuard)
  async resendInvitation(@Req() req: AuthReq, @Param('companyId') companyId: string, @Param('invitationId') invitationId: string) {
    if (!req.user?.sub) throw new ForbiddenException('UNAUTHORIZED');
    const data = await this.invitationService.resendInvitation(req.user.sub, companyId, invitationId);
    return { statusCode: 201, data };
  }

  @Post('auth/signup-with-invite')
  async signupWithInvite(@Body() dto: SignupWithInviteDto, @Res() res: Response) {
    return this.invitationService.signupWithInvite(dto, res);
  }
}
