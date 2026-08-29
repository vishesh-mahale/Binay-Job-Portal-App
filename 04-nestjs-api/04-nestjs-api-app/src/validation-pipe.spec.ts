import { ValidationPipe } from '@nestjs/common';
import { CreateCompanyDto } from './companies';
import { CreateBranchDto } from './organization';
import { SignupDto } from './auth-provider';
import { AddCompanyMemberDto } from './membership';
import { TransferOwnershipDto } from './ownership';
import { RevokePresenceSessionDto } from './identity-company';
import { UpdateCandidateProfileDto } from './candidate';

const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

describe('global ValidationPipe DTO whitelist contract', () => {
  test.each([
    [SignupDto, { email: 'user@example.com', password: 'secret' }],
    [CreateCompanyDto, { name: 'Acme', slug: 'acme', email: 'owner@example.com' }],
    [CreateBranchDto, { name: 'HQ', city: 'Pune', country: 'IN' }],
    [AddCompanyMemberDto, { user_id: '00000000-0000-4000-8000-000000000001' }],
    [TransferOwnershipDto, { new_owner_user_id: '00000000-0000-4000-8000-000000000002' }],
    [RevokePresenceSessionDto, { session_id: '00000000-0000-4000-8000-000000000003' }],
    [UpdateCandidateProfileDto, { expected_profile_revision: 0 }],
  ])('accepts valid body for %p', async (metatype, body) => {
    await expect(pipe.transform(body, { type: 'body', metatype, data: '' })).resolves.toBeDefined();
  });

  test('rejects unknown fields on decorated DTOs', async () => {
    await expect(pipe.transform({ email: 'user@example.com', password: 'secret', unknown: true }, { type: 'body', metatype: SignupDto, data: '' }))
      .rejects.toMatchObject({ response: expect.objectContaining({ statusCode: 400 }) });
  });
});
