import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard, RequestUser } from './auth';
import { SystemClient } from './clients';
import { Allow, IsEmail, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @Allow() @IsString() name!: string; @Allow() @IsString() slug!: string; @Allow() @IsOptional() @IsEmail() email?: string; @Allow() @IsOptional() @IsString() phone?: string; @Allow() @IsOptional() @IsString() legal_name?: string;
  @Allow() @IsOptional() @IsString() description?: string; @Allow() @IsOptional() @IsString() short_description?: string; @Allow() @IsOptional() @IsString() industry?: string; @Allow() @IsOptional() @IsString() company_size?: string;
  @Allow() @IsOptional() @IsString() website?: string; @Allow() @IsOptional() @IsString() linkedin_url?: string; @Allow() @IsOptional() @IsString() twitter_url?: string; @Allow() @IsOptional() @IsString() facebook_url?: string; @Allow() @IsOptional() @IsString() youtube_url?: string;
  @Allow() @IsOptional() @IsString() logo_path?: string; @Allow() @IsOptional() @IsString() cover_image_path?: string; @Allow() @IsOptional() @IsString() brand_color?: string; @Allow() @IsOptional() @IsString() address_line1?: string; @Allow() @IsOptional() @IsString() address_line2?: string;
  @Allow() @IsOptional() @IsString() city?: string; @Allow() @IsOptional() @IsString() state?: string; @Allow() @IsOptional() @IsString() country?: string; @Allow() @IsOptional() @IsString() postal_code?: string; @Allow() @IsOptional() @IsNumber() latitude?: number; @Allow() @IsOptional() @IsNumber() longitude?: number;
}
export class UpdateCompanyDto {
  @Allow() @IsOptional() @IsString() name?: string; @Allow() @IsOptional() @IsString() legal_name?: string; @Allow() @IsOptional() @IsString() description?: string; @Allow() @IsOptional() @IsString() short_description?: string; @Allow() @IsOptional() @IsString() industry?: string;
  @Allow() @IsOptional() @IsString() company_size?: string; @Allow() @IsOptional() @IsString() website?: string; @Allow() @IsOptional() @IsString() linkedin_url?: string; @Allow() @IsOptional() @IsString() twitter_url?: string; @Allow() @IsOptional() @IsString() facebook_url?: string;
  @Allow() @IsOptional() @IsString() youtube_url?: string; @Allow() @IsOptional() @IsString() logo_path?: string; @Allow() @IsOptional() @IsString() cover_image_path?: string; @Allow() @IsOptional() @IsString() brand_color?: string; @Allow() @IsOptional() @IsEmail() email?: string;
  @Allow() @IsOptional() @IsString() phone?: string; @Allow() @IsOptional() @IsString() address_line1?: string; @Allow() @IsOptional() @IsString() address_line2?: string; @Allow() @IsOptional() @IsString() city?: string; @Allow() @IsOptional() @IsString() state?: string; @Allow() @IsOptional() @IsString() country?: string;
  @Allow() @IsOptional() @IsString() postal_code?: string; @Allow() @IsOptional() @IsNumber() latitude?: number; @Allow() @IsOptional() @IsNumber() longitude?: number;
}
type AuthReq = Request & { user?: RequestUser };
const COMPANY_FIELDS = ['name','legal_name','description','short_description','industry','company_size','website','linkedin_url','twitter_url','facebook_url','youtube_url','logo_path','cover_image_path','brand_color','email','phone','address_line1','address_line2','city','state','country','postal_code','latitude','longitude'] as const;
const COMPANY_RESPONSE_FIELDS = 'id,name,slug,legal_name,description,industry,company_size,website,is_active,verification_status,created_at,updated_at';

