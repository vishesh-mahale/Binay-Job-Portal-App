'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, Sparkles, Users, Briefcase, LayoutDashboard } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();
  const [isCallbackRedirect, setIsCallbackRedirect] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return false;
    return (
      hash.includes('access_token=') ||
      hash.includes('error=') ||
      hash.includes('error_code=') ||
      hash.includes('error_description=')
    );
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length <= 1) return;

    const hasAuthCallback =
      hash.includes('access_token=') ||
      hash.includes('error=') ||
      hash.includes('error_code=') ||
      hash.includes('error_description=');

    if (hasAuthCallback) {
      setIsCallbackRedirect(true);
      if (hash.includes('type=recovery')) {
        window.location.replace(`/reset-password${hash}`);
      } else {
        window.location.replace(`/verify-email${hash}`);
      }
    }
  }, []);

  const getRoleDashboard = (role?: string) => {
    if (role === 'admin') return '/dashboard/admin';
    if (role === 'employer' || role === 'hr') return '/dashboard/employer';
    return '/dashboard/candidate';
  };

  if (isCallbackRedirect) {
    return (
      <main data-testid="auth-redirect-loading" className="flex-1 flex flex-col items-center justify-center p-12 bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Verifying authentication link...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI-Powered Recruitment & Verification</span>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Binay Job Portal
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            High-precision candidate matching, verified company tenancy, and zero-trust career management.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4">
          {user ? (
            <Link href={getRoleDashboard(user.role)}>
              <Button size="lg" className="gap-2 px-6">
                <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
              </Button>
            </Link>
          ) : (
            <>
              <Link href="/login">
                <Button size="lg" className="w-36">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button variant="outline" size="lg" className="w-36">Register</Button>
              </Link>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
          <Card>
            <CardHeader>
              <Users className="w-8 h-8 text-indigo-600 mb-2" />
              <CardTitle>Candidates</CardTitle>
              <CardDescription>Verified profile, AI resume parsing, and private applications.</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Briefcase className="w-8 h-8 text-indigo-600 mb-2" />
              <CardTitle>Employers & HR</CardTitle>
              <CardDescription>Multi-tenant organization, job enrichment, and candidate matching.</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <ShieldCheck className="w-8 h-8 text-indigo-600 mb-2" />
              <CardTitle>Zero-Trust Security</CardTitle>
              <CardDescription>Strict RLS isolation, auditable actions, and fail-closed auth.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </main>
  );
}
