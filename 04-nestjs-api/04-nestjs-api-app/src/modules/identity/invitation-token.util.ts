import * as crypto from 'crypto';

export interface EncryptedTokenPayload {
  version: number;
  key_id: string;
  nonce: string;
  auth_tag: string;
  ciphertext: string;
}

export class UnknownKeyIdException extends Error {
  constructor(public readonly keyId: string) {
    super(`UnknownKeyIdException: key_id '${keyId}' not found in INVITATION_KEY_REGISTRY.`);
    this.name = 'UnknownKeyIdException';
  }
}

export class InvitationTokenUtil {
  private static getKeyRegistry(): Record<string, string> {
    const secret = process.env.INVITATION_TOKEN_SECRET || process.env.INVITATION_TOKEN_SECRET_V1;
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error('FAIL-CLOSED SECURITY: INVITATION_TOKEN_SECRET environment variable is missing!');
    }
    return {
      v1: secret.trim(),
    };
  }

  /**
   * Generates a 32-byte cryptographically random raw token (base64url)
   * and its SHA-256 hex digest for database storage.
   */
  static generateToken(): { rawToken: string; tokenHash: string } {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    return { rawToken, tokenHash };
  }

  /**
   * Computes SHA-256 hex digest for a raw token.
   */
  static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  }

  /**
   * Encrypts raw token payload using AES-256-GCM for crash-safe outbox delivery.
   */
  static encryptPayload(payloadData: Record<string, unknown>, keyId = 'v1'): EncryptedTokenPayload {
    const registry = this.getKeyRegistry();
    const secretKeyHex = registry[keyId];
    if (!secretKeyHex) {
      throw new UnknownKeyIdException(keyId);
    }

    // Ensure 32-byte key buffer
    const keyBuffer = crypto.createHash('sha256').update(secretKeyHex).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);

    const jsonStr = JSON.stringify(payloadData);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'base64url');
    ciphertext += cipher.final('base64url');
    const authTag = cipher.getAuthTag().toString('base64url');

    return {
      version: 1,
      key_id: keyId,
      nonce: iv.toString('base64url'),
      auth_tag: authTag,
      ciphertext,
    };
  }

  /**
   * Decrypts AES-256-GCM outbox payload into original JSON object.
   */
  static decryptPayload(payload: EncryptedTokenPayload): Record<string, unknown> {
    const registry = this.getKeyRegistry();
    const secretKeyHex = registry[payload.key_id];
    if (!secretKeyHex) {
      throw new UnknownKeyIdException(payload.key_id);
    }

    const keyBuffer = crypto.createHash('sha256').update(secretKeyHex).digest();
    const iv = Buffer.from(payload.nonce, 'base64url');
    const authTag = Buffer.from(payload.auth_tag, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(payload.ciphertext, 'base64url', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }
}
