'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { parseResetPasswordHash, type ResetPasswordState } from '@/lib/reset-password-parser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api-client';

export default function ResetPasswordPage() {
  const router = useRouter();

  const [state, setState] = useState<ResetPasswordState>({
    status: 'loading',
    recoveryToken: null,
    errorMessage: null,
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Parse hash on client mount & scrub address bar immediately
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const parsed = parseResetPasswordHash(window.location.hash);
      setState(parsed);
      if (window.location.hash) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!newPassword || newPassword.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    if (!state.recoveryToken) {
      setValidationError('Recovery token is missing. Please request a new link.');
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.resetPassword(state.recoveryToken, newPassword);

      setState({ status: 'success', recoveryToken: null, errorMessage: null });
    } catch (err: any) {
      const msg = err.message || 'Failed to reset password.';
      setState({ status: 'error', recoveryToken: null, errorMessage: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Reset Password</CardTitle>
          <CardDescription>
            {state.status === 'loading' && 'Verifying password reset link...'}
            {state.status === 'form' && 'Enter your new password below.'}
            {state.status === 'success' && 'Your password has been reset successfully.'}
            {state.status === 'error' && 'Password Reset Link Error'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {state.status === 'loading' && (
            <div className="flex flex-col items-center justify-center space-y-3 py-6" data-testid="reset-password-loading">
              <Spinner size="lg" className="text-indigo-600" />
              <p className="text-sm font-medium text-slate-500">Verifying reset link...</p>
            </div>
          )}
          {state.status === 'success' && (
            <div className="space-y-4 text-center" data-testid="reset-password-success">
              <Alert variant="success" className="p-4">
                <div className="text-sm font-medium text-green-800">
                  Password Reset Successful! You can now sign in with your new password.
                </div>
              </Alert>
              <Button onClick={() => router.push('/login')} className="w-full">
                Proceed to Sign In
              </Button>
            </div>
          )}

          {state.status === 'error' && (
            <div className="space-y-4 text-center" data-testid="reset-password-error">
              <Alert variant="error" className="p-4">
                <div className="text-sm font-medium">
                  {state.errorMessage || 'Invalid or expired password reset link.'}
                </div>
              </Alert>
              <Button onClick={() => router.push('/forgot-password')} variant="outline" className="w-full">
                Request New Reset Link
              </Button>
            </div>
          )}

          {state.status === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="reset-password-form">
              {validationError && (
                <Alert variant="error" className="p-3">
                  <div className="text-sm">{validationError}</div>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Updating Password...
                  </>
                ) : (
                  'Update Password'
                )}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4 text-sm text-gray-600">
          <Link href="/login" className="font-semibold text-blue-600 hover:underline">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
