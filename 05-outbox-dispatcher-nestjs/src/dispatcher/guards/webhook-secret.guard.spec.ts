import { UnauthorizedException } from '@nestjs/common';
import { constantTimeEquals, WebhookSecretGuard, WEBHOOK_SECRET_HEADER } from './webhook-secret.guard';
import { AppConfigService } from '../../config/app-config.service';

function contextFor(headers: Record<string, string>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as never;
}

function configFor(secret: string, previous?: string): AppConfigService {
  return { webhookSecret: secret, webhookSecretPrevious: previous } as AppConfigService;
}

describe('WebhookSecretGuard', () => {
  const guard = (secret: string, previous?: string) => new WebhookSecretGuard(configFor(secret, previous));

  it('rejects a missing header', () => {
    expect(() => guard('s3cret').canActivate(contextFor({}))).toThrow(UnauthorizedException);
  });

  it('rejects an empty header', () => {
    expect(() => guard('s3cret').canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: '' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a wrong secret', () => {
    expect(() => guard('s3cret').canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 'wrong' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the current secret', () => {
    expect(guard('s3cret').canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 's3cret' }))).toBe(true);
  });

  it('accepts the PREVIOUS secret during a rotation window', () => {
    const g = guard('new-secret', 'old-secret');
    expect(g.canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 'old-secret' }))).toBe(true);
    expect(g.canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 'new-secret' }))).toBe(true);
    expect(() => g.canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 'other' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('does not treat an empty configured previous secret as valid', () => {
    const g = guard('s3cret', undefined);
    expect(() => g.canActivate(contextFor({ [WEBHOOK_SECRET_HEADER]: 'anything' }))).toThrow(
      UnauthorizedException,
    );
  });
});

describe('constantTimeEquals', () => {
  it('matches equal strings and rejects different ones', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
  });

  it('rejects length-mismatched strings without throwing', () => {
    expect(constantTimeEquals('short', 'much-longer-secret')).toBe(false);
    expect(constantTimeEquals('', 'x')).toBe(false);
  });

  it('handles unicode content', () => {
    expect(constantTimeEquals('pässwörd', 'pässwörd')).toBe(true);
    expect(constantTimeEquals('pässwörd', 'passwort')).toBe(false);
  });
});
