import { ValidationPipe } from '@nestjs/common';
import { CreateCompanyDto } from './companies';
import { CreateBranchDto, UpdateBranchDto, CreateDepartmentDto, UpdateDepartmentDto, CreateTeamDto, UpdateTeamDto } from './organization';
import { SignupDto, LoginDto } from './auth-provider';
import { AddCompanyMemberDto } from './membership';
import { TransferOwnershipDto } from './ownership';
import { RevokePresenceSessionDto } from './identity-company';
import { UpdateCandidateProfileDto, ArchiveCandidateFactDto } from './candidate';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('global ValidationPipe DTO whitelist contract', () => {
  test.each([
    [SignupDto, { email: 'user@example.com', password: 'secret123' }],
    [LoginDto, { email: 'user@example.com', password: 'secret123' }],
    [CreateCompanyDto, { name: 'Acme', slug: 'acme', email: 'owner@example.com' }],
    [CreateBranchDto, { name: 'HQ', city: 'Pune', country: 'IN' }],
    [UpdateBranchDto, { name: 'HQ', city: 'Pune', country: 'IN', is_active: true }],
    [CreateDepartmentDto, { name: 'Engineering' }],
    [UpdateDepartmentDto, { name: 'Engineering', is_active: true }],
    [CreateTeamDto, { department_id: '00000000-0000-4000-8000-000000000001', name: 'Platform' }],
    [UpdateTeamDto, { name: 'Platform', is_active: true }],
    [AddCompanyMemberDto, { user_id: '00000000-0000-4000-8000-000000000001' }],
    [TransferOwnershipDto, { new_owner_user_id: '00000000-0000-4000-8000-000000000002' }],
    [RevokePresenceSessionDto, { session_id: '00000000-0000-4000-8000-000000000003' }],
    [UpdateCandidateProfileDto, { expected_profile_revision: 1 }],
    [ArchiveCandidateFactDto, { expected_profile_revision: 1 }],
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
  });
});
