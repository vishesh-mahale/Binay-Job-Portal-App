export function parseAllowlist(value?: string): string[] {
  return (value ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function assertAllowedProvider(provider: string, allowlist: string[]): string {
  const normalized = provider.trim().toLowerCase();
  if (!normalized || !allowlist.includes(normalized)) throw new Error('OAUTH_PROVIDER_NOT_ALLOWED');
  return normalized;
}

export function assertExactRedirect(redirectUri: string, allowedUri: string): string {
  if (!redirectUri || redirectUri !== allowedUri) throw new Error('OAUTH_REDIRECT_NOT_ALLOWED');
  return redirectUri;
}