@Injectable()
export class CompanyService {
  constructor(private readonly system: SystemClient) {}
  private async assertEmployer(userId: string) {
    const r = await this.system.query<{role:string;status:string}>('SELECT role, status FROM public.users WHERE id=$1 AND deleted_at IS NULL', [userId]);
    const u = r.rows[0];
    if (!u || u.status !== 'active' || !['employer','admin'].includes(u.role)) throw new ForbiddenException('FORBIDDEN');
  }
  async create(userId: string, dto: CreateCompanyDto) {
    await this.assertEmployer(userId);
    if (!dto.name?.trim() || !dto.slug?.trim() || (!dto.email && !dto.phone)) throw new BadRequestException('VALIDATION_ERROR');
    return this.system.transaction(async (client) => {
      const c = await client.query(`INSERT INTO public.companies (name,slug,legal_name,description,short_description,industry,company_size,website,linkedin_url,twitter_url,facebook_url,youtube_url,logo_path,cover_image_path,brand_color,email,phone,address_line1,address_line2,city,state,country,postal_code,latitude,longitude,owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING ${COMPANY_RESPONSE_FIELDS}`, [dto.name.trim(),dto.slug.trim().toLowerCase(),dto.legal_name,dto.description,dto.short_description,dto.industry,dto.company_size,dto.website,dto.linkedin_url,dto.twitter_url,dto.facebook_url,dto.youtube_url,dto.logo_path,dto.cover_image_path,dto.brand_color,dto.email,dto.phone,dto.address_line1,dto.address_line2,dto.city,dto.state,dto.country,dto.postal_code,dto.latitude,dto.longitude,userId]);
      const company = c.rows[0];
      // Owner membership is created for tenant consistency; HR privilege is not inferred.
      await client.query(`INSERT INTO public.company_members (company_id,user_id,is_active,joined_at) VALUES ($1,$2,true,NOW())`, [company.id,userId]);
      await client.query(`INSERT INTO public.company_settings (company_id) VALUES ($1)`, [company.id]);
      return company;
    });
  }
  async get(userId: string, companyId: string) {
    const r = await this.system.query(`SELECT ${COMPANY_RESPONSE_FIELDS} FROM public.companies c WHERE c.id=$1 AND c.deleted_at IS NULL AND (c.owner_id=$2 OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id=c.id AND m.user_id=$2 AND m.is_active=true))`, [companyId,userId]);
    if (!r.rows[0]) throw new ForbiddenException('FORBIDDEN');
    return r.rows[0];
  }
  async update(userId: string, companyId: string, dto: UpdateCompanyDto) {
    const current = await this.get(userId, companyId);
    const ownerCheck = await this.system.query<{ owner_id: string }>('SELECT owner_id FROM public.companies WHERE id = $1 AND deleted_at IS NULL', [companyId]);
    if (!ownerCheck.rows[0] || ownerCheck.rows[0].owner_id !== userId) throw new ForbiddenException('FORBIDDEN');
    const normalized = { ...dto };
    if (typeof normalized.name === 'string') normalized.name = normalized.name.trim();
    if (normalized.name === '') throw new BadRequestException('VALIDATION_ERROR');
    const entries = Object.entries(normalized).filter(([k,v]) => (COMPANY_FIELDS as readonly string[]).includes(k) && v !== undefined);
    if (!entries.length) return current;
    const sets = entries.map(([k],i) => `${k}=$${i+1}`).join(', ');
    const values = entries.map(([,v]) => v); values.push(companyId);
    const r = await this.system.query(`UPDATE public.companies SET ${sets} WHERE id=$${values.length} AND deleted_at IS NULL RETURNING ${COMPANY_RESPONSE_FIELDS}`, values);
    return r.rows[0];
  }

}

@Controller('api/v1/companies')
@UseGuards(AuthGuard)
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}
  @Post() create(@Req() req: AuthReq, @Body() dto: CreateCompanyDto) { return this.companies.create(req.user!.sub, dto); }
  @Get(':companyId') get(@Req() req: AuthReq, @Param('companyId') id: string) { return this.companies.get(req.user!.sub, id); }
  @Patch(':companyId') update(@Req() req: AuthReq, @Param('companyId') id: string, @Body() dto: UpdateCompanyDto) { return this.companies.update(req.user!.sub, id, dto); }
}
