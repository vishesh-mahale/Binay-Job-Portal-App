export function parseVerifyEmailHash(hash: string): {
  status: 'pending' | 'success' | 'error';
  errorMessage: string | null;
} {
  if (!hash || hash.length <= 1) {
    return { status: 'pending', errorMessage: null };
  }

  try {
    const rawHash = hash.startsWith('#') ? hash.substring(1) : hash;
    const params = new URLSearchParams(rawHash);
    const errorParam = params.get('error');
    const errorCodeParam = params.get('error_code');
    const errorDescParam = params.get('error_description');
    const typeParam = params.get('type');
    const accessToken = params.get('access_token');

    // Rule 1: Evaluate error parameters FIRST before success
    if (errorParam || errorCodeParam || errorDescParam) {
      return {
        status: 'error',
        errorMessage: errorDescParam
          ? decodeURIComponent(errorDescParam.replace(/\+/g, ' '))
          : 'Verification link has expired or is invalid. Please try signing in or registering again.',
      };
    }

    // Rule 2: Evaluate success (type === 'signup' AND non-empty access_token)
    if (typeParam === 'signup' && accessToken && accessToken.trim() !== '') {
      return { status: 'success', errorMessage: null };
    }

    // Rule 3: Unrecognized or incomplete hash
    return {
      status: 'error',
      errorMessage: 'Verification link is incomplete or invalid. Please request a new link.',
    };
  } catch {
    return {
      status: 'error',
      errorMessage: 'Failed to parse verification link. Please try signing in or registering again.',
    };
  }
}
