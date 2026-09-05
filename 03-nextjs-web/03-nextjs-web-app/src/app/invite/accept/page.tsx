'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import type { VerifyInvitationData } from '@/types/company-invitation';
import { AppApiError } from '@/lib/errors';

function InviteAcceptContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<VerifyInvitationData | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  // Status states
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadTokenMetadata() {
      if (!token) {
        if (mounted) {
          setServerError('Invitation token is missing in the URL. Please use the complete link from your invitation email.');
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setServerError(null);
        const res = await apiClient.verifyInvitation(token);
        if (mounted) {
          const invData = res?.data || res;
          setInvitation(invData);
        }
      } catch (err: any) {
        if (!mounted) return;
        const appErr = err as AppApiError;
        const code = appErr.code || err.code;
        const message = appErr.message || err.message;

        const isRevoked = code === 'INVITATION_REVOKED' || message?.includes('INVITATION_REVOKED');
        const isExpired = code === 'INVITATION_EXPIRED' || message?.includes('INVITATION_EXPIRED');
        const isAccepted = code === 'INVITATION_ALREADY_ACCEPTED' || message?.includes('INVITATION_ALREADY_ACCEPTED');
        const isNotFound = code === 'INVITATION_NOT_FOUND' || message?.includes('INVITATION_NOT_FOUND');

        if (isRevoked) {
          setServerError('This HR invitation link has been revoked by the company employer/owner.');
        } else if (isExpired) {
          setServerError('This invitation link has expired. Please ask your employer to issue a new HR invitation.');
        } else if (isAccepted) {
          setServerError('This invitation has already been accepted. Please sign in to your HR account.');
        } else if (isNotFound) {
          setServerError('Invalid invitation link. The invitation does not exist or has been deleted.');
        } else {
          setServerError(message || 'Failed to verify invitation link.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadTokenMetadata();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setServerError(null);

    if (!token) return;
    const trimmedName = fullName.trim();
    if (!trimmedName) {
      setValidationError('Full name is required.');
      return;
    }
    if (!password || password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiClient.signupWithInvite({
        token,
        full_name: trimmedName,
        password
      });

      const resData = res?.data || res;
      if (resData?.requires_login) {
        setSuccessMsg('Invitation accepted successfully! Redirecting to login...');
        setTimeout(() => router.push('/login?message=Invitation+accepted.+Please+sign+in.'), 2000);
      } else {
        setSuccessMsg('Account created and invitation accepted! Redirecting to your HR dashboard...');
        await refreshUser();
        setTimeout(() => router.push('/dashboard/hr'), 1500);
      }
    } catch (err: any) {
      const appErr = err as AppApiError;
      const code = appErr.code || err.code;
      const message = appErr.message || err.message;

      if (code === 'EXISTING_USER_CANNOT_BE_INVITED' || code === 'ACCOUNT_ALREADY_EXISTS' || message?.includes('EXISTING_USER_CANNOT_BE_INVITED')) {
        setServerError('An account with this email address already exists. Existing user accounts cannot be invited or converted to HR.');
      } else if (code === 'INVITATION_NOT_FOUND' || message?.includes('INVITATION_NOT_FOUND') || code === 'NOT_FOUND') {
        setServerError('This invitation link is invalid or no longer exists in the system. Please request a fresh invitation from the employer.');
      } else if (code === 'CANDIDATE_HAS_ACTIVE_APPLICATIONS' || message?.includes('CANDIDATE_HAS_ACTIVE_APPLICATIONS')) {
        setServerError('You cannot accept an HR invitation while you have active candidate job applications.');
      } else if (code === 'USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE' || message?.includes('USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE')) {
        setServerError('You are already an active member of another company.');
      } else if (message?.startsWith('SUPABASE_ERROR:')) {
        setServerError(`Account Creation Failed: ${message.replace('SUPABASE_ERROR:', '').trim()}`);
      } else if (code === 'SUPABASE_ACCOUNT_PROVISIONING_FAILED' || message?.includes('SUPABASE_ACCOUNT_PROVISIONING_FAILED')) {
        setServerError('Account creation failed on authentication service. Please check your password strength and try again.');
      } else {
        setServerError(message || 'Failed to accept invitation.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-6 space-y-4">
          <Spinner className="mx-auto h-8 w-8 text-primary" />
          <p className="text-muted-foreground text-sm">Verifying invitation link...</p>
        </Card>
      </div>
    );
  }

  if (serverError && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md space-y-4">
          <CardHeader>
            <CardTitle className="text-destructive">Invitation Error</CardTitle>
            <CardDescription>Unable to process your invitation link</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="error">{serverError}</Alert>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
            <Link href="/login">
              <Button>Go to Login</Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader className="space-y-2 border-b bg-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="capitalize text-xs font-semibold">
              New HR Member Invitation
            </Badge>
            <span className="text-xs text-muted-foreground">CollabFor Portal</span>
          </div>
          <CardTitle className="text-2xl font-bold">
            Join {invitation?.company_name}
          </CardTitle>
          <CardDescription>
            Create your new HR account to join <strong>{invitation?.company_name}</strong> as{' '}
            <strong className="text-primary">{invitation?.title || 'HR Team Member'}</strong>.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Metadata summary badge */}
          <div className="bg-slate-100 p-3 rounded-lg flex flex-col space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invited Email:</span>
              <span className="font-medium text-slate-800">{invitation?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designation:</span>
              <span className="font-medium text-slate-800">{invitation?.title || 'HR Member'}</span>
            </div>
          </div>

          {serverError && <Alert variant="error">{serverError}</Alert>}
          {validationError && <Alert variant="error">{validationError}</Alert>}
          {successMsg && <Alert variant="success">{successMsg}</Alert>}

          {/* Signup form only */}
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Accept Invitation & Create HR Account
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t bg-slate-50 py-3 rounded-b-lg">
          <p className="text-xs text-muted-foreground text-center">
            This invitation creates a dedicated HR account for <strong>{invitation?.company_name}</strong>.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function InviteAcceptPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-4">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      }
    >
      <InviteAcceptContent />
    </Suspense>
  );
}
