import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import LoginPage from './login/page';
import SignupPage from './signup/page';
import VerifyEmailPage from './verify-email/page';
import { parseVerifyEmailHash } from '@/lib/verify-email-parser';
import ForgotPasswordPage from './forgot-password/page';
import ResetPasswordPage from './reset-password/page';
import { parseResetPasswordHash } from '@/lib/reset-password-parser';
import HomePage from './page';
import UnauthorizedPage from './unauthorized/page';
import ForbiddenPage from './forbidden/page';
import { AuthProvider } from '@/context/auth-context';
import { apiClient } from '@/lib/api-client';
import { getUserDisplayName, UserSummary } from '@/types/auth';
import { getSafeRedirectUrl } from '@/lib/utils';

// Mock next/navigation
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock ApiClient methods
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    getMe: jest.fn(),
    login: jest.fn(),
    signup: jest.fn(),
    logout: jest.fn(),
    forgotPassword: jest.fn(),
    changePassword: jest.fn(),
    resetPassword: jest.fn(),
  },
}));

describe('Batch 2 Auth Pages & Flow Test Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    (apiClient.getMe as jest.Mock).mockRejectedValue(new Error('Unauthorized'));
  });

  describe('UserSummary & Helper Contract Unit Tests', () => {
    it('formats user display name using display_name if present', () => {
      const user: UserSummary = {
        id: 'u1',
        email: 'john@example.com',
        role: 'candidate',
        status: 'active',
        display_name: 'Johnny D',
        first_name: 'John',
        last_name: 'Doe',
      };
      expect(getUserDisplayName(user)).toBe('Johnny D');
    });

    it('formats user display name using first, middle, and last name if display_name is absent', () => {
      const user: UserSummary = {
        id: 'u2',
        email: 'jane@example.com',
        role: 'employer',
        status: 'active',
        first_name: 'Jane',
        middle_name: 'M',
        last_name: 'Smith',
      };
      expect(getUserDisplayName(user)).toBe('Jane M Smith');
    });

    it('falls back to email if name fields are absent', () => {
      const user: UserSummary = {
        id: 'u3',
        email: 'user@example.com',
        role: 'candidate',
        status: 'active',
      };
      expect(getUserDisplayName(user)).toBe('user@example.com');
    });
  });

  describe('Safe Redirect URL Unit Tests (Open Redirect Prevention)', () => {
    it('allows valid internal same-origin relative paths', () => {
      expect(getSafeRedirectUrl('/dashboard/employer', '/dashboard/candidate')).toBe('/dashboard/employer');
      expect(getSafeRedirectUrl('/profile', '/dashboard/candidate')).toBe('/profile');
    });

    it('prevents external absolute URLs and falls back safely', () => {
      expect(getSafeRedirectUrl('https://evil.com/phishing', '/dashboard/candidate')).toBe('/dashboard/candidate');
      expect(getSafeRedirectUrl('http://attacker.org', '/dashboard/candidate')).toBe('/dashboard/candidate');
    });

    it('prevents protocol-relative open redirects and falls back safely', () => {
      expect(getSafeRedirectUrl('//evil.com', '/dashboard/candidate')).toBe('/dashboard/candidate');
      expect(getSafeRedirectUrl('/\\evil.com', '/dashboard/candidate')).toBe('/dashboard/candidate');
    });
  });

  describe('Login Page', () => {
    it('renders login form correctly', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });
      expect(screen.getByText('Welcome Back')).toBeInTheDocument();
      expect(screen.getByTestId('login-email-input')).toBeInTheDocument();
      expect(screen.getByTestId('login-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('login-submit-button')).toBeInTheDocument();
    });

    it('displays client-side validation error when submitting empty fields', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });

      const form = screen.getByTestId('login-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('login-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Email address is required.')).toBeInTheDocument();
      });
    });

    it('displays validation error for invalid email format', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('login-email-input'), { target: { value: 'invalid-email' } });
      fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'password123' } });

      const form = screen.getByTestId('login-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('login-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument();
      });
    });

    it('calls login API and redirects on successful login', async () => {
      (apiClient.login as jest.Mock).mockResolvedValue({ status: 'authenticated', user_id: 'usr-1' });
      (apiClient.getMe as jest.Mock).mockResolvedValue({
        id: 'usr-1',
        email: 'test@example.com',
        role: 'candidate',
        status: 'active',
      });

      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('login-email-input'), { target: { value: 'test@example.com' } });
      fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'password123' } });

      const form = screen.getByTestId('login-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(apiClient.login).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password123' });
        expect(mockPush).toHaveBeenCalledWith('/dashboard/candidate');
      });
    });

    it('handles server login failure cleanly with generic verification help message', async () => {
      (apiClient.login as jest.Mock).mockRejectedValue(new Error('Unauthorized'));

      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('login-email-input'), { target: { value: 'wrong@example.com' } });
      fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'wrongpass' } });

      const form = screen.getByTestId('login-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('login-error-alert')).toBeInTheDocument();
        expect(
          screen.getByText(
            'Invalid email or password. Or, if you recently registered, please check your inbox to verify your email address.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('Signup Page', () => {
    it('renders signup form correctly', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <SignupPage />
          </AuthProvider>
        );
      });
      expect(screen.getByText('Create an Account')).toBeInTheDocument();
      expect(screen.getByTestId('signup-email-input')).toBeInTheDocument();
      expect(screen.getByTestId('signup-password-input')).toBeInTheDocument();
      expect(screen.getByTestId('signup-submit-button')).toBeInTheDocument();
    });

    it('enforces password minimum length of 8 characters', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <SignupPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'newuser@example.com' } });
      fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'short' } });
      fireEvent.change(screen.getByTestId('signup-confirm-password-input'), { target: { value: 'short' } });

      const form = screen.getByTestId('signup-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('signup-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Password must be at least 8 characters long.')).toBeInTheDocument();
      });
    });

    it('enforces password mismatch validation error when passwords do not match', async () => {
      await act(async () => {
        render(
          <AuthProvider>
            <SignupPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'newuser@example.com' } });
      fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'ValidPass123!' } });
      fireEvent.change(screen.getByTestId('signup-confirm-password-input'), { target: { value: 'DifferentPass123!' } });

      const form = screen.getByTestId('signup-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(screen.getByTestId('signup-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
        expect(apiClient.signup).not.toHaveBeenCalled();
      });
    });

    it('calls signup API with register_as candidate by default and redirects to verify-email when pending', async () => {
      (apiClient.signup as jest.Mock).mockResolvedValue({ status: 'pending_verification', user_id: 'usr-2' });

      await act(async () => {
        render(
          <AuthProvider>
            <SignupPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'candidate@example.com' } });
      fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'ValidPass123!' } });
      fireEvent.change(screen.getByTestId('signup-confirm-password-input'), { target: { value: 'ValidPass123!' } });

      const form = screen.getByTestId('signup-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(apiClient.signup).toHaveBeenCalledWith({
          email: 'candidate@example.com',
          password: 'ValidPass123!',
          register_as: 'candidate',
        });
        expect(mockPush).toHaveBeenCalledWith('/verify-email');
      });
    });

    it('allows selecting employer role and sends register_as employer in signup API payload', async () => {
      (apiClient.signup as jest.Mock).mockResolvedValue({ status: 'pending_verification', user_id: 'usr-3' });

      await act(async () => {
        render(
          <AuthProvider>
            <SignupPage />
          </AuthProvider>
        );
      });

      fireEvent.click(screen.getByTestId('role-employer-button'));
      fireEvent.change(screen.getByTestId('signup-email-input'), { target: { value: 'employer@example.com' } });
      fireEvent.change(screen.getByTestId('signup-password-input'), { target: { value: 'ValidPass123!' } });
      fireEvent.change(screen.getByTestId('signup-confirm-password-input'), { target: { value: 'ValidPass123!' } });

      const form = screen.getByTestId('signup-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(apiClient.signup).toHaveBeenCalledWith({
          email: 'employer@example.com',
          password: 'ValidPass123!',
          register_as: 'employer',
        });
        expect(mockPush).toHaveBeenCalledWith('/verify-email');
      });
    });

    it.each([
      ['candidate', '/dashboard/candidate'],
      ['employer', '/dashboard/employer'],
      ['hr', '/dashboard/employer'],
      ['admin', '/dashboard/admin'],
    ] as Array<[UserSummary['role'], string]>)('routes logged-in %s to %s based on server role from /auth/me', async (role, expectedRoute) => {
      cleanup();
      jest.clearAllMocks();
      (apiClient.login as jest.Mock).mockResolvedValue({ status: 'authenticated', user_id: 'usr-role' });
      (apiClient.getMe as jest.Mock).mockResolvedValue({
        id: 'usr-role',
        email: `${role}@example.com`,
        role,
        status: 'active',
      });

      await act(async () => {
        render(
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        );
      });

      fireEvent.change(screen.getByTestId('login-email-input'), { target: { value: `${role}@example.com` } });
      fireEvent.change(screen.getByTestId('login-password-input'), { target: { value: 'password123' } });

      const form = screen.getByTestId('login-form');
      await act(async () => {
        fireEvent.submit(form);
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expectedRoute);
      });
    });
  });

  describe('Status Pages', () => {
    describe('Verify Email Page Callback Slice', () => {
      let replaceStateSpy: jest.SpyInstance;

      beforeEach(() => {
        replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
      });

      afterEach(() => {
        replaceStateSpy.mockRestore();
        window.location.hash = '';
      });

      it('renders default pending check inbox state when no hash is present', () => {
        render(<VerifyEmailPage />);
        expect(screen.getByText('Check Your Email')).toBeInTheDocument();
        expect(screen.getByText('We have sent a verification link to your registered email address.')).toBeInTheDocument();
        expect(replaceStateSpy).not.toHaveBeenCalled();
      });

      it('renders success state when type=signup and non-empty access_token are present without errors', () => {
        window.location.hash = '#access_token=dummy_access_token_123&token_type=bearer&type=signup';
        render(<VerifyEmailPage />);
        expect(screen.getByText('Email Verified!')).toBeInTheDocument();
        expect(screen.getByText('Your email address has been verified successfully.')).toBeInTheDocument();
        expect(screen.getByText('Proceed to Sign In')).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
      });

      it('renders error state when type=signup is present without access_token', () => {
        window.location.hash = '#type=signup';
        render(<VerifyEmailPage />);
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByTestId('verify-email-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Verification link is incomplete or invalid. Please request a new link.')).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
      });

      it('renders error state when expired/error hash parameters are present', () => {
        window.location.hash = '#error=unauthorized_client&error_code=401&error_description=Email+link+has+expired';
        render(<VerifyEmailPage />);
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByTestId('verify-email-error-alert')).toBeInTheDocument();
        expect(screen.getByText('Email link has expired')).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
      });

      it('handles malformed hash parameters safely with generic error message', () => {
        window.location.hash = '#malformed_hash_without_kv';
        render(<VerifyEmailPage />);
        expect(screen.getByText('Verification Failed')).toBeInTheDocument();
        expect(screen.getByTestId('verify-email-error-alert')).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, '', window.location.pathname);
      });
    });

    describe('HomePage Zero-Flash Callback Forwarder Unit Tests', () => {
      let originalLocation: Location;
      let mockLocationReplace: jest.Mock;

      beforeAll(() => {
        originalLocation = window.location;
      });

      beforeEach(() => {
        mockLocationReplace = jest.fn();
        delete (window as any).location;
        window.location = {
          ...originalLocation,
          replace: mockLocationReplace,
          hash: '',
        } as any;
      });

      afterEach(() => {
        (window as any).location = originalLocation;
      });

      it('does not render Home content when callback hash is present on root page', () => {
        window.location.hash = '#access_token=dummy_access_token&type=signup';
        render(
          <AuthProvider>
            <HomePage />
          </AuthProvider>
        );

        expect(screen.getByTestId('auth-redirect-loading')).toBeInTheDocument();
        expect(screen.getByText('Verifying authentication link...')).toBeInTheDocument();
        expect(screen.queryByText('Binay Job Portal')).not.toBeInTheDocument();
        expect(mockLocationReplace).toHaveBeenCalledWith('/verify-email#access_token=dummy_access_token&type=signup');
      });

      it('renders normal Home content when no callback hash is present', () => {
        window.location.hash = '';
        render(
          <AuthProvider>
            <HomePage />
          </AuthProvider>
        );

        expect(screen.getByText('Binay Job Portal')).toBeInTheDocument();
        expect(screen.queryByTestId('auth-redirect-loading')).not.toBeInTheDocument();
        expect(mockLocationReplace).not.toHaveBeenCalled();
      });
    });

    describe('parseVerifyEmailHash Pure Function Unit Tests', () => {
      it('evaluates error parameters FIRST before success (otp_expired second click case)', () => {
        const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired&access_token=old_token&type=signup';
        const result = parseVerifyEmailHash(hash);
        expect(result.status).toBe('error');
        expect(result.errorMessage).toBe('Email link has expired');
      });

      it('returns success state when type=signup and access_token are present without error parameters', () => {
        const hash = '#access_token=valid_token&type=signup';
        const result = parseVerifyEmailHash(hash);
        expect(result.status).toBe('success');
        expect(result.errorMessage).toBeNull();
      });

      it('returns pending state when hash is empty or missing', () => {
        expect(parseVerifyEmailHash('')).toEqual({ status: 'pending', errorMessage: null });
        expect(parseVerifyEmailHash('#')).toEqual({ status: 'pending', errorMessage: null });
      });
    });

    describe('parseResetPasswordHash Pure Function Unit Tests', () => {
      it('returns form status when access_token and type=recovery are present', () => {
        const hash = '#access_token=valid_recovery_token&type=recovery';
        const result = parseResetPasswordHash(hash);
        expect(result.status).toBe('form');
        expect(result.recoveryToken).toBe('valid_recovery_token');
        expect(result.errorMessage).toBeNull();
      });

      it('evaluates error parameters FIRST before recovery token (otp_expired case)', () => {
        const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired&access_token=old_token&type=recovery';
        const result = parseResetPasswordHash(hash);
        expect(result.status).toBe('error');
        expect(result.errorMessage).toBe('Email link has expired');
      });

      it('returns error status when hash is empty or missing', () => {
        const result = parseResetPasswordHash('');
        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('Missing recovery token');
      });
    });

    describe('ForgotPasswordPage UI Unit Tests', () => {
      it('renders email input and sends reset link on submit', async () => {
        (apiClient.forgotPassword as jest.Mock).mockResolvedValueOnce({
          success: true,
          message: 'If an account exists with that email address, a password reset link has been sent.',
        });

        render(<ForgotPasswordPage />);
        expect(screen.getByText('Forgot Password')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/Email Address/i), {
          target: { value: 'user@example.com' },
        });

        fireEvent.click(screen.getByRole('button', { name: /Send Password Reset Link/i }));

        await waitFor(() => {
          expect(apiClient.forgotPassword).toHaveBeenCalledWith('user@example.com');
          expect(screen.getByTestId('forgot-password-success')).toBeInTheDocument();
          expect(screen.getByText('If an account exists with that email address, a password reset link has been sent.')).toBeInTheDocument();
        });
      });
    });

    describe('ResetPasswordPage UI Component Unit Tests', () => {
      let replaceStateSpy: jest.SpyInstance;

      beforeEach(() => {
        replaceStateSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
        localStorage.clear();
        sessionStorage.clear();
      });

      afterEach(() => {
        replaceStateSpy.mockRestore();
        window.location.hash = '';
      });

      it('renders error state when recovery token is missing or malformed', async () => {
        window.location.hash = '';
        await act(async () => {
          render(<ResetPasswordPage />);
        });
        expect(screen.getByTestId('reset-password-error')).toBeInTheDocument();
        expect(screen.getByText(/Missing recovery token/i)).toBeInTheDocument();
      });

      it('renders error state when link has expired error in hash', async () => {
        window.location.hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired';
        await act(async () => {
          render(<ResetPasswordPage />);
        });
        expect(screen.getByTestId('reset-password-error')).toBeInTheDocument();
        expect(screen.getByText('Email link has expired')).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, window.location.pathname);
      });

      it('renders reset password form on valid recovery token and scrubs URL hash', async () => {
        window.location.hash = '#access_token=valid_recovery_token_123&type=recovery';
        await act(async () => {
          render(<ResetPasswordPage />);
        });

        expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
        expect(screen.getByLabelText('New Password', { exact: true })).toBeInTheDocument();
        expect(screen.getByLabelText('Confirm New Password', { exact: true })).toBeInTheDocument();
        expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title, window.location.pathname);
      });

      it('validates password length and match before calling API', async () => {
        window.location.hash = '#access_token=valid_recovery_token_123&type=recovery';
        await act(async () => {
          render(<ResetPasswordPage />);
        });

        fireEvent.change(screen.getByLabelText('New Password', { exact: true }), { target: { value: 'short' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password', { exact: true }), { target: { value: 'short' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        await waitFor(() => {
          expect(screen.getByText('Password must be at least 8 characters long.')).toBeInTheDocument();
          expect(apiClient.resetPassword).not.toHaveBeenCalled();
        });

        fireEvent.change(screen.getByLabelText('New Password', { exact: true }), { target: { value: 'ValidPass123!' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password', { exact: true }), { target: { value: 'DifferentPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        await waitFor(() => {
          expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
          expect(apiClient.resetPassword).not.toHaveBeenCalled();
        });
      });

      it('calls apiClient.resetPassword with in-memory token and displays success state with login redirect button', async () => {
        (apiClient.resetPassword as jest.Mock).mockResolvedValueOnce({ success: true, message: 'Password reset successfully.' });
        window.location.hash = '#access_token=secret_recovery_token_777&type=recovery';

        await act(async () => {
          render(<ResetPasswordPage />);
        });

        fireEvent.change(screen.getByLabelText('New Password', { exact: true }), { target: { value: 'NewSecretPass123!' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password', { exact: true }), { target: { value: 'NewSecretPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        await waitFor(() => {
          expect(apiClient.resetPassword).toHaveBeenCalledWith('secret_recovery_token_777', 'NewSecretPass123!');
          expect(screen.getByTestId('reset-password-success')).toBeInTheDocument();
          expect(screen.getByText(/Password Reset Successful! You can now sign in with your new password./i)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Proceed to Sign In/i }));
        expect(mockPush).toHaveBeenCalledWith('/login');
      });

      it('handles API error safely and renders error state without exposing recovery token in storage', async () => {
        (apiClient.resetPassword as jest.Mock).mockRejectedValueOnce(new Error('Token is invalid or has expired.'));
        window.location.hash = '#access_token=secret_recovery_token_999&type=recovery';

        await act(async () => {
          render(<ResetPasswordPage />);
        });

        fireEvent.change(screen.getByLabelText('New Password', { exact: true }), { target: { value: 'NewSecretPass123!' } });
        fireEvent.change(screen.getByLabelText('Confirm New Password', { exact: true }), { target: { value: 'NewSecretPass123!' } });
        fireEvent.click(screen.getByRole('button', { name: /Update Password/i }));

        await waitFor(() => {
          expect(screen.getByTestId('reset-password-error')).toBeInTheDocument();
          expect(screen.getByText('Token is invalid or has expired.')).toBeInTheDocument();
        });

        // Zero token storage verification
        expect(localStorage.getItem('recovery_token')).toBeNull();
        expect(sessionStorage.getItem('recovery_token')).toBeNull();
      });
    });

    it('renders Unauthorized 401 page', () => {
      render(<UnauthorizedPage />);
      expect(screen.getByText('401 - Authentication Required')).toBeInTheDocument();
    });

    it('renders Forbidden 403 page', () => {
      render(<ForbiddenPage />);
      expect(screen.getByText('403 - Access Denied')).toBeInTheDocument();
    });
  });
});
