'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { getSafeRedirectUrl } from '@/lib/utils';

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const getRoleDashboard = (role: string) => {
    if (role === 'admin') return '/dashboard/admin';
    if (role === 'hr') return '/dashboard/hr';
    if (role === 'employer') return '/dashboard/employer';
    return '/dashboard/candidate';
  };

  // Handle hash error parameters from Supabase email confirmation redirect
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const errorDesc = params.get('error_description');
      const errorCode = params.get('error_code');
      if (errorCode || errorDesc) {
        setServerError(errorDesc ? decodeURIComponent(errorDesc.replace(/\+/g, ' ')) : 'Email verification link has expired or is invalid.');
      }
    }
  }, []);

  // If already logged in, redirect safely
  React.useEffect(() => {
    if (user) {
      const redirectToParam = searchParams.get('redirectTo');
      const target = getSafeRedirectUrl(redirectToParam, getRoleDashboard(user.role));
      router.push(target);
    }
  }, [user, searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setServerError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setValidationError('Email address is required.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(trimmedEmail)) {
      setValidationError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setValidationError('Password is required.');
      return;
    }

    setSubmitting(true);
    try {
      await login({ email: trimmedEmail, password });
    } catch (err: any) {
      setServerError('Invalid email or password. Or, if you recently registered, please check your inbox to verify your email address.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between px-1">
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors">
            ← Back to Home
          </Link>
        </div>

        <Card className="w-full shadow-lg border border-slate-200 dark:border-slate-800">
          <CardHeader className="space-y-1 text-center">
            <Link href="/" className="inline-block text-xl font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline mb-1">
              Binay Job Portal
            </Link>
            <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
            <CardDescription className="text-center text-slate-500">
              Sign in to your account
            </CardDescription>
          </CardHeader>

        <form onSubmit={handleSubmit} data-testid="login-form">
          <CardContent className="space-y-4 pt-4">
            {(validationError || serverError) && (
              <Alert variant="error" data-testid="login-error-alert">
                {validationError || serverError}
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
                autoComplete="email"
                data-testid="login-email-input"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                  data-testid="login-forgot-password-link"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="current-password"
                data-testid="login-password-input"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="login-submit-button"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </Button>

            <div className="text-center text-sm text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href="/signup" className="text-blue-600 font-medium hover:underline">
                Create an account
              </Link>
            </div>
          </CardFooter>
        </form>
        </Card>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    }>
      <LoginFormContent />
    </Suspense>
  );
}
