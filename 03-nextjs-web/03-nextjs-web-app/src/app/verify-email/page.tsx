'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { parseVerifyEmailHash } from '@/lib/verify-email-parser';

function VerifyEmailContent() {
  const [result, setResult] = useState<{
    status: 'pending' | 'success' | 'error';
    errorMessage: string | null;
  }>(() => {
    if (typeof window === 'undefined') return { status: 'pending', errorMessage: null };
    return parseVerifyEmailHash(window.location.hash);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash && hash.length > 1) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const { status, errorMessage } = result;

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between px-1">
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 transition-colors">
            ← Back to Home
          </Link>
        </div>

        <Card className="w-full shadow-lg border border-slate-200 dark:border-slate-800 text-center">
          <CardHeader className="space-y-2">
            <Link href="/" className="inline-block text-xl font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline mb-1">
              Binay Job Portal
            </Link>

            {status === 'success' ? (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <CardTitle className="text-2xl font-bold">Email Verified!</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Your email address has been verified successfully.
                </CardDescription>
              </>
            ) : status === 'error' ? (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-600 dark:text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <CardTitle className="text-2xl font-bold">Verification Failed</CardTitle>
              </>
            ) : (
              <>
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  We have sent a verification link to your registered email address.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="py-2 text-sm text-slate-600 dark:text-slate-400 space-y-3">
            {status === 'error' && errorMessage && (
              <Alert variant="error" data-testid="verify-email-error-alert">
                {errorMessage}
              </Alert>
            )}
            {status === 'success' && (
              <p>You can now proceed to sign in to access your dashboard.</p>
            )}
            {status === 'pending' && (
              <p>Please click the link in your email to verify your account before logging in.</p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 pt-4">
            <Link href="/login" className="w-full">
              <Button className="w-full" variant={status === 'success' ? 'primary' : 'outline'}>
                {status === 'success' ? 'Proceed to Sign In' : 'Back to Sign In'}
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
