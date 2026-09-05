'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { RoleGuard } from '@/components/role-guard';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { apiClient } from '@/lib/api-client';

interface CompanyRecord {
  id: string;
  name: string;
  slug: string;
  industry?: string;
  verification_status: 'verified' | 'rejected' | 'pending' | 'unverified';
  rejection_reason?: string | null;
  created_at: string;
}

export default function AdminDashboardPage() {
  const { user, logout } = useAuth();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Rejection Reason Inline Form State
  const [rejectingCompanyId, setRejectingCompanyId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('');

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const data = await apiClient.listAdminCompanies();
      setCompanies(data || []);
    } catch (err: any) {
      console.error('Failed to load companies:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleUpdateStatus = async (companyId: string, status: 'verified' | 'rejected', reason?: string) => {
    setActionLoadingId(companyId);
    setFeedback(null);
    try {
      await apiClient.verifyCompanyAdmin(companyId, status, reason);
      setFeedback({
        type: 'success',
        msg: status === 'verified' ? 'Company verified successfully!' : 'Company verification rejected with feedback note.'
      });
      setRejectingCompanyId(null);
      setRejectionReasonText('');
      await fetchCompanies();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err?.message || 'Failed to update company verification status' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <RoleGuard allowedRoles={['admin']}>
      <main className="flex-1 p-6 md:p-10 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-5xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">System Administration</h1>
              <p className="text-slate-500 text-sm">Platform configuration and company verification workspace</p>
            </div>
            <Button variant="outline" onClick={logout} data-testid="logout-button">
              Sign Out
            </Button>
          </header>

          <Card data-testid="admin-dashboard-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>System Privilege Active</CardTitle>
                <Badge variant="danger">ADMIN</Badge>
              </div>
              <CardDescription>Administrative session active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>User ID:</strong> {user?.id}</p>
              <p><strong>Role:</strong> {user?.role}</p>
            </CardContent>
          </Card>

          <Card data-testid="admin-company-verification-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl">Company Verification Requests</CardTitle>
                <CardDescription>Review, approve or reject registered employer companies</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchCompanies} disabled={loading}>
                Refresh List
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              {feedback && (
                <Alert variant={feedback.type === 'success' ? 'success' : 'error'}>
                  {feedback.msg}
                </Alert>
              )}

              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Spinner size="lg" />
                </div>
              ) : companies.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-6">No registered companies found in system.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {companies.map((comp) => {
                    const isPending = comp.verification_status === 'pending' || comp.verification_status === 'unverified';
                    const isVerified = comp.verification_status === 'verified';
                    const isRejected = comp.verification_status === 'rejected';

                    return (
                      <div key={comp.id} className="py-4 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base">{comp.name}</h3>
                              <Badge variant={isVerified ? 'success' : isRejected ? 'danger' : 'warning'}>
                                {isRejected ? 'REVISION REQUESTED' : comp.verification_status.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 font-mono">Company ID: {comp.id}</p>
                            <p className="text-xs text-slate-500">Industry: {comp.industry || 'Technology'}</p>
                            {comp.rejection_reason && (
                              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                💬 Rejection Feedback: &quot;{comp.rejection_reason}&quot;
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant={isVerified ? 'outline' : 'primary'}
                              size="sm"
                              onClick={() => handleUpdateStatus(comp.id, 'verified')}
                              disabled={actionLoadingId === comp.id || isVerified}
                            >
                              {actionLoadingId === comp.id ? 'Saving...' : isVerified ? '✓ Verified' : 'Approve & Verify'}
                            </Button>

                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setRejectingCompanyId(comp.id);
                                setRejectionReasonText(comp.rejection_reason || '');
                              }}
                              disabled={actionLoadingId === comp.id}
                            >
                              {isRejected ? 'Edit Rejection Reason' : 'Reject / Request Revision'}
                            </Button>
                          </div>
                        </div>

                        {/* Inline Rejection Reason Form */}
                        {rejectingCompanyId === comp.id && (
                          <div className="p-3 bg-red-50 dark:bg-red-950/50 rounded border border-red-200 dark:border-red-800 space-y-2">
                            <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                              Provide Rejection Reason / Revision Notes for Employer:
                            </p>
                            <input
                              type="text"
                              placeholder="e.g. Please provide valid official website and contact email."
                              value={rejectionReasonText}
                              onChange={(e) => setRejectionReasonText(e.target.value)}
                              className="w-full p-2 border rounded dark:bg-slate-900 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                            />
                            <div className="flex gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleUpdateStatus(comp.id, 'rejected', rejectionReasonText)}
                                disabled={actionLoadingId === comp.id}
                              >
                                {actionLoadingId === comp.id ? 'Submitting...' : 'Submit Rejection'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRejectingCompanyId(null);
                                  setRejectionReasonText('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </RoleGuard>
  );
}
