export interface ResetPasswordState {
  status: 'loading' | 'form' | 'success' | 'error';
  recoveryToken: string | null;
  errorMessage: string | null;
}

export function parseResetPasswordHash(hash: string): ResetPasswordState {
  if (!hash || hash.length <= 1) {
    return { status: 'error', recoveryToken: null, errorMessage: 'Missing recovery token. Please request a new password reset link.' };
  }

  const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
  const params = new URLSearchParams(cleanHash);

  const error = params.get('error');
  const errorCode = params.get('error_code');
  const errorDescription = params.get('error_description');

  if (error || errorCode || errorDescription) {
    let msg = 'Password reset link has expired or is invalid.';
    if (errorDescription) msg = decodeURIComponent(errorDescription.replace(/\+/g, ' '));
    else if (errorCode === 'otp_expired') msg = 'Password reset link has expired. Please request a new link.';
    return { status: 'error', recoveryToken: null, errorMessage: msg };
  }

  const accessToken = params.get('access_token');
  const type = params.get('type');

  if (accessToken && type === 'recovery') {
    return { status: 'form', recoveryToken: accessToken, errorMessage: null };
  }

  return { status: 'error', recoveryToken: null, errorMessage: 'Invalid recovery token format.' };
}
