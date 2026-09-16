import { ValidationPipe } from '@nestjs/common';
import { CreateCompanyDto } from '../../modules/identity/companies';
import { CreateBranchDto, UpdateBranchDto, CreateDepartmentDto, UpdateDepartmentDto, CreateTeamDto, UpdateTeamDto } from '../../modules/identity/organization';
import { SignupDto, LoginDto, ChangePasswordDto, ResetPasswordDto } from '../../modules/auth/auth-provider';
import { AddCompanyMemberDto } from '../../modules/identity/membership';
import { TransferOwnershipDto } from '../../modules/identity/ownership';
import { RevokePresenceSessionDto } from '../../modules/identity/identity-company';
import { UpdateCandidateProfileDto, ArchiveCandidateFactDto } from '../../modules/candidates/candidate';
import { CreateJobDto, UpdateJobDto, JobReasonDto } from '../../modules/jobs/jobs';
import { SubmitApplicationDto, ChangeApplicationStatusDto } from '../../modules/applications/applications';
import { SaveCandidateDto } from '../../modules/applications/saved-candidates';
import { SubmitFeedbackDto } from '../../modules/analytics/feedback';
import { IngestAnalyticsEventDto } from '../../modules/analytics/analytics';
import { GuestSessionCreateDto, GuestApplicationDto, GuestClaimDto } from '../../modules/candidates/guest';
import { ConfirmResumeDto } from '../../modules/candidates/resume';
import { ScheduleInterviewDto, InterviewStatusDto, RescheduleInterviewDto, InterviewUpdateDto } from '../../modules/interviews/interviews';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('global ValidationPipe DTO whitelist contract', () => {
  test.each([
    [SignupDto, { email: 'user@example.com', password: 'secret123' }],
    [SignupDto, { email: 'user@example.com', password: 'secret123', register_as: 'candidate' }],
    [SignupDto, { email: 'user@example.com', password: 'secret123', register_as: 'employer' }],
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
    await expect(pipe.transform({ email: 'user@example.com', password: 'secret123', register_as: 'hr' }, { type: 'body', metatype: SignupDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ email: 'user@example.com', password: 'secret123', register_as: 'admin' }, { type: 'body', metatype: SignupDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    await expect(pipe.transform({ email: 'user@example.com', password: 'secret123', register_as: 'invalid' }, { type: 'body', metatype: SignupDto, data: '' }))
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

  describe('Comprehensive Email Validation & Normalization Matrix (20 Test Cases)', () => {
    const invalidEmailCases = [
      'test',
      'test@',
      '@gmail.com',
      'test@gmail',
      'test@domain',
      'test@gmail.',
      '.test@gmail.com',
      'test..abc@gmail.com',
      'test @gmail.com',
      'test@@gmail.com',
      'test@gmail,com',
      '123',
      '',
    ];

    test.each(invalidEmailCases)('ValidationPipe rejects invalid email input: %p', async (email) => {
      await expect(pipe.transform({ email, password: 'password123' }, { type: 'body', metatype: SignupDto, data: '' }))
        .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    });

    const validEmailCases = [
      'test@gmail.com',
      'john.doe+test@gmail.com',
      'user_name@gmail.com',
      'TEST@GMAIL.COM',
      'test@gmail.com ',
      ' test@gmail.com',
    ];

    test.each(validEmailCases)('ValidationPipe accepts valid email input: %p', async (email) => {
      const result = await pipe.transform({ email, password: 'password123' }, { type: 'body', metatype: SignupDto, data: '' });
      expect(result).toBeDefined();
    });
  });

  describe('Comprehensive Password Validation Matrix (Signup, Change, Reset)', () => {
    const weakPasswords = ['123', '123456', 'pass', 'P@ss1', 'Pass1!', 'Ab1!', ''];
    const validPasswords = ['password123', 'Password@123', 'MyJob@2026', 'Abcdefgh1!'];

    test.each(weakPasswords)('SignupDto rejects weak password (< 8 chars): %p', async (password) => {
      await expect(pipe.transform({ email: 'user@example.com', password }, { type: 'body', metatype: SignupDto, data: '' }))
        .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    });

    test.each(weakPasswords)('ChangePasswordDto rejects weak new_password (< 8 chars): %p', async (new_password) => {
      await expect(pipe.transform({ current_password: 'oldpassword123', new_password }, { type: 'body', metatype: ChangePasswordDto, data: '' }))
        .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    });

    test.each(weakPasswords)('ResetPasswordDto rejects weak new_password (< 8 chars): %p', async (new_password) => {
      await expect(pipe.transform({ recovery_token: 'valid-token', new_password }, { type: 'body', metatype: ResetPasswordDto, data: '' }))
        .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
    });

    test.each(validPasswords)('SignupDto, ChangePasswordDto, ResetPasswordDto accept valid passwords: %p', async (pwd) => {
      await expect(pipe.transform({ email: 'user@example.com', password: pwd }, { type: 'body', metatype: SignupDto, data: '' })).resolves.toBeDefined();
      await expect(pipe.transform({ current_password: 'oldpassword123', new_password: pwd }, { type: 'body', metatype: ChangePasswordDto, data: '' })).resolves.toBeDefined();
      await expect(pipe.transform({ recovery_token: 'tok', new_password: pwd }, { type: 'body', metatype: ResetPasswordDto, data: '' })).resolves.toBeDefined();
    });
  });
});