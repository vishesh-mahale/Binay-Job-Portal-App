import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsDefined } from 'class-validator';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from '../auth/auth';
import { SystemClient } from '../../infrastructure/database/clients';

export class UpdateCompanySettingsDto {
  @IsDefined() @IsBoolean() job_approval_required!: boolean;
}
type AuthReq = Request & { user?: RequestUser };
const SETTINGS_FIELDS = 'company_id,job_approval_required,auto_shortlist_enabled,ai_matching_enabled,notify_on_new_application,notify_on_shortlist,notify_on_interview_booked,custom_config,created_at,updated_at';

@Injectable()
export class CompanySettingsService {
  constructor(private readonly db: SystemClient) {}

  async get(actorId: string, companyId: string) {
    const r = await this.db.query(`SELECT ${SETTINGS_FIELDS} FROM public.company_settings s WHERE s.company_id=$1 AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id=s.company_id AND c.deleted_at IS NULL AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true AND m.left_at IS NULL) OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2 AND u.role='admin' AND u.status='active' AND u.deleted_at IS NULL)))`, [companyId, actorId]);
    if (!r.rows[0]) throw new NotFoundException('NOT_FOUND');
    return r.rows[0];
  }

  async update(actorId: string, companyId: string, dto: UpdateCompanySettingsDto) {
    if (typeof dto?.job_approval_required !== 'boolean') throw new BadRequestException('VALIDATION_ERROR');
    return this.db.transaction(async (client) => {
      const auth = await client.query(`SELECT 1 FROM public.companies c WHERE c.id=$1 AND c.deleted_at IS NULL AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.users u WHERE u.id=$2 AND u.role='admin' AND u.status='active' AND u.deleted_at IS NULL))`, [companyId, actorId]);
      if (!auth.rowCount) throw new ForbiddenException('FORBIDDEN');
      const before = await client.query(`SELECT ${SETTINGS_FIELDS} FROM public.company_settings WHERE company_id=$1 FOR UPDATE`, [companyId]);
      if (!before.rows[0]) throw new NotFoundException('NOT_FOUND');
      const previous = before.rows[0].job_approval_required;
      if (previous === dto.job_approval_required) return before.rows[0];
      const updated = await client.query(`UPDATE public.company_settings SET job_approval_required=$1 WHERE company_id=$2 RETURNING ${SETTINGS_FIELDS}`, [dto.job_approval_required, companyId]);
      await client.query(`INSERT INTO public.audit_logs (company_id,user_id,action,entity_type,entity_id,old_values,new_values,changes) VALUES ($1,$2,'company.settings_updated','company_settings',$1,$3::jsonb,$4::jsonb,$5::jsonb)`, [companyId, actorId, JSON.stringify({ job_approval_required: previous }), JSON.stringify({ job_approval_required: dto.job_approval_required }), JSON.stringify({ job_approval_required: { old: previous, new: dto.job_approval_required } })]);
      return updated.rows[0];
    });
  }
}

@Controller('api/v1/companies/:companyId/settings')
@UseGuards(AuthGuard)
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}
  @Get() get(@Req() req: AuthReq, @Param('companyId') companyId: string) { return this.service.get(req.user!.sub, companyId); }
  @Patch() update(@Req() req: AuthReq, @Param('companyId') companyId: string, @Body() dto: UpdateCompanySettingsDto) { return this.service.update(req.user!.sub, companyId, dto); }
}