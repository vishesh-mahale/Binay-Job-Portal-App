import { ValidationPipe } from '@nestjs/common';
import { CreateCompanyDto } from './companies';
import { CreateBranchDto, UpdateBranchDto, CreateDepartmentDto, UpdateDepartmentDto, CreateTeamDto, UpdateTeamDto } from './organization';
import { SignupDto, LoginDto } from './auth-provider';
import { AddCompanyMemberDto } from './membership';
import { TransferOwnershipDto } from './ownership';
import { RevokePresenceSessionDto } from './identity-company';
import { UpdateCandidateProfileDto, ArchiveCandidateFactDto } from './candidate';
import { CreateJobDto, UpdateJobDto, JobReasonDto } from './jobs';
import { SubmitApplicationDto, ChangeApplicationStatusDto } from './applications';
import { SaveCandidateDto } from './saved-candidates';
import { SubmitFeedbackDto } from './feedback';
import { IngestAnalyticsEventDto } from './analytics';
import { GuestSessionCreateDto, GuestApplicationDto, GuestClaimDto } from './guest';
import { ConfirmResumeDto } from './resume';
import { ScheduleInterviewDto, InterviewStatusDto, RescheduleInterviewDto, InterviewUpdateDto } from './interviews';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('global ValidationPipe DTO whitelist contract', () => {
  test.each([
    [SignupDto, { email: 'user@example.com', password: 'secret123' }],
    [LoginDto, { email: 'user@example.com', password: 'secret123' }],
    [CreateCompanyDto, { name: 'Acme', slug: 'acme', email: 'owner@example.com' }],
    [CreateBranchDto, { name: 'HQ', city: 'Pune', country: 'IN' }],
    [UpdateBranchDto, { name: 'HQ', city: 'Pune', country: 'IN', is_active: true }],
    [UpdateBranchDto, { is_active: false }],
    [CreateDepartmentDto, { name: 'Engineering' }],
    [UpdateDepartmentDto, { name: 'Engineering', is_active: true }],
    [UpdateDepartmentDto, { is_active: false }],
    [CreateTeamDto, { department_id: '00000000-0000-4000-8000-000000000001', name: 'Platform' }],
    [UpdateTeamDto, { name: 'Platform', is_active: true }],
    [AddCompanyMemberDto, { user_id: '00000000-0000-4000-8000-000000000001' }],
    [TransferOwnershipDto, { new_owner_user_id: '00000000-0000-4000-8000-000000000002' }],
    [RevokePresenceSessionDto, { session_id: '00000000-0000-4000-8000-000000000003' }],
    [UpdateCandidateProfileDto, { expected_profile_revision: 1 }],
    [ArchiveCandidateFactDto, { expected_profile_revision: 1 }],
    [CreateJobDto, { title: 'Java Engineer', slug: 'java-engineer', description: 'Build APIs' }],
    [UpdateJobDto, { title: 'Senior Java Engineer' }],
    [JobReasonDto, { reason: 'Role no longer needed' }],
    [SubmitApplicationDto, { document_id: '00000000-0000-4000-8000-000000000001', consent: true, answers_to_screening_questions: [] }],
    [ChangeApplicationStatusDto, { status: 'under_review' }],
    [SaveCandidateDto, { private_note: 'Priority candidate' }],
    [SubmitFeedbackDto, { message: 'Helpful product', rating: 5 }],
    [IngestAnalyticsEventDto, { idempotency_key: 'evt-1', event_name: 'job.viewed', event_category: 'engagement', event_data: { job_id: 'j1' } }],
    [GuestSessionCreateDto, { job_id: '00000000-0000-4000-8000-000000000001', email: 'guest@example.com' }],
    [GuestApplicationDto, { job_id: '00000000-0000-4000-8000-000000000001', session_id: '00000000-0000-4000-8000-000000000002', document_id: '00000000-0000-4000-8000-000000000003', name: 'Guest User', email: 'guest@example.com', token: 'opaque-token' }],
    [GuestClaimDto, { claim_token: 'opaque-token' }],
    [ConfirmResumeDto, { expected_profile_revision: 1, profile: { summary: 'Updated' }, facts: { skills: [] } }],
    [ScheduleInterviewDto, { schedule_block_id: '00000000-0000-4000-8000-000000000001', interviewer_id: '00000000-0000-4000-8000-000000000002', title: 'Technical round', type: 'video', scheduled_at: '2030-01-01T10:00:00Z', duration_minutes: 60, timezone: 'Asia/Kolkata' }],
    [InterviewStatusDto, { status: 'cancelled', reason: 'Candidate unavailable' }],
    [RescheduleInterviewDto, { schedule_block_id: '00000000-0000-4000-8000-000000000001', interviewer_id: '00000000-0000-4000-8000-000000000002', scheduled_at: '2030-01-01T10:00:00Z', duration_minutes: 60, timezone: 'Asia/Kolkata', status: 'rescheduled' }],
    [InterviewUpdateDto, { status: 'cancelled', reason: 'Cancelled by HR' }],
  ])('accepts valid body for %p', async (metatype, body) => {
    await expect(pipe.transform(body, { type: 'body', metatype, data: '' })).resolves.toBeDefined();
  });

  test('rejects unknown fields on decorated DTOs', async () => {
    await expect(pipe.transform({ email: 'user@example.com', password: 'secret123', unknown: true }, { type: 'body', metatype: SignupDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
  });

  test('rejects malformed typed fields at the HTTP boundary', async () => {
    await expect(pipe.transform({ email: 'not-an-email', password: 'secret123' }, { type: 'body', metatype: SignupDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ new_owner_user_id: 'not-a-uuid' }, { type: 'body', metatype: TransferOwnershipDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ expected_profile_revision: 'bad' }, { type: 'body', metatype: UpdateCandidateProfileDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ user_id: '00000000-0000-4000-8000-000000000001', title: 42 }, { type: 'body', metatype: AddCompanyMemberDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ latitude: 'bad' }, { type: 'body', metatype: UpdateBranchDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ title: 42, slug: 'java-engineer', description: 'Build APIs' }, { type: 'body', metatype: CreateJobDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ reason: 42 }, { type: 'body', metatype: JobReasonDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ document_id: 'bad', consent: true }, { type: 'body', metatype: SubmitApplicationDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ message: 'bad', rating: 6 }, { type: 'body', metatype: SubmitFeedbackDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ idempotency_key: 'evt-1', event_name: 'job.viewed', event_category: 'engagement', event_data: [] }, { type: 'body', metatype: IngestAnalyticsEventDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ job_id: 'bad', email: 'guest@example.com' }, { type: 'body', metatype: GuestSessionCreateDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ expected_profile_revision: 'bad' }, { type: 'body', metatype: ConfirmResumeDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ schedule_block_id: 'bad', interviewer_id: '00000000-0000-4000-8000-000000000002', title: 'Round', type: 'video', scheduled_at: '2030-01-01T10:00:00Z', duration_minutes: 60, timezone: 'Asia/Kolkata' }, { type: 'body', metatype: ScheduleInterviewDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
  });
});
