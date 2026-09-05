'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export default function SignupPage() {
  const router = useRouter();
  const { signup, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registerAs, setRegisterAs] = useState<'candidate' | 'employer'>('candidate');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (user) {
      if (user.role === 'admin') router.push('/dashboard/admin');
      else if (user.role === 'hr') router.push('/dashboard/hr');
      else if (user.role === 'employer') router.push('/dashboard/employer');
      else router.push('/dashboard/candidate');
    }
  }, [user, router]);

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
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await signup({ email: trimmedEmail, password, register_as: registerAs });
      if (res.pendingVerification) {
        router.push('/verify-email');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setServerError(err.message || 'Registration failed. Please try again.');
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
            <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
            <CardDescription className="text-center text-slate-500">
              Join the Binay Job Portal platform
            </CardDescription>
          </CardHeader>

        <form onSubmit={handleSubmit} data-testid="signup-form">
          <CardContent className="space-y-4 pt-4">
            {(validationError || serverError) && (
              <Alert variant="error" data-testid="signup-error-alert">
                {validationError || serverError}
              </Alert>
            )}

            <div className="space-y-2">
              <Label>I want to join as</Label>
              <div className="grid grid-cols-2 gap-3" data-testid="role-selector">
                <button
                  type="button"
                  onClick={() => setRegisterAs('candidate')}
                  className={`py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                    registerAs === 'candidate'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                  data-testid="role-candidate-button"
                >
                  Candidate (Job Seeker)
                </button>
                <button
                  type="button"
                  onClick={() => setRegisterAs('employer')}
                  className={`py-2 px-3 text-sm font-medium rounded-md border transition-colors ${
                    registerAs === 'employer'
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                  data-testid="role-employer-button"
                >
                  Employer / Recruiter
                </button>
              </div>
            </div>

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
                data-testid="signup-email-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                autoComplete="new-password"
                data-testid="signup-password-input"
              />
              <p className="text-xs text-slate-500">Must be at least 8 characters long.</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-2">
            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
              data-testid="signup-submit-button"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner size="sm" /> Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </Button>

            <div className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="text-blue-600 font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
        </Card>
      </div>
    </main>
  );
}
