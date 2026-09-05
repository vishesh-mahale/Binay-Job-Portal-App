import { InvitationTokenUtil, UnknownKeyIdException } from './invitation-token.util';

describe('InvitationTokenUtil Unit Tests', () => {
  it('1. Generates 32-byte raw token and valid 64-char SHA-256 hash', () => {
    const { rawToken, tokenHash } = InvitationTokenUtil.generateToken();
    expect(rawToken).toBeDefined();
    expect(rawToken.length).toBeGreaterThanOrEqual(40); // base64url 32 bytes
    expect(tokenHash).toHaveLength(64); // SHA-256 hex string is exactly 64 chars
    expect(InvitationTokenUtil.hashToken(rawToken)).toBe(tokenHash);
  });

  it('2. Encrypts and decrypts outbox payload using AES-256-GCM', () => {
    const samplePayload = {
      invitation_id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'hr_candidate@acme.com',
      company_name: 'Acme Corp',
      rawToken: 'test_raw_token_value_12345',
    };

    const encrypted = InvitationTokenUtil.encryptPayload(samplePayload, 'v1');
    expect(encrypted.version).toBe(1);
    expect(encrypted.key_id).toBe('v1');
    expect(encrypted.nonce).toBeDefined();
    expect(encrypted.auth_tag).toBeDefined();
    expect(encrypted.ciphertext).toBeDefined();

    const decrypted = InvitationTokenUtil.decryptPayload(encrypted);
    expect(decrypted).toEqual(samplePayload);
  });

  it('3. Throws UnknownKeyIdException on unknown key_id without crashing', () => {
    const samplePayload = { test: 'data' };
    expect(() => InvitationTokenUtil.encryptPayload(samplePayload, 'unknown_v99')).toThrow(UnknownKeyIdException);
    
    try {
      InvitationTokenUtil.encryptPayload(samplePayload, 'unknown_v99');
    } catch (err: any) {
      expect(err).toBeInstanceOf(UnknownKeyIdException);
      expect(err.keyId).toBe('unknown_v99');
    }
  });

  it('4. Computes deterministic SHA-256 hash regardless of whitespace', () => {
    const hash1 = InvitationTokenUtil.hashToken('my_raw_token_xyz');
    const hash2 = InvitationTokenUtil.hashToken('  my_raw_token_xyz  ');
    expect(hash1).toBe(hash2);
  });
});
