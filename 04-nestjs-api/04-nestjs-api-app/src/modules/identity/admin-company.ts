import { BadRequestException, Body, Controller, ForbiddenException, Injectable, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';
import { Allow, IsIn, IsOptional, IsString } from 'class-validator';

export class VerifyCompanyDto {
  @Allow()
  @IsIn(['verified', 'rejected', 'pending'])
  verification_status!: 'verified' | 'rejected' | 'pending';

  @Allow()
  @IsOptional()
  @IsString()
  rejection_reason?: string;
}

type AuthReq = Request & { user?: RequestUser };
const COMPANY_RESPONSE_FIELDS = 'id,name,slug,legal_name,description,industry,company_size,website,is_active,verification_status,verified_at,created_at,updated_at';

@Injectable()
export class AdminCompanyService {
  constructor(private readonly system: SystemClient) {}

  private async assertPlatformAdmin(userId: string) {
    const r = await this.system.query<{ role: string; status: string }>(
      'SELECT role, status FROM public.users WHERE id=$1 AND deleted_at IS NULL',
      [userId]
    );
    const u = r.rows[0];
    if (!u || u.status !== 'active' || u.role !== 'admin') {
      throw new ForbiddenException('FORBIDDEN');
    }
  }

  async verifyCompany(adminUserId: string, companyId: string, dto: VerifyCompanyDto) {
    await this.assertPlatformAdmin(adminUserId);

    const targetStatus = dto.verification_status;
    if (!['verified', 'rejected', 'pending'].includes(targetStatus)) {
      throw new BadRequestException('VALIDATION_ERROR');
    }

    return this.system.transaction(async (client) => {
      const existing = await client.query<{ id: string; verification_status: string; verified_at: string | null }>(
        `SELECT id, verification_status, verified_at FROM public.companies WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [companyId]
      );
      if (!existing.rowCount) throw new NotFoundException('NOT_FOUND');
      const current = existing.rows[0];

      // Explicit Status Transition Matrix Validation
      // Allowed transitions:
      // - unverified/pending -> verified / rejected
      // - rejected -> pending / verified
      // - verified -> rejected / pending
      const allowedTransitions: Record<string, string[]> = {
        unverified: ['verified', 'rejected', 'pending'],
        pending: ['verified', 'rejected', 'pending'],
        rejected: ['pending', 'verified', 'rejected'],
        verified: ['rejected', 'pending', 'verified'],
      };

      const validTargets = allowedTransitions[current.verification_status] || ['verified', 'rejected', 'pending'];
      if (!validTargets.includes(targetStatus)) {
        throw new BadRequestException('VALIDATION_ERROR');
      }

      const newVerifiedAt = targetStatus === 'verified' ? new Date().toISOString() : null;

      const updated = await client.query(
        `UPDATE public.companies 
         SET verification_status = $1, verified_at = $2, updated_at = NOW() 
         WHERE id = $3 AND deleted_at IS NULL 
         RETURNING ${COMPANY_RESPONSE_FIELDS}`,
        [targetStatus, newVerifiedAt, companyId]
      );

      const updatedCompany = updated.rows[0];

      // Insert Audit Log record (no secrets/passwords, rejection_reason in audit JSON only)
      await client.query(
        `INSERT INTO public.audit_logs 
          (company_id, user_id, action, entity_type, entity_id, old_values, new_values, changes) 
         VALUES ($1::uuid, $2::uuid, 'company.verification_updated', 'company', $1::uuid, $3::jsonb, $4::jsonb, jsonb_build_object('verification_status', jsonb_build_object('old', $5::text, 'new', $6::text)))`,
        [
          companyId,
          adminUserId,
          JSON.stringify({ verification_status: current.verification_status, verified_at: current.verified_at }),
          JSON.stringify({ verification_status: updatedCompany.verification_status, verified_at: updatedCompany.verified_at, rejection_reason: dto.rejection_reason ?? null }),
          current.verification_status,
          updatedCompany.verification_status,
        ]
      );

      return updatedCompany;
    });
  }
}

@Controller('api/v1/admin/companies')
@UseGuards(AuthGuard)
export class AdminCompanyController {
  constructor(private readonly adminService: AdminCompanyService) {}

  @Patch(':companyId/verification')
  async verifyCompany(
    @Req() req: AuthReq,
    @Param('companyId') companyId: string,
    @Body() dto: VerifyCompanyDto
  ) {
    return this.adminService.verifyCompany(req.user!.sub, companyId, dto);
  }
}
