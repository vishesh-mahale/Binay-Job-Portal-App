import { BadRequestException, Body, Controller, ForbiddenException, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';
import { Allow } from 'class-validator';

export class TransferOwnershipDto { @Allow() new_owner_user_id!: string; }
type AuthReq = Request & { user?: RequestUser };

@Injectable()
export class OwnershipService {
  constructor(private readonly db: SystemClient) {}
  async transfer(actorId: string, companyId: string, dto: TransferOwnershipDto) {
    if (!dto.new_owner_user_id || dto.new_owner_user_id === actorId) throw new BadRequestException('VALIDATION_ERROR');
    return this.db.transaction(async (client) => {
      const company = await client.query('SELECT id, owner_id FROM public.companies WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [companyId]);
      if (!company.rowCount) throw new BadRequestException('NOT_FOUND');
      if (company.rows[0].owner_id !== actorId) throw new ForbiddenException('FORBIDDEN');
      const target = await client.query(`SELECT m.user_id FROM public.company_members m JOIN public.users u ON u.id=m.user_id WHERE m.company_id=$1 AND m.user_id=$2 AND m.is_active=true AND u.status='active' AND u.deleted_at IS NULL FOR UPDATE`, [companyId,dto.new_owner_user_id]);
      if (!target.rowCount) throw new BadRequestException('NOT_FOUND');
      const updated = await client.query('UPDATE public.companies SET owner_id=$1 WHERE id=$2 AND owner_id=$3 AND deleted_at IS NULL RETURNING *', [dto.new_owner_user_id,companyId,actorId]);
      if (!updated.rowCount) throw new ForbiddenException('FORBIDDEN');
      await client.query(`INSERT INTO public.audit_logs (company_id,user_id,target_user_id,action,entity_type,entity_id,old_values,new_values,changes) VALUES ($1,$2,$3,'company.ownership_transferred','company',$1,jsonb_build_object('owner_id',$2),jsonb_build_object('owner_id',$3),jsonb_build_object('owner_id',jsonb_build_object('old',$2,'new',$3)))`, [companyId, actorId, dto.new_owner_user_id]);
      return updated.rows[0];
    });
  }
}

@Controller('api/v1/companies/:companyId') @UseGuards(AuthGuard)
export class OwnershipController {
  constructor(private readonly service: OwnershipService) {}
  @Post('ownership-transfer') transfer(@Req() req: AuthReq, @Param('companyId') companyId: string, @Body() dto: TransferOwnershipDto) { return this.service.transfer(req.user!.sub, companyId, dto); }
}
