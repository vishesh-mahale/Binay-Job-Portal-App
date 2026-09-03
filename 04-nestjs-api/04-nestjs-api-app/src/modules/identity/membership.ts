import { BadRequestException, Body, Controller, ForbiddenException, Injectable, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsBoolean, IsEmail, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class AddCompanyMemberDto {
  @Allow() @IsOptional() @IsUUID() user_id?: string;
  @Allow() @IsOptional() @IsEmail() email?: string;
  @Allow() @IsOptional() @IsUUID() branch_id?: string;
  @Allow() @IsOptional() @IsUUID() department_id?: string;
  @Allow() @IsOptional() @IsUUID() team_id?: string;
  @Allow() @IsOptional() @IsUUID() manager_member_id?: string;
  @Allow() @IsOptional() @IsString() title?: string;
  @Allow() @IsOptional() @IsString() employee_code?: string;
  @Allow() @IsOptional() @IsBoolean() is_primary_hr?: boolean;
  @Allow() @IsOptional() @IsObject() permissions?: Record<string, unknown>;
  @Allow() @IsOptional() @IsString() employment_type?: string;
  @Allow() @IsOptional() @IsString() work_email?: string;
  @Allow() @IsOptional() @IsString() work_phone?: string;
}

type AuthReq = Request & { user?: RequestUser };
const MEMBER_RESPONSE_FIELDS = 'id,company_id,user_id,branch_id,department_id,team_id,manager_member_id,title,is_primary_hr,is_active,invited_at,invited_by,joined_at,left_at,employment_status,created_at,updated_at';

@Injectable()
export class MembershipService {
  constructor(private readonly db: SystemClient) {}

  private async audit(client: any, companyId: string, actorId: string, targetId: string, action: string, entityId: string, oldValues: unknown, newValues: unknown) {
    const oldJson = oldValues !== undefined && oldValues !== null ? JSON.stringify(oldValues) : '{}';
    const newJson = newValues !== undefined && newValues !== null ? JSON.stringify(newValues) : '{}';
    await client.query(
      `INSERT INTO public.audit_logs (company_id,user_id,target_user_id,action,entity_type,entity_id,old_values,new_values,changes) VALUES ($1,$2,$3,$4,'company_member',$5,$6::jsonb,$7::jsonb,jsonb_build_object('membership',jsonb_build_object('old',$6::jsonb,'new',$7::jsonb)))`,
      [companyId, actorId, targetId, action, entityId, oldJson, newJson]
    );
  }

  private async assertAdmin(client: any, uid: string, cid: string) {
    const r = await client.query(
      `SELECT 1 FROM public.companies c WHERE c.id=$1 AND c.deleted_at IS NULL AND c.verification_status='verified' AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true AND (m.is_primary_hr=true OR COALESCE((m.permissions->>'manage_company')::boolean,false)=true)))`,
      [cid, uid]
    );
    if (!r.rowCount) throw new ForbiddenException('FORBIDDEN');
  }

  async add(uid: string, cid: string, dto: AddCompanyMemberDto) {
    let targetUserId = dto.user_id;
    const targetEmail = dto.email || dto.work_email;

    return this.db.transaction(async (client) => {
      await this.assertAdmin(client, uid, cid);

      // Option A: Resolve invitee by user_id OR email from public.users
      if (!targetUserId && targetEmail) {
        const lookup = await client.query(
          `SELECT id, status, deleted_at FROM public.users WHERE email = $1 AND deleted_at IS NULL AND status = 'active'`,
          [targetEmail.trim().toLowerCase()]
        );
        if (!lookup.rowCount) {
          throw new NotFoundException('NOT_FOUND');
        }
        targetUserId = lookup.rows[0].id;
      }

      if (!targetUserId) {
        throw new BadRequestException('VALIDATION_ERROR');
      }

      const target = await client.query('SELECT id,status,deleted_at FROM public.users WHERE id=$1', [targetUserId]);
      if (!target.rowCount || target.rows[0].status !== 'active' || target.rows[0].deleted_at) {
        throw new NotFoundException('NOT_FOUND');
      }

      const refs = await client.query(
        `SELECT
          ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM public.company_branches b WHERE b.id=$2 AND b.company_id=$1 AND b.is_active=true)) AS branch_ok,
          ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM public.departments d WHERE d.id=$3 AND d.company_id=$1 AND d.is_active=true)) AS department_ok,
          ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM public.teams t JOIN public.departments d ON d.id=t.department_id WHERE t.id=$4 AND d.company_id=$1 AND t.is_active=true AND d.is_active=true)) AS team_ok,
          ($5::uuid IS NULL OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.id=$5 AND m.company_id=$1 AND m.is_active=true)) AS manager_ok`,
        [cid, dto.branch_id ?? null, dto.department_id ?? null, dto.team_id ?? null, dto.manager_member_id ?? null]
      );
      if (!refs.rows[0].branch_ok || !refs.rows[0].department_ok || !refs.rows[0].team_ok || !refs.rows[0].manager_ok) {
        throw new BadRequestException('VALIDATION_ERROR');
      }

      const existing = await client.query('SELECT * FROM public.company_members WHERE company_id=$1 AND user_id=$2 FOR UPDATE', [cid, targetUserId]);
      if (existing.rowCount && existing.rows[0].is_active) {
        throw new BadRequestException('IDEMPOTENCY_CONFLICT');
      }

      if (existing.rowCount) {
        const r = await client.query(
          `UPDATE public.company_members SET branch_id=$1,department_id=$2,team_id=$3,manager_member_id=$4,title=$5,employee_code=$6,is_primary_hr=COALESCE($7,is_primary_hr),permissions=$8,employment_type=$9,work_email=$10,work_phone=$11,invited_at=NOW(),invited_by=$12,left_at=NULL WHERE id=$13 RETURNING ${MEMBER_RESPONSE_FIELDS}`,
          [dto.branch_id ?? null, dto.department_id ?? null, dto.team_id ?? null, dto.manager_member_id ?? null, dto.title ?? null, dto.employee_code ?? null, dto.is_primary_hr ?? null, dto.permissions ? JSON.stringify(dto.permissions) : null, dto.employment_type ?? null, dto.work_email ?? targetEmail ?? null, dto.work_phone ?? null, uid, existing.rows[0].id]
        );
        await this.audit(client, cid, uid, targetUserId, 'membership.invited', existing.rows[0].id, { is_active: existing.rows[0].is_active }, { is_active: false });
        return r.rows[0];
      }

      const r = await client.query(
        `INSERT INTO public.company_members (company_id,user_id,branch_id,department_id,team_id,manager_member_id,title,employee_code,is_primary_hr,permissions,employment_type,work_email,work_phone,invited_at,invited_by,is_active) 
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,false),$10,$11,$12,$13,NOW(),$14,false) 
         RETURNING ${MEMBER_RESPONSE_FIELDS}`,
        [cid, targetUserId, dto.branch_id ?? null, dto.department_id ?? null, dto.team_id ?? null, dto.manager_member_id ?? null, dto.title ?? null, dto.employee_code ?? null, dto.is_primary_hr ?? null, dto.permissions ? JSON.stringify(dto.permissions) : null, dto.employment_type ?? null, dto.work_email ?? targetEmail ?? null, dto.work_phone ?? null, uid]
      );
      await this.audit(client, cid, uid, targetUserId, 'membership.invited', r.rows[0].id, null, { is_active: false });
      return r.rows[0];
    });
  }

  async accept(uid: string, cid: string) {
    return this.db.transaction(async (client) => {
      const companyCheck = await client.query('SELECT 1 FROM public.companies WHERE id=$1 AND deleted_at IS NULL AND verification_status=\'verified\'', [cid]);
      if (!companyCheck.rowCount) throw new ForbiddenException('FORBIDDEN');

      // Strict authenticated identity check matching user_id === uid
      const r = await client.query(
        `UPDATE public.company_members SET is_active=true,joined_at=COALESCE(joined_at,NOW()),left_at=NULL 
         WHERE company_id=$1 AND user_id=$2 AND is_active=false AND invited_at IS NOT NULL 
         RETURNING ${MEMBER_RESPONSE_FIELDS}`,
        [cid, uid]
      );
      if (!r.rowCount) throw new BadRequestException('NOT_FOUND');
      await this.audit(client, cid, uid, uid, 'membership.accepted', r.rows[0].id, { is_active: false }, { is_active: true });
      return r.rows[0];
    });
  }

  async leave(uid: string, cid: string) {
    return this.db.transaction(async (client) => {
      const member = await client.query('SELECT * FROM public.company_members WHERE company_id=$1 AND user_id=$2 AND is_active=true FOR UPDATE', [cid, uid]);
      if (!member.rowCount) throw new NotFoundException('NOT_FOUND');
      const ownerCheck = await client.query('SELECT owner_id FROM public.companies WHERE id=$1 AND deleted_at IS NULL', [cid]);
      if (ownerCheck.rows[0]?.owner_id === uid) throw new ForbiddenException('FORBIDDEN');

      const r = await client.query(`UPDATE public.company_members SET is_active=false,left_at=NOW() WHERE id=$1 RETURNING ${MEMBER_RESPONSE_FIELDS}`, [member.rows[0].id]);
      await this.audit(client, cid, uid, uid, 'membership.left', member.rows[0].id, { is_active: true }, { is_active: false });
      return r.rows[0];
    });
  }

  async rejoin(uid: string, cid: string) {
    return this.db.transaction(async (client) => {
      const member = await client.query('SELECT * FROM public.company_members WHERE company_id=$1 AND user_id=$2 FOR UPDATE', [cid, uid]);
      if (!member.rowCount) throw new NotFoundException('NOT_FOUND');
      if (member.rows[0].is_active) throw new BadRequestException('IDEMPOTENCY_CONFLICT');

      const r = await client.query(`UPDATE public.company_members SET rejoin_requested_at=NOW() WHERE id=$1 RETURNING ${MEMBER_RESPONSE_FIELDS}`, [member.rows[0].id]);
      await this.audit(client, cid, uid, uid, 'membership.rejoin_requested', member.rows[0].id, { is_active: false }, { is_active: false });
      return r.rows[0];
    });
  }

  async approveRejoin(uid: string, cid: string, memberId: string) {
    return this.db.transaction(async (client) => {
      await this.assertAdmin(client, uid, cid);
      const member = await client.query('SELECT * FROM public.company_members WHERE id=$1 AND company_id=$2 FOR UPDATE', [memberId, cid]);
      if (!member.rowCount) throw new NotFoundException('NOT_FOUND');
      const m = member.rows[0];
      if (m.is_active || !m.rejoin_requested_at) throw new BadRequestException('VALIDATION_ERROR');

      const r = await client.query(`UPDATE public.company_members SET is_active=true,rejoin_requested_at=NULL,joined_at=NOW(),left_at=NULL WHERE id=$1 RETURNING ${MEMBER_RESPONSE_FIELDS}`, [memberId]);
      await this.audit(client, cid, uid, m.user_id, 'membership.rejoin_approved', memberId, { is_active: false }, { is_active: true });
      return r.rows[0];
    });
  }

  async deactivate(uid: string, cid: string, memberId: string) {
    return this.db.transaction(async (client) => {
      await this.assertAdmin(client, uid, cid);
      const member = await client.query('SELECT * FROM public.company_members WHERE id=$1 AND company_id=$2 FOR UPDATE', [memberId, cid]);
      if (!member.rowCount) throw new NotFoundException('NOT_FOUND');
      const m = member.rows[0];
      const r = await client.query(`UPDATE public.company_members SET is_active=false,left_at=NOW() WHERE id=$1 RETURNING ${MEMBER_RESPONSE_FIELDS}`, [memberId]);
      await this.audit(client, cid, uid, m.user_id, 'membership.deactivated', memberId, { is_active: m.is_active }, { is_active: false });
      return r.rows[0];
    });
  }
}

@Controller('api/v1/companies/:companyId')
@UseGuards(AuthGuard)
export class MembershipController {
  constructor(private readonly membership: MembershipService) {}

  @Post('members') add(@Req() r: AuthReq, @Param('companyId') c: string, @Body() d: AddCompanyMemberDto) { return this.membership.add(r.user!.sub, c, d); }
  @Post('membership/accept') accept(@Req() r: AuthReq, @Param('companyId') c: string) { return this.membership.accept(r.user!.sub, c); }
  @Post('membership/leave') leave(@Req() r: AuthReq, @Param('companyId') c: string) { return this.membership.leave(r.user!.sub, c); }
  @Post('membership/rejoin') rejoin(@Req() r: AuthReq, @Param('companyId') c: string) { return this.membership.rejoin(r.user!.sub, c); }
  @Post('members/:memberId/approve-rejoin') approveRejoin(@Req() r: AuthReq, @Param('companyId') c: string, @Param('memberId') m: string) { return this.membership.approveRejoin(r.user!.sub, c, m); }
  @Post('members/:memberId/deactivate') deactivate(@Req() r: AuthReq, @Param('companyId') c: string, @Param('memberId') m: string) { return this.membership.deactivate(r.user!.sub, c, m); }
}