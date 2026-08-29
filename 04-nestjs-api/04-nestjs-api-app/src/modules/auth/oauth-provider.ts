import type { AuthSession } from './auth-provider';

/** Provider boundary for OAuth. Concrete Supabase endpoint/grant details stay isolated here. */
export interface OAuthProvider {
  authorizationUrl(input: { provider: string; redirectUri: string; state: string; codeChallenge: string }): Promise<string>;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<AuthSession & { authProvider: string }>;
}