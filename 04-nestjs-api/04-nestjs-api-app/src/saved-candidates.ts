import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';

type AuthRequest = Request & { user?: RequestUser };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SavedCandidateService {
  constructor(private readonly system: SystemClient) {}

  private async assertRecruiter(client: any, companyId: string, userId: string) {
    const result = await client.query(`
      SELECT 1 FROM public.users u
      WHERE u.id = $1 AND u.status = 'active' AND u.deleted_at IS NULL
        AND u.role IN ('employer','hr','admin')
        AND (u.role = 'admin' OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = $2 AND cm.user_id = $1 AND cm.is_active = TRUE AND cm.left_at IS NULL
        ) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = $2 AND c.owner_id = $1 AND c.deleted_at IS NULL))
    `, [userId, companyId]);
    if (!result.rows[0]) throw new ForbiddenException('FORBIDDEN');
  }

  async save(companyId: string, userId: string, candidateId: string, note?: string) {
    if (!UUID.test(companyId) || !UUID.test(candidateId)) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      await this.assertRecruiter(client, companyId, userId);
      const candidate = await client.query(`SELECT id FROM public.candidate_profiles WHERE id = $1 AND is_open_to_work = TRUE`, [candidateId]);
      if (!candidate.rows[0]) throw new BadRequestException('NOT_FOUND');
      const result = await client.query(`
        INSERT INTO public.saved_candidates (recruiter_user_id, company_id, candidate_id, private_note)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (recruiter_user_id, candidate_id) DO UPDATE SET private_note = EXCLUDED.private_note, updated_at = NOW()
        RETURNING id, recruiter_user_id, company_id, candidate_id, private_note, created_at, updated_at
      `, [userId, companyId, candidateId, note?.trim() || null]);
      return result.rows[0];
    });
  }

  async list(companyId: string, userId: string) {
    return this.system.transaction(async (client) => {
      await this.assertRecruiter(client, companyId, userId);
      const result = await client.query(`
        SELECT sc.id, sc.candidate_id, sc.private_note, sc.created_at, sc.updated_at
        FROM public.saved_candidates sc
        WHERE sc.company_id = $1 AND sc.recruiter_user_id = $2
        ORDER BY sc.created_at DESC LIMIT 100
      `, [companyId, userId]);
      return result.rows;
    });
  }

  async remove(companyId: string, userId: string, candidateId: string) {
    if (!UUID.test(companyId) || !UUID.test(candidateId)) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      await this.assertRecruiter(client, companyId, userId);
      const result = await client.query(`DELETE FROM public.saved_candidates WHERE company_id = $1 AND recruiter_user_id = $2 AND candidate_id = $3 RETURNING id`, [companyId, userId, candidateId]);
      return { removed: Boolean(result.rows[0]) };
    });
  }
}

@Controller('api/v1/companies/:companyId/saved-candidates')
@UseGuards(AuthGuard)
export class SavedCandidateController {
  constructor(private readonly saved: SavedCandidateService) {}
  @Post(':candidateId')
  save(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('candidateId') candidateId: string, @Body() body: { private_note?: string }) {
    if (!req.user?.sub) throw new BadRequestException('FORBIDDEN');
    return this.saved.save(companyId, req.user.sub, candidateId, body?.private_note);
  }
  @Get()
  list(@Req() req: AuthRequest, @Param('companyId') companyId: string) {
    if (!req.user?.sub) throw new BadRequestException('FORBIDDEN');
    return this.saved.list(companyId, req.user.sub);
  }
  @Delete(':candidateId')
  remove(@Req() req: AuthRequest, @Param('companyId') companyId: string, @Param('candidateId') candidateId: string) {
    if (!req.user?.sub) throw new BadRequestException('FORBIDDEN');
    return this.saved.remove(companyId, req.user.sub, candidateId);
  }
}
