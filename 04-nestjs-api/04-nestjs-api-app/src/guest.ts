import { BadRequestException, Body, Controller, Get, Headers, Injectable, NotFoundException, Param, Post, Req, ServiceUnavailableException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SystemClient } from './clients';
import { StorageAdapter } from './storage';
import { validateResumeFile } from './resume-upload-validation';
import { AuthGuard } from './auth';
import { Allow, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class GuestSessionCreateDto {
  @Allow() @IsUUID() job_id!: string;
  @Allow() @IsOptional() @IsEmail() email?: string;
  [key: string]: unknown;
}

export class GuestApplicationDto {
  @Allow() @IsUUID() job_id!: string;
  @Allow() @IsUUID() session_id!: string;
  @Allow() @IsUUID() document_id!: string;
  @Allow() @IsString() name!: string;
  @Allow() @IsEmail() email!: string;
  @Allow() @IsOptional() @IsString() phone?: string;
  @Allow() @IsOptional() @IsString() cover_letter?: string;
  @Allow() @IsString() token!: string;
  [key: string]: unknown;
}

export class GuestClaimDto {
  @Allow() @IsString() claim_token!: string;
  [key: string]: unknown;
}

@Injectable()
export class GuestSessionService {
  constructor(private readonly system: SystemClient, private readonly storage: StorageAdapter) {}

  async create(body: GuestSessionCreateDto) {
    if (!/^[0-9a-f-]{36}$/i.test(String(body?.job_id))) throw new BadRequestException('VALIDATION_ERROR');
    const ttl = Number(process.env.GUEST_UPLOAD_SESSION_TTL_SECONDS);
    if (!Number.isInteger(ttl) || ttl <= 0) throw new ServiceUnavailableException('GUEST_SESSION_NOT_CONFIGURED');
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const result = await this.system.query(`INSERT INTO public.guest_upload_sessions (id, job_id, token_hash, email, expires_at) SELECT $1, j.id, $2, $3, $4::timestamptz FROM public.jobs j WHERE j.id = $5 AND j.deleted_at IS NULL RETURNING id, job_id, expires_at`, [sessionId, tokenHash, body.email ?? null, expiresAt, body.job_id]);
    if (!result.rows[0]) throw new BadRequestException('NOT_FOUND');
    return { session_id: result.rows[0].id, job_id: result.rows[0].job_id, token, expires_at: result.rows[0].expires_at };
  }

  async uploadResume(sessionId: string, token: string, file: any) {
    const maxBytes = Number(process.env.RESUME_MAX_BYTES);
    const bucket = process.env.RESUME_STORAGE_BUCKET;
    if (!bucket || !Number.isInteger(maxBytes) || maxBytes <= 0) throw new ServiceUnavailableException('STORAGE_NOT_CONFIGURED');
    let validated;
    try { validated = validateResumeFile(file, maxBytes); } catch { throw new BadRequestException('VALIDATION_ERROR'); }
    const tokenHash = createHash('sha256').update(token || '').digest('hex');
    const session = await this.system.query(`SELECT id, job_id, status, expires_at, uploaded_count, uploaded_bytes FROM public.guest_upload_sessions WHERE id = $1 AND token_hash = $2 AND status = 'active' AND consumed_at IS NULL AND expires_at > NOW() AND revoked_at IS NULL`, [sessionId, tokenHash]);
    if (!session.rows[0]) throw new BadRequestException('NOT_FOUND');
    const row = session.rows[0];
    const documentId = randomUUID();
    const storagePath = `guest/${row.job_id}/sessions/${sessionId}/${documentId}.${validated.extension}`;
    await this.storage.put(bucket, storagePath, file.buffer, validated.mimeType);
    try {
      return await this.system.transaction(async (client) => {
        const locked = await client.query(`SELECT id, max_upload_count, max_total_bytes, uploaded_count, uploaded_bytes FROM public.guest_upload_sessions WHERE id = $1 AND status = 'active' AND consumed_at IS NULL AND expires_at > NOW() AND revoked_at IS NULL FOR UPDATE`, [sessionId]);
        if (!locked.rows[0] || Number(locked.rows[0].uploaded_count) >= Number(locked.rows[0].max_upload_count) || Number(locked.rows[0].uploaded_bytes) + validated.sizeBytes > Number(locked.rows[0].max_total_bytes)) throw new BadRequestException('UPLOAD_LIMIT_REACHED');
        await client.query(`INSERT INTO public.uploaded_documents (id, guest_upload_session_id, document_type, original_file_name, file_extension, file_size_bytes, mime_type, storage_bucket, storage_path, checksum_sha256) VALUES ($1,$2,'resume',$3,$4,$5,$6,$7,$8,$9)`, [documentId, sessionId, validated.fileName, validated.extension, validated.sizeBytes, validated.mimeType, bucket, storagePath, validated.checksumSha256]);
        await client.query(`UPDATE public.guest_upload_sessions SET uploaded_count = uploaded_count + 1, uploaded_bytes = uploaded_bytes + $2 WHERE id = $1`, [sessionId, validated.sizeBytes]);
        const eventId = randomUUID();
        await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'uploaded_document',$2,'security.scan.requested',1,$3::jsonb,$1,$1)`, [eventId, documentId, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_type: 'uploaded_document', aggregate_id: documentId, event_type: 'security.scan.requested', payload: { document_id: documentId, uploaded_by_user_id: null, guest_upload_session_id: sessionId, trace_id: eventId }, occurred_at: new Date().toISOString() })]);
        return { document_id: documentId, security_scan_status: 'pending', processing_status: 'uploaded', stage: 'UPLOADED' };
      });
    } catch (error) {
      try { await this.storage.remove(bucket, storagePath); } catch { /* best-effort compensation */ }
      throw error;
    }
  }

  async resumeStatus(documentId: string, token: string) {
    const hash = createHash('sha256').update(token || '').digest('hex');
    const result = await this.system.query(`SELECT d.id AS document_id, d.security_scan_status, d.processing_status, d.created_at AS uploaded_at, d.updated_at, s.expires_at, j.id AS parsing_job_id, j.started_at, j.completed_at, j.failed_at FROM public.uploaded_documents d JOIN public.guest_upload_sessions s ON s.id = d.guest_upload_session_id AND s.consumed_at IS NULL LEFT JOIN LATERAL (SELECT rpj.* FROM public.resume_parsing_jobs rpj WHERE rpj.document_id = d.id ORDER BY rpj.created_at DESC LIMIT 1) j ON TRUE WHERE d.id = $1 AND s.token_hash = $2 AND d.deleted_at IS NULL`, [documentId, hash]);
    const row = result.rows[0];
    if (!row) throw new NotFoundException('NOT_FOUND');
    const scan = String(row.security_scan_status); const processing = String(row.processing_status); let stage: string; let retryable = false;
    if (scan === 'pending' || scan === 'scanning') stage = scan === 'scanning' ? 'SECURITY_SCANNING' : 'UPLOADED';
    else if (scan === 'infected' || scan === 'quarantined') stage = 'SECURITY_REJECTED';
    else if (scan === 'failed') { stage = 'SECURITY_RETRYABLE_FAILURE'; retryable = true; }
    else if (processing === 'queued' || processing === 'uploaded') stage = processing === 'queued' ? 'PARSING_QUEUED' : 'UPLOADED';
    else if (processing === 'processing') stage = 'PARSING_IN_PROGRESS';
    else if (processing === 'partial') stage = 'REVIEW_READY_PARTIAL';
    else if (processing === 'completed') stage = 'REVIEW_READY';
    else { stage = 'PARSING_FAILED'; retryable = processing !== 'cancelled'; }
    return { document_id: row.document_id, security_scan_status: scan, processing_status: processing, stage, retryable, parsing_job_id: row.parsing_job_id, timestamps: { uploaded_at: row.uploaded_at, updated_at: row.updated_at, started_at: row.started_at, completed_at: row.completed_at, failed_at: row.failed_at } };
  }

  async parsedData(documentId: string, token: string) {
    const hash = createHash('sha256').update(token || '').digest('hex');
    const result = await this.system.query(`SELECT d.id AS document_id, d.security_scan_status, d.processing_status, j.id AS parsing_job_id, p.schema_version, p.overall_confidence, p.confidence_details, p.validation_result, p.normalized_output, p.created_at FROM public.uploaded_documents d JOIN public.guest_upload_sessions s ON s.id = d.guest_upload_session_id AND s.consumed_at IS NULL JOIN public.resume_parsing_jobs j ON j.document_id = d.id JOIN public.resume_parsed_data p ON p.parsing_job_id = j.id AND p.document_id = d.id WHERE d.id = $1 AND s.token_hash = $2 AND d.deleted_at IS NULL AND d.security_scan_status = 'clean' AND j.status IN ('completed','partial') ORDER BY p.created_at DESC LIMIT 1`, [documentId, hash]);
    const row = result.rows[0]; if (!row) throw new NotFoundException('NOT_FOUND');
    const source = row.normalized_output && typeof row.normalized_output === 'object' ? row.normalized_output : {};
    const allowed = ['contact_info','professional_title','summary','skills','experiences','educations','certifications','languages'];
    const normalized_output = Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(source, key)).map((key) => [key, source[key]]));
    return { document_id: row.document_id, parsing_job_id: row.parsing_job_id, schema_version: row.schema_version, overall_confidence: row.overall_confidence, confidence_details: row.confidence_details, validation_result: row.validation_result, normalized_output, partial: String(row.processing_status) === 'partial', created_at: row.created_at };
  }

  async apply(body: GuestApplicationDto) {
    if (!body?.job_id || !body?.session_id || !body?.document_id || !body?.name || !body?.email) throw new BadRequestException('VALIDATION_ERROR');
    const hash = createHash('sha256').update(body.token || '').digest('hex');
    return this.system.transaction(async (client) => {
      const session = await client.query(`SELECT s.id, s.job_id FROM public.guest_upload_sessions s WHERE s.id = $1 AND s.token_hash = $2 AND s.status = 'active' AND s.consumed_at IS NULL AND s.expires_at > NOW() AND s.revoked_at IS NULL FOR UPDATE`, [body.session_id, hash]);
      if (!session.rows[0] || String(session.rows[0].job_id) !== String(body.job_id)) throw new BadRequestException('GUEST_SESSION_INVALID');
      const job = await client.query(`SELECT id, company_id FROM public.jobs WHERE id = $1 AND status = 'published' AND (expires_at IS NULL OR expires_at > NOW()) AND deleted_at IS NULL`, [body.job_id]);
      if (!job.rows[0]) throw new NotFoundException('NOT_FOUND');
      const doc = await client.query(`SELECT id, security_scan_status FROM public.uploaded_documents WHERE id = $1 AND guest_upload_session_id = $2 AND deleted_at IS NULL`, [body.document_id, body.session_id]);
      if (!doc.rows[0]) throw new NotFoundException('NOT_FOUND');
      const scanStatus = String(doc.rows[0].security_scan_status);
      if (scanStatus === 'pending' || scanStatus === 'scanning') throw new BadRequestException('SCAN_PENDING');
      if (scanStatus === 'infected' || scanStatus === 'quarantined') throw new BadRequestException('INFECTED_FILE');
      if (scanStatus === 'failed') throw new BadRequestException('SCAN_FAILED');
      const app = await client.query(`INSERT INTO public.job_applications (job_id, is_guest, guest_upload_session_id, guest_email, guest_email_normalized, guest_name, guest_phone, cover_letter) VALUES ($1, TRUE, $2, $3, LOWER(BTRIM($3::text)), $4, $5, $6) RETURNING id, status, applied_at`, [body.job_id, body.session_id, body.email, body.name, body.phone ?? null, body.cover_letter ?? null]);
      const applicationId = app.rows[0].id;
      await client.query(`INSERT INTO public.application_documents (application_id, document_id, document_role) VALUES ($1,$2,'resume')`, [applicationId, body.document_id]);
      const snapshotResult = await client.query(`INSERT INTO public.application_profile_snapshots (application_id, snapshot_type, snapshot_version, schema_version, snapshot_data, resume_document_id, generated_by) VALUES ($1,'submitted',1,'application.v1',$2::jsonb,$3,'guest') RETURNING id`, [applicationId, JSON.stringify({ name: body.name, email: body.email, phone: body.phone ?? null, cover_letter: body.cover_letter ?? null }), body.document_id]);
      await client.query(`INSERT INTO public.application_status_history (application_id, from_status, to_status, changed_by, change_reason) VALUES ($1,NULL,'applied',NULL,'guest_application_submitted')`, [applicationId]);
      const claimTtl = Number(process.env.GUEST_CLAIM_TTL_SECONDS);
      if (!Number.isInteger(claimTtl) || claimTtl <= 0) throw new ServiceUnavailableException('GUEST_CLAIM_NOT_CONFIGURED');
      const claimToken = randomBytes(32).toString('base64url');
      const claimHash = createHash('sha256').update(claimToken).digest('hex');
      await client.query(`INSERT INTO public.guest_candidate_claims (application_id, guest_email_normalized, claim_token_hash, expires_at) VALUES ($1, LOWER(BTRIM($2::text)), $3, NOW() + ($4::int * INTERVAL '1 second'))`, [applicationId, body.email, claimHash, claimTtl]);
      const eventId = randomUUID();
      await client.query(`INSERT INTO public.outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, correlation_id, causation_id) VALUES ($1,'job_application',$2,'application.submitted',1,$3::jsonb,$1,$1)`, [eventId, applicationId, JSON.stringify({ schema_version: 1, event_id: eventId, aggregate_type: 'job_application', aggregate_id: applicationId, event_type: 'application.submitted', payload: { application_id: applicationId, job_id: body.job_id, company_id: job.rows[0].company_id, candidate_id: null, is_guest: true, referral_invitation_id: null, snapshot_id: snapshotResult.rows[0]?.id, submitted_at: new Date().toISOString(), trace_id: eventId }, occurred_at: new Date().toISOString() })]);
      await client.query(`SELECT public.consume_guest_upload_session($1,$2)`, [body.session_id, applicationId]);
      return { application_id: applicationId, status: app.rows[0].status, applied_at: app.rows[0].applied_at, claim_token: claimToken };
    });
  }

  async claim(requestUserId: string, token: string) {
    if (!token) throw new BadRequestException('VALIDATION_ERROR');
    const hash = createHash('sha256').update(token).digest('hex');
    return this.system.transaction(async (client) => {
      const claim = await client.query(`SELECT c.id, c.status, c.expires_at, c.guest_email_normalized, a.id AS application_id, u.email AS user_email, cp.id AS candidate_id FROM public.guest_candidate_claims c JOIN public.job_applications a ON a.id = c.application_id JOIN public.users u ON u.id = $2 JOIN public.candidate_profiles cp ON cp.user_id = u.id WHERE c.claim_token_hash = $1 FOR UPDATE`, [hash, requestUserId]);
      if (!claim.rows[0]) throw new NotFoundException('NOT_FOUND');
      const row = claim.rows[0];
      if (row.status === 'merged') return { application_id: row.application_id, claim_status: 'merged', candidate_id: row.candidate_id, already_claimed: true };
      if (row.status !== 'pending' || new Date(row.expires_at).getTime() <= Date.now() || String(row.guest_email_normalized).toLowerCase() !== String(row.user_email).toLowerCase()) throw new BadRequestException('CLAIM_INVALID');
      await client.query(`UPDATE public.guest_candidate_claims SET status = 'verified', claimed_by_user_id = $2, verified_at = NOW() WHERE id = $1`, [row.id, requestUserId]);
      await client.query(`UPDATE public.guest_candidate_claims SET status = 'merged', candidate_id = $2, merged_at = NOW() WHERE id = $1`, [row.id, row.candidate_id]);
      return { application_id: row.application_id, claim_status: 'merged', candidate_id: row.candidate_id, already_claimed: false };
    });
  }
}

@Controller('api/v1/guest-sessions')
export class GuestSessionController {
  constructor(private readonly sessions: GuestSessionService) {}
  @Post()
  async create(@Body() body: GuestSessionCreateDto) { return this.sessions.create(body); }

  @Post(':sessionId/resumes')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@Param('sessionId') sessionId: string, @Headers('x-guest-upload-token') token: string, @UploadedFile() file: any) {
    return this.sessions.uploadResume(sessionId, token, file);
  }

  @Get(':documentId/status')
  async status(@Param('documentId') documentId: string, @Headers('x-guest-upload-token') token: string) { return this.sessions.resumeStatus(documentId, token); }

  @Get(':documentId/parsed-data')
  async parsed(@Param('documentId') documentId: string, @Headers('x-guest-upload-token') token: string) { return this.sessions.parsedData(documentId, token); }

  @Post('/apply')
  async apply(@Body() body: GuestApplicationDto) { return this.sessions.apply(body); }

  @Post('/claims')
  @UseGuards(AuthGuard)
  async claim(@Body() body: GuestClaimDto, @Req() request: any) { return this.sessions.claim(request.user?.sub, body?.claim_token); }
}
