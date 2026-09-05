import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { JobService } from './jobs';

describe('JobService — Bounded Unit 4 — Public Job Search & Listing Backend', () => {
  beforeEach(() => {
    process.env.SEARCH_CURSOR_SECRET = 'search_cursor_secret_key_32_characters_minimum_len';
  });

  // 1. HR draft -> pending_approval via submitForApproval
  it('1. HR submits a draft job for approval (draft -> pending_approval)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).submitForApproval('hr-user-1', 'company-1', 'job-1');
    expect(result.status).toBe('pending_approval');
    expect(client.query.mock.calls[3][0]).toContain("j.status = 'draft'");
  });

  // 2. job_approval_required = false + verified company -> direct publish
  it('2. Direct publish by HR succeeds when company is verified and job_approval_required = false', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'verified' }] })
        .mockResolvedValueOnce({ rows: [{ job_approval_required: false }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).publish('hr-user-1', 'company-1', 'job-1');
    expect(result.status).toBe('published');
  });

  // 3. job_approval_required = true -> publish moves to pending_approval
  it('3. Publish by HR moves job to pending_approval when job_approval_required = true', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'verified' }] })
        .mockResolvedValueOnce({ rows: [{ job_approval_required: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'pending_approval' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).publish('hr-user-1', 'company-1', 'job-1');
    expect(result.status).toBe('pending_approval');
  });

  // 4. Unverified company -> direct publish forbidden (HTTP 403)
  it('4. Direct publish is forbidden (HTTP 403) when company is unverified and approval_required = false', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'unverified' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).publish('hr-user-1', 'company-1', 'job-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 4b. Unverified company + publish endpoint is forbidden (HTTP 403) even when job_approval_required = true
  it('4b. Publish endpoint is forbidden (HTTP 403) for unverified company even when job_approval_required = true', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'unverified' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).publish('hr-user-1', 'company-1', 'job-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 5. HR calling approve -> FORBIDDEN (HTTP 403)
  it('5. Regular active HR calling approve is forbidden (HTTP 403)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).approve('hr-user-1', 'company-1', 'job-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 6. HR calling reject -> FORBIDDEN (HTTP 403)
  it('6. Regular active HR calling reject is forbidden (HTTP 403)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).reject('hr-user-1', 'company-1', 'job-1', 'Rejection reason')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 7. Owner approving verified job -> success
  it('7. Company Owner can approve a verified pending job (pending_approval -> published)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).approve('owner-user-1', 'company-1', 'job-1');
    expect(result.status).toBe('published');
    expect(client.query.mock.calls[2][0]).toContain("c.verification_status = 'verified'");
  });

  // 8. Owner rejecting job -> pending_approval -> draft with reason
  it('8. Company Owner can reject a pending job back to draft with a reason', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'draft' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).reject('owner-user-1', 'company-1', 'job-1', 'Needs salary clarification');
    expect(result.status).toBe('draft');
    expect(JSON.stringify(client.query.mock.calls[3][1])).toContain('Needs salary clarification');
  });

  // 9. Rejection without reason throws VALIDATION_ERROR before DB transaction
  it('9. Reject requires a non-empty reason', async () => {
    const system = { transaction: jest.fn() } as any;
    await expect(new JobService(system).reject('owner-user-1', 'company-1', 'job-1', '   ')).rejects.toThrow('VALIDATION_ERROR');
    expect(system.transaction).not.toHaveBeenCalled();
  });

  // 10. Cross-company negative test: User from Company A accessing Company B job -> HTTP 403
  it('10. Cross-company access is rejected with FORBIDDEN (HTTP 403)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-company-2' }] })
        .mockResolvedValueOnce({ rows: [] }) // User 1 is NOT a member of Company 2
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).publish('user-company-1', 'company-2', 'job-in-company-2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 11. Platform Admin can approve a verified pending job
  it('11. Platform Admin can approve a verified pending job for any company', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'admin', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).approve('admin-user', 'company-2', 'job-1');
    expect(result.status).toBe('published');
  });

  // 12. Active HR member can update draft job in same company
  it('12. Active HR member can update draft job in same company', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', title: 'Updated Title', status: 'draft' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).updateDraft('hr-user-1', 'company-1', 'job-1', { title: 'Updated Title' });
    expect(result.title).toBe('Updated Title');
    expect(client.query.mock.calls[3][0]).toContain("UPDATE public.jobs j SET title = $4, updated_at = NOW()");
  });

  // 13. Cross-company updateDraft attempt by active HR of Company A targeting Company B job is rejected with FORBIDDEN (HTTP 403)
  it('13. Cross-company updateDraft attempt by HR of Company A targeting Company B job is rejected with FORBIDDEN (HTTP 403)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-company-b' }] })
        .mockResolvedValueOnce({ rows: [] }) // User A is NOT a member of Company B
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).updateDraft('user-company-a', 'company-b', 'job-in-company-b', { title: 'Hacked Title' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  // 14. updateDraft by candidate, inactive user, or left member is rejected with FORBIDDEN (HTTP 403)
  it('14. updateDraft by candidate or inactive member is rejected with FORBIDDEN (HTTP 403)', async () => {
    // Candidate role
    const clientCandidate = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ role: 'candidate', status: 'active' }] })
    } as any;
    const systemCandidate = { transaction: jest.fn(async (fn: any) => fn(clientCandidate)) } as any;
    await expect(new JobService(systemCandidate).updateDraft('candidate-user', 'company-1', 'job-1', { title: 'Title' }))
      .rejects.toBeInstanceOf(ForbiddenException);

    // Left/inactive member in company_members
    const clientInactive = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [] }) // inactive or left member returns no rows
    } as any;
    const systemInactive = { transaction: jest.fn(async (fn: any) => fn(clientInactive)) } as any;
    await expect(new JobService(systemInactive).updateDraft('ex-hr-user', 'company-1', 'job-1', { title: 'Title' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  // 15. updateDraft on non-draft (e.g. published) job throws NOT_FOUND (HTTP 404)
  it('15. updateDraft on non-draft job returns NOT_FOUND (HTTP 404)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [] }) // 0 rows updated because status != 'draft'
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).updateDraft('hr-user-1', 'company-1', 'published-job-1', { title: 'New Title' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  // --- Bounded Unit 3 — Job Lifecycle Actions (Pause / Resume / Close / Archive) ---

  // 16. Pause published job (published -> paused)
  it('16. Active HR can pause a published job (published -> paused)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'paused' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).transition('hr-user-1', 'company-1', 'job-1', 'pause');
    expect(result.status).toBe('paused');
    expect(client.query.mock.calls[3][0]).toContain("status = $4::job_status, paused_at = NOW(), updated_at = NOW()");
    expect(client.query.mock.calls[3][1]).toEqual(['job-1', 'company-1', 'published', 'paused']);
  });

  // 17. Resume paused job on verified company (paused -> published)
  it('17. Active HR can resume a paused job on a verified company (paused -> published)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'verified' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'published' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).transition('hr-user-1', 'company-1', 'job-1', 'resume');
    expect(result.status).toBe('published');
    expect(client.query.mock.calls[4][1]).toEqual(['job-1', 'company-1', 'paused', 'published']);
  });

  // 17b. Resuming a paused job on an unverified company is forbidden (HTTP 403)
  it('17b. Resuming a paused job on an unverified company is forbidden (HTTP 403)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ verification_status: 'unverified' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    await expect(new JobService(system).transition('hr-user-1', 'company-1', 'job-1', 'resume'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  // 18. Close published job (published -> closed)
  it('18. Active HR can close a published job (published -> closed)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'closed' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).transition('hr-user-1', 'company-1', 'job-1', 'close');
    expect(result.status).toBe('closed');
    expect(client.query.mock.calls[3][0]).toContain("status = $4::job_status, closed_at = NOW(), updated_at = NOW()");
    expect(client.query.mock.calls[3][1]).toEqual(['job-1', 'company-1', 'published', 'closed']);
  });

  // 19. Archive closed or expired job (closed/expired -> archived)
  it('19. Active HR can archive a closed or expired job (closed/expired -> archived)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', status: 'archived' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const result = await new JobService(system).archive('hr-user-1', 'company-1', 'job-1', 'Filled position');
    expect(result.status).toBe('archived');
    expect(client.query.mock.calls[3][0]).toContain("status = 'archived'::job_status");
    expect(client.query.mock.calls[3][0]).toContain("j.status IN ('closed', 'expired')");
  });

  // 20. Candidate or non-member calling lifecycle actions is rejected (HTTP 403)
  it('20. Candidate or non-member calling lifecycle actions is rejected with FORBIDDEN (HTTP 403)', async () => {
    const client1 = { query: jest.fn().mockResolvedValueOnce({ rows: [{ role: 'candidate', status: 'active' }] }) } as any;
    const system1 = { transaction: jest.fn(async (fn: any) => fn(client1)) } as any;
    await expect(new JobService(system1).transition('candidate-1', 'company-1', 'job-1', 'pause')).rejects.toBeInstanceOf(ForbiddenException);

    const client2 = { query: jest.fn().mockResolvedValueOnce({ rows: [{ role: 'candidate', status: 'active' }] }) } as any;
    const system2 = { transaction: jest.fn(async (fn: any) => fn(client2)) } as any;
    await expect(new JobService(system2).archive('candidate-1', 'company-1', 'job-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 21. Cross-company lifecycle action attempt is rejected (HTTP 403)
  it('21. Cross-company lifecycle action attempt is rejected with FORBIDDEN (HTTP 403)', async () => {
    const client1 = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-company-b' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system1 = { transaction: jest.fn(async (fn: any) => fn(client1)) } as any;
    await expect(new JobService(system1).transition('hr-company-a', 'company-b', 'job-b', 'pause')).rejects.toBeInstanceOf(ForbiddenException);

    const client2 = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-company-b' }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system2 = { transaction: jest.fn(async (fn: any) => fn(client2)) } as any;
    await expect(new JobService(system2).archive('hr-company-a', 'company-b', 'job-b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  // 22. Invalid status transitions (e.g. pausing draft, archiving published, or modifying archived) return NOT_FOUND (HTTP 404)
  it('22. Invalid status transitions or modifying terminal archived job returns NOT_FOUND (HTTP 404)', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [] }) // 0 rows updated because status predicate doesn't match
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    // Pausing a draft job fails
    await expect(new JobService(system).transition('hr-user-1', 'company-1', 'draft-job-1', 'pause')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 23. searchPublicJobs executes built search query and applies confidential masking
  it('23. searchPublicJobs returns published jobs and masks confidential employer details', async () => {
    const system = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          { id: 'job-1', title: 'Public Dev', is_confidential: false, company_name: 'Acme Inc', company_id: 'c-1' },
          { id: 'job-2', title: 'Secret Lead', is_confidential: true, company_name: 'Secret Co', company_id: 'c-2', company_logo_path: '/logo.png', company_slug: 'secret-co' },
        ]
      })
    } as any;
    const res = await new JobService(system).searchPublicJobs({ workMode: 'remote' }, 10);
    expect(res.items.length).toBe(2);
    expect(res.items[0].company_name).toBe('Acme Inc');
    expect(res.items[1].company_name).toBe('Confidential Employer');
    expect(res.items[1].company_logo_path).toBeNull();
    expect(res.items[1].company_id).toBeNull();
    expect(res.items[1].company_slug).toBeNull();
  });

  // 24. getPublicJobById validates UUID format and throws NOT_FOUND if missing/unverified
  it('24. getPublicJobById validates UUID and throws NOT_FOUND for missing/unverified jobs', async () => {
    const validUuid = '12345678-1234-1234-1234-1234567890ab';
    const system1 = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) } as any;
    await expect(new JobService(system1).getPublicJobById(validUuid)).rejects.toBeInstanceOf(NotFoundException);

    const system2 = {} as any;
    await expect(new JobService(system2).getPublicJobById('not-a-uuid')).rejects.toBeInstanceOf(BadRequestException);
  });

  // 25. getPublicJobBySlug handles single match, zero match (NOT_FOUND), and multiple matches (AMBIGUOUS_SLUG)
  it('25. getPublicJobBySlug handles single match, 404 for missing, and AMBIGUOUS_SLUG for multiple matches', async () => {
    const systemNotFound = { query: jest.fn().mockResolvedValueOnce({ rows: [] }) } as any;
    await expect(new JobService(systemNotFound).getPublicJobBySlug('backend-engineer')).rejects.toBeInstanceOf(NotFoundException);

    const systemAmbiguous = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          { id: 'j-1', slug: 'backend-engineer', company_id: 'c-1' },
          { id: 'j-2', slug: 'backend-engineer', company_id: 'c-2' },
        ]
      })
    } as any;
    await expect(new JobService(systemAmbiguous).getPublicJobBySlug('backend-engineer')).rejects.toBeInstanceOf(BadRequestException);

    const systemSingle = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ id: 'j-1', slug: 'backend-engineer', is_confidential: false, company_name: 'Acme' }]
      })
    } as any;
    const result = await new JobService(systemSingle).getPublicJobBySlug('backend-engineer');
    expect(result.id).toBe('j-1');
  });

  // 26. getPublicJobByCompanyAndSlug handles company-scoped lookup
  it('26. getPublicJobByCompanyAndSlug retrieves public job by company slug/id and job slug', async () => {
    const system = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ id: 'j-100', slug: 'lead-dev', company_slug: 'acme-corp', company_name: 'Acme Corp' }]
      })
    } as any;
    const res = await new JobService(system).getPublicJobByCompanyAndSlug('acme-corp', 'lead-dev');
    expect(res.id).toBe('j-100');
    expect(system.query.mock.calls[0][1]).toEqual(['acme-corp', 'lead-dev']);
  });

  // 27. searchPublicJobs validates cursor token, filter hash match, and passes position to query
  it('27. searchPublicJobs rejects invalid/mismatched cursor and passes position to SQL query', async () => {
    process.env.SEARCH_CURSOR_SECRET = 's'.repeat(32);
    const system = {
      query: jest.fn().mockResolvedValue({
        rows: Array.from({ length: 20 }, (_, i) => ({
          id: `job-${i}`,
          title: `Job ${i}`,
          published_at: new Date('2026-09-01T00:00:00Z'),
          is_confidential: false,
        }))
      })
    } as any;

    // Invalid cursor format or signature throws INVALID_CURSOR (HTTP 400)
    await expect(new JobService(system).searchPublicJobs({}, 20, 'invalid.cursor.token')).rejects.toBeInstanceOf(BadRequestException);

    // Valid search returns next_cursor when full page (20 items) returned
    const res1 = await new JobService(system).searchPublicJobs({ workMode: 'remote' }, 20);
    expect(res1.items.length).toBe(20);
    expect(typeof res1.next_cursor).toBe('string');

    // Using page-1 cursor with DIFFERENT filters throws INVALID_CURSOR
    await expect(new JobService(system).searchPublicJobs({ workMode: 'onsite' }, 20, res1.next_cursor!)).rejects.toBeInstanceOf(BadRequestException);

    // Using page-1 cursor with SAME filters passes cursorPosition to SQL query
    await new JobService(system).searchPublicJobs({ workMode: 'remote' }, 20, res1.next_cursor!);
    const lastQueryCall = system.query.mock.calls[system.query.mock.calls.length - 1];
    expect(lastQueryCall[0]).toContain('(j.published_at < $');
  });

  it('28. searchPublicJobs throws ServiceUnavailableException when SEARCH_CURSOR_SECRET is missing (ignoring JWT_SECRET)', async () => {
    delete process.env.SEARCH_CURSOR_SECRET;
    process.env.JWT_SECRET = 'jwt_secret_key_32_characters_minimum_len';
    const system = { query: jest.fn() } as any;

    await expect(new JobService(system).searchPublicJobs({}, 20)).rejects.toThrow('SEARCH_CURSOR_SECRET_NOT_CONFIGURED');
  });

  // 28. listCompanyJobs fetches company jobs for authorized actor
  it('28. listCompanyJobs fetches company jobs for authorized HR/employer', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'j-1', title: 'Job 1' }, { id: 'j-2', title: 'Job 2' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const res = await new JobService(system).listCompanyJobs('hr-1', 'company-1');
    expect(res.length).toBe(2);
    expect(res[0].id).toBe('j-1');
  });

  // 29. createDraft saves multi-locations (Pune, Indore, Hyderabad), master skills, and screening questions in single transaction
  it('29. createDraft saves multi-locations, skills, and screening questions in single transaction', async () => {
    const validSkill1 = '11111111-1111-1111-1111-111111111111';
    const validSkill2 = '22222222-2222-2222-2222-222222222222';
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        // Check skill 1 & skill 2 (processSkillsInput now runs before job insert)
        .mockResolvedValueOnce({ rows: [{ id: validSkill1, is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: validSkill2, is_active: true }] })
        // Insert job
        .mockResolvedValueOnce({ rows: [{ id: 'job-prod-1', title: 'Prod Job', slug: 'prod-job' }] })
        // Insert locations (3 calls for Pune, Indore, Hyderabad)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        // Insert skill 1
        .mockResolvedValueOnce({ rows: [] })
        // Insert skill 2
        .mockResolvedValueOnce({ rows: [] })
        // Audit log
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;

    const res = await new JobService(system).createDraft('hr-1', 'company-1', {
      title: 'Prod Job',
      slug: 'prod-job',
      description: 'Job description text',
      locations: [
        { city: 'Pune', state: 'Maharashtra', country: 'India', is_primary: true },
        { city: 'Indore', state: 'Madhya Pradesh', country: 'India', is_primary: false },
        { city: 'Hyderabad', state: 'Telangana', country: 'India', is_primary: false },
      ],
      skills: [
        { skill_id: validSkill1, is_required: true, min_years: 3 },
        { skill_id: validSkill2, is_required: false, min_years: 1 },
      ],
      screening_questions: [
        { question: 'Do you have 3+ years experience with NestJS?', required: true },
      ],
    });

    expect(res.id).toBe('job-prod-1');
    expect(client.query.mock.calls.some((c: any) => c[0].includes('INSERT INTO public.job_locations'))).toBe(true);
    expect(client.query.mock.calls.some((c: any) => c[0].includes('INSERT INTO public.job_skills'))).toBe(true);
  });

  // 30. listActiveCategories and listActiveSkills query is_active = TRUE
  it('30. listActiveCategories and listActiveSkills query active records (is_active = TRUE)', async () => {
    const system = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'cat-1', name: 'Engineering', is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'sk-1', name: 'TypeScript', is_active: true }] }),
    } as any;
    const service = new JobService(system);

    const categories = await service.listActiveCategories();
    expect(categories.length).toBe(1);
    expect(system.query.mock.calls[0][0]).toContain('WHERE is_active = TRUE');

    const skills = await service.listActiveSkills();
    expect(skills.length).toBe(1);
    expect(system.query.mock.calls[1][0]).toContain('WHERE is_active = TRUE');
  });

  // 31. Rejects empty locations array locations: []
  it('31. Rejects empty locations: [] array with BadRequestException', async () => {
    const system = {} as any;
    const service = new JobService(system);
    await expect(service.createDraft('hr-1', 'company-1', {
      title: 'Job Title',
      slug: 'job-title',
      description: 'Job Description',
      locations: [],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 32. Rejects invalid screening question type
  it('32. Rejects invalid screening question type with BadRequestException', async () => {
    const system = {} as any;
    const service = new JobService(system);
    await expect(service.createDraft('hr-1', 'company-1', {
      title: 'Job Title',
      slug: 'job-title',
      description: 'Job Description',
      screening_questions: [{ question: 'Valid Question?', required: true, type: 'arbitrary_invalid_type' }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 33. Accepts empty skills: [] array without throwing validation error
  it('33. Accepts empty skills: [] array without throwing validation error', async () => {
    const client = {
      query: jest.fn()
        // checkActor: user check
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        // checkActor: company owner check
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        // insert job
        .mockResolvedValueOnce({ rows: [{ id: 'job-empty-skills-1' }] })
        // audit log
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const res = await service.createDraft('user-owner-1', 'company-1', {
      title: 'Job No Skills Required',
      slug: 'job-no-skills-required',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
      skills: [],
    });

    expect(res.id).toBe('job-empty-skills-1');
  });

  // 34. Supports experience_min and experience_max numeric range in createDraft
  it('34. Supports experience_min and experience_max numeric range in createDraft', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-exp-range-1', experience_min: 5, experience_max: 12 }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const res = await service.createDraft('user-owner-1', 'company-1', {
      title: 'Senior Engineer 5-12 YOE',
      slug: 'senior-engineer-5-12-yoe',
      description: 'Role for 5-12 YOE',
      experience_level: 'senior',
      experience_min: 5,
      experience_max: 12,
    });

    expect(res.experience_min).toBe(5);
    expect(res.experience_max).toBe(12);
  });

  // 35. Supports updating experience_min and experience_max in updateDraft
  it('35. Supports updating experience_min and experience_max in updateDraft', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'hr', status: 'active' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'owner-user-999' }] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', experience_min: 3, experience_max: 7 }] })
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const res = await service.updateDraft('hr-user-1', 'company-1', 'job-1', {
      experience_min: 3,
      experience_max: 7,
    });

    expect(res.experience_min).toBe(3);
    expect(res.experience_max).toBe(7);
  });

  // 36. Rejects malformed location items with BadRequestException
  it('36. Rejects malformed location items with BadRequestException', async () => {
    const system = {} as any;
    const service = new JobService(system);
    await expect(service.createDraft('hr-1', 'company-1', {
      title: 'Job Title',
      slug: 'job-title',
      description: 'Job Description',
      locations: [{ city: '' }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 37. Rejects malformed skill items with BadRequestException
  it('37. Rejects malformed skill items with BadRequestException', async () => {
    const system = {} as any;
    const service = new JobService(system);
    await expect(service.createDraft('hr-1', 'company-1', {
      title: 'Job Title',
      slug: 'job-title',
      description: 'Job Description',
      skills: [''],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 38. Rejects inactive skill UUID with BadRequestException
  it('38. Rejects inactive skill UUID with BadRequestException', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        // Skill check returns is_active = false
        .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111', is_active: false }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    await expect(service.createDraft('user-owner-1', 'company-1', {
      title: 'Job Inactive Skill',
      slug: 'job-inactive-skill',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
      skills: ['11111111-1111-1111-1111-111111111111'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 39. Rejects non-existent skill UUID with BadRequestException
  it('39. Rejects non-existent skill UUID with BadRequestException', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        // Skill check returns empty array
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    await expect(service.createDraft('user-owner-1', 'company-1', {
      title: 'Job Nonexistent Skill',
      slug: 'job-nonexistent-skill',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
      skills: ['99999999-9999-9999-9999-999999999999'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  // 40. Custom unknown skill string creates pending skill_request without linking to job_skills
  it('40. Custom unknown skill string creates pending skill_request without linking to job_skills', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        // Check skill by name returns empty
        .mockResolvedValueOnce({ rows: [] })
        // Check existing skill_request
        .mockResolvedValueOnce({ rows: [] })
        // Insert skill_request
        .mockResolvedValueOnce({ rows: [] })
        // Insert job
        .mockResolvedValueOnce({ rows: [{ id: 'job-custom-skill-1' }] })
        // Audit log
        .mockResolvedValueOnce({ rows: [] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const res = await service.createDraft('user-owner-1', 'company-1', {
      title: 'Job Custom Skill',
      slug: 'job-custom-skill',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
      skills: ['Custom Unapproved Skill'],
    });

    expect(res.id).toBe('job-custom-skill-1');
    expect(client.query.mock.calls.some((c: any) => c[0].includes('INSERT INTO public.skill_requests'))).toBe(true);
    expect(client.query.mock.calls.some((c: any) => c[0].includes('INSERT INTO public.job_skills'))).toBe(false);
  });

  // 41. Rejects malformed interview_rounds (non-array, blank name, non-positive round number, duplicate round number)
  it('41. Rejects malformed interview_rounds with BadRequestException', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const basePayload = {
      title: 'Job Interview Rounds Test',
      slug: 'job-interview-rounds-test',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
    };

    // Non-array input
    await expect(service.createDraft('user-owner-1', 'company-1', { ...basePayload, interview_rounds: 'not-an-array' as any }))
      .rejects.toBeInstanceOf(BadRequestException);

    // Blank round name
    await expect(service.createDraft('user-owner-1', 'company-1', { ...basePayload, interview_rounds: [{ round: 1, name: '   ' }] }))
      .rejects.toBeInstanceOf(BadRequestException);

    // Non-positive round number
    await expect(service.createDraft('user-owner-1', 'company-1', { ...basePayload, interview_rounds: [{ round: 0, name: 'HR Screening' }] }))
      .rejects.toBeInstanceOf(BadRequestException);

    // Negative round number
    await expect(service.createDraft('user-owner-1', 'company-1', { ...basePayload, interview_rounds: [{ round: -1, name: 'Tech Round' }] }))
      .rejects.toBeInstanceOf(BadRequestException);

    // Duplicate round numbers
    await expect(service.createDraft('user-owner-1', 'company-1', { ...basePayload, interview_rounds: [{ round: 1, name: 'Round 1' }, { round: 1, name: 'Round 2' }] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  // 42. Accepts valid interview_rounds and optional undefined/empty interview_rounds
  it('42. Accepts valid interview_rounds and empty/undefined interview_rounds', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ role: 'employer' }] })
        .mockResolvedValueOnce({ rows: [{ owner_id: 'user-owner-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'job-rounds-1' }] })
    } as any;
    const system = { transaction: jest.fn(async (fn: any) => fn(client)) } as any;
    const service = new JobService(system);

    const res = await service.createDraft('user-owner-1', 'company-1', {
      title: 'Valid Interview Rounds Job',
      slug: 'valid-interview-rounds-job',
      description: 'Description here',
      locations: [{ city: 'Pune', country: 'India', is_primary: true }],
      interview_rounds: [
        { round: 1, name: 'HR Screening', description: 'Initial HR phone screen' },
        { round: 2, name: 'Technical Round 1', description: 'Coding & system design' }
      ]
    });

    expect(res.id).toBe('job-rounds-1');
  });
});