'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Email address is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.forgotPassword(trimmedEmail);
      setSubmittedMessage(res.message);
    } catch {
      // Anti-enumeration fallback: show generic message even if request fails transiently
      setSubmittedMessage('If an account exists with that email address, a password reset link has been sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Forgot Password</CardTitle>
          <CardDescription>
            Enter your email address and we will send you a password reset link.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {submittedMessage ? (
            <Alert variant="success" className="p-4" data-testid="forgot-password-success">
              <div className="text-sm font-medium text-green-800">{submittedMessage}</div>
            </Alert>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {validationError && (
                <Alert variant="error" className="p-3" data-testid="forgot-password-validation-error">
                  <div className="text-sm">{validationError}</div>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Sending Reset Link...
                  </>
                ) : (
                  'Send Password Reset Link'
                )}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4 text-sm text-gray-600">
          Remember your password?{' '}
          <Link href="/login" className="ml-1 font-semibold text-blue-600 hover:underline">
            Back to Sign In
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
