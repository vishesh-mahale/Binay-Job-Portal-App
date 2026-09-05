'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import type { CompanyInvitationSummary } from '@/types/company-invitation';
import { AppApiError } from '@/lib/errors';

interface CompanyInvitationManagerProps {
  companyId: string;
}

export function CompanyInvitationManager({ companyId }: CompanyInvitationManagerProps) {
  const [invitations, setInvitations] = useState<CompanyInvitationSummary[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const [list, bList, dList, tList] = await Promise.all([
        apiClient.getCompanyInvitations(companyId).catch(() => []),
        apiClient.getBranches(companyId).catch(() => []),
        apiClient.getDepartments(companyId).catch(() => []),
        apiClient.getTeams(companyId).catch(() => []),
      ]);
      setInvitations(list || []);
      setBranches(bList || []);
      setDepartments(dList || []);
      setTeams(tList || []);
    } catch (err: any) {
      console.error('Failed to load company invitations:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Email address is required.');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient.createCompanyInvitation(companyId, {
        email: trimmedEmail,
        title: title.trim() || undefined,
        branch_id: branchId || undefined,
        department_id: departmentId || undefined,
        team_id: teamId || undefined,
      });

      setSuccessMsg(`HR Invitation sent successfully to ${trimmedEmail}!`);
      setEmail('');
      setTitle('');
      setBranchId('');
      setDepartmentId('');
      setTeamId('');
      await loadInvitations();
    } catch (err: any) {
      const appErr = err as AppApiError;
      const code = appErr.code || err.code;
      const message = appErr.message || err.message;

      const isExistingUserErr =
        code === 'EXISTING_USER_CANNOT_BE_INVITED' ||
        code === 'ACCOUNT_ALREADY_EXISTS' ||
        message?.includes('EXISTING_USER_CANNOT_BE_INVITED') ||
        message?.includes('ACCOUNT_ALREADY_EXISTS');

      if (isExistingUserErr) {
        setErrorMsg('An account with this email address already exists. HR invitations are strictly for new unregistered email addresses only.');
      } else if (code === 'USER_ALREADY_ACTIVE_MEMBER_ELSEWHERE') {
        setErrorMsg('This user is already an active member of another company.');
      } else {
        setErrorMsg(message || 'Failed to send HR invitation.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      setRevokingId(invitationId);
      await apiClient.revokeCompanyInvitation(companyId, invitationId, 'Revoked by owner');
      setSuccessMsg('Invitation revoked successfully.');
      await loadInvitations();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to revoke invitation.');
    } finally {
      setRevokingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Pending</Badge>;
      case 'accepted':
        return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Accepted</Badge>;
      case 'expired':
        return <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Expired</Badge>;
      case 'revoked':
        return <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredTeams = teams.filter((t) => !departmentId || t.department_id === departmentId);

  return (
    <div className="space-y-6">
      {/* Form: Send HR Invitation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Invite HR Team Member</CardTitle>
          <CardDescription>
            Send an official email invitation to add a new HR manager or recruiter to your company team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMsg && <Alert variant="error">{errorMsg}</Alert>}
          {successMsg && <Alert variant="success">{successMsg}</Alert>}

          <form onSubmit={handleSendInvite} className="space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Invitee Email Address *</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  required
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inviteTitle">Job Title / Role (Optional)</Label>
                <Input
                  id="inviteTitle"
                  type="text"
                  placeholder="e.g. Senior Talent Acquisition"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Organization Assignment Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-2">
                <Label htmlFor="branchSelect">Assign Branch (Optional)</Label>
                <select
                  id="branchSelect"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  disabled={submitting}
                  className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                >
                  <option value="">All / Unassigned Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deptSelect">Assign Department (Optional)</Label>
                <select
                  id="deptSelect"
                  value={departmentId}
                  onChange={(e) => {
                    setDepartmentId(e.target.value);
                    setTeamId('');
                  }}
                  disabled={submitting}
                  className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                >
                  <option value="">All / Unassigned Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teamSelect">Assign Team (Optional)</Label>
                <select
                  id="teamSelect"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  disabled={submitting}
                  className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                >
                  <option value="">All / Unassigned Teams</option>
                  {filteredTeams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="mr-2 h-4 w-4" /> : null}
              Send Invitation
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table: Invitation History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">Sent Invitations</CardTitle>
          <CardDescription>Track status and expiration of sent team invitations.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center">
              <Spinner className="mx-auto h-6 w-6 text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Loading invitations...</p>
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg">
              No team invitations sent yet. Use the form above to invite your HR team.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b bg-slate-50 text-slate-600 font-medium">
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Sent Date</th>
                    <th className="py-3 px-4">Expires</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{inv.email}</td>
                      <td className="py-3 px-4 text-slate-600">{inv.title || 'HR Member'}</td>
                      <td className="py-3 px-4">{getStatusBadge(inv.status)}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(inv.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {inv.status === 'pending' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={revokingId === inv.id}
                            onClick={() => handleRevoke(inv.id)}
                          >
                            {revokingId === inv.id ? <Spinner className="h-3 w-3" /> : 'Revoke'}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
