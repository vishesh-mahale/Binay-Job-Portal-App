'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { RoleGuard } from '@/components/role-guard';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

export default function EmployerDashboardPage() {
  const { user, logout } = useAuth();

  const [company, setCompany] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Edit Company Profile State
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editWebsite, setEditWebsite] = useState('');

  // Form states
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [companyIndustry, setCompanyIndustry] = useState('Technology');

  const [branchName, setBranchName] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchCountry, setBranchCountry] = useState('India');

  const [deptName, setDeptName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [deptIdForTeam, setDeptIdForTeam] = useState('');

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');

  const [newOwnerUserId, setNewOwnerUserId] = useState('');

  // 1. Mount effect to load existing company and organization lists
  useEffect(() => {
    async function loadCompanyData() {
      try {
        const comp = await apiClient.getMyCompany();
        if (comp) {
          setCompany(comp);
          setEditName(comp.name || '');
          setEditIndustry(comp.industry || '');
          setEditWebsite(comp.website || '');
          if (comp.verification_status === 'verified') {
            await loadOrgDetails(comp.id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load company on mount:', err);
      } finally {
        setInitialLoading(false);
      }
    }
    loadCompanyData();
  }, []);

  const loadOrgDetails = async (companyId: string) => {
    try {
      const [bList, dList, tList] = await Promise.all([
        apiClient.getBranches(companyId).catch(() => []),
        apiClient.getDepartments(companyId).catch(() => []),
        apiClient.getTeams(companyId).catch(() => []),
      ]);
      setBranches(bList);
      setDepartments(dList);
      setTeams(tList);
    } catch (err) {
      console.error('Failed to load org details:', err);
    }
  };

  const handleRefreshStatus = async () => {
    if (!company?.id) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await apiClient.getCompany(company.id);
      setCompany(updated);
      setSuccessMsg(`Company status refreshed: ${updated.verification_status.toUpperCase()}`);
      if (updated.verification_status === 'verified') {
        await loadOrgDetails(updated.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to refresh company status');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.createCompany({
        name: companyName,
        slug: companySlug || companyName.toLowerCase().replace(/\s+/g, '-'),
        industry: companyIndustry,
        email: user?.email,
      });
      setCompany(res);
      setEditName(res.name || '');
      setEditIndustry(res.industry || '');
      setSuccessMsg('Company created successfully! Status is currently UNVERIFIED.');
    } catch (err: any) {
      setError(err.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await apiClient.updateCompany(company.id, {
        name: editName,
        industry: editIndustry,
        website: editWebsite,
      });
      setCompany(updated);
      setIsEditingCompany(false);
      setSuccessMsg('Company profile updated successfully!');
    } catch (err: any) {
      setError(err.message || 'Failed to update company profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const newBranch = await apiClient.createBranch(company.id, {
        name: branchName,
        city: branchCity,
        country: branchCountry,
      });
      setBranches((prev) => [...prev, newBranch]);
      setSuccessMsg(`Branch '${branchName}' created!`);
      setBranchName('');
      setBranchCity('');
    } catch (err: any) {
      setError(err.message || 'Failed to create branch');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      const dept = await apiClient.createDepartment(company.id, { name: deptName });
      setDepartments((prev) => [...prev, dept]);
      setSuccessMsg(`Department '${deptName}' created!`);
      setDeptIdForTeam(dept.id);
      setDeptName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company || !deptIdForTeam) return;
    setLoading(true);
    setError(null);
    try {
      const newTeam = await apiClient.createTeam(company.id, { department_id: deptIdForTeam, name: teamName });
      setTeams((prev) => [...prev, newTeam]);
      setSuccessMsg(`Team '${teamName}' created!`);
      setTeamName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.inviteMember(company.id, { email: inviteEmail, title: inviteTitle });
      setSuccessMsg(`Invitation sent successfully to ${inviteEmail}!`);
      setInviteEmail('');
      setInviteTitle('');
    } catch (err: any) {
      setError(err.message || 'Failed to invite member. Please verify the user has a registered account.');
    } finally {
      setLoading(false);
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setLoading(true);
    setError(null);
    try {
      await apiClient.transferOwnership(company.id, { new_owner_user_id: newOwnerUserId });
      setSuccessMsg(`Ownership transferred successfully to ${newOwnerUserId}!`);
      setNewOwnerUserId('');
    } catch (err: any) {
      setError(err.message || 'Failed to transfer ownership');
    } finally {
      setLoading(false);
    }
  };

  const isVerified = company?.verification_status === 'verified';

  if (initialLoading) {
    return (
      <RoleGuard allowedRoles={['employer', 'hr']}>
        <main className="flex-1 p-6 md:p-10 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
          <p className="text-slate-500 text-sm">Loading Employer Workspace...</p>
        </main>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['employer', 'hr']}>
      <main className="flex-1 p-6 md:p-10 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {user?.role === 'hr' ? 'HR Portal' : 'Employer Portal'}
              </h1>
              <p className="text-slate-500 text-sm">Recruitment & Organization Workspace</p>
            </div>
            <Button variant="outline" onClick={logout} data-testid="logout-button">
              Sign Out
            </Button>
          </header>

          {error && (
            <div className="p-4 rounded bg-red-50 text-red-700 text-sm border border-red-200" data-testid="employer-error">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded bg-green-50 text-green-700 text-sm border border-green-200" data-testid="employer-success">
              {successMsg}
            </div>
          )}

          {/* User Session Info Card */}
          <Card data-testid="employer-dashboard-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>User Account</CardTitle>
                <Badge variant="default">{user?.role?.toUpperCase()}</Badge>
              </div>
              <CardDescription>Authenticated employer session active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>User ID:</strong> {user?.id}</p>
            </CardContent>
          </Card>

          {/* Step 1: Create Company if none exists */}
          {!company ? (
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Create Company Profile</CardTitle>
                <CardDescription>Register your business to begin managing your organization.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateCompany} className="space-y-4 text-sm">
                  <div>
                    <label className="block font-medium">Company Name</label>
                    <input
                      type="text"
                      required
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Acme Tech Corp"
                      className="mt-1 w-full p-2 border rounded dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium">Slug</label>
                    <input
                      type="text"
                      value={companySlug}
                      onChange={(e) => setCompanySlug(e.target.value)}
                      placeholder="e.g. acme-tech"
                      className="mt-1 w-full p-2 border rounded dark:bg-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-medium">Industry</label>
                    <input
                      type="text"
                      value={companyIndustry}
                      onChange={(e) => setCompanyIndustry(e.target.value)}
                      className="mt-1 w-full p-2 border rounded dark:bg-slate-900"
                    />
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Creating...' : 'Register Company'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Company Profile Details & Verification Banner */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{company.name}</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant={isVerified ? 'default' : 'outline'}>
                        {company.verification_status?.toUpperCase() || 'UNVERIFIED'}
                      </Badge>
                      <Button variant="outline" size="sm" onClick={handleRefreshStatus} disabled={loading}>
                        Refresh Status
                      </Button>
                    </div>
                  </div>
                  <CardDescription>Company ID: {company.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p><strong>Slug:</strong> {company.slug}</p>
                  <p><strong>Industry:</strong> {company.industry || 'N/A'}</p>
                  {company.website && <p><strong>Website:</strong> {company.website}</p>}

                  {/* Company Profile Edit Toggle */}
                  {!isEditingCompany ? (
                    <Button variant="outline" size="sm" onClick={() => setIsEditingCompany(true)}>
                      Edit Company Profile
                    </Button>
                  ) : (
                    <form onSubmit={handleUpdateCompany} className="p-4 border rounded bg-slate-100 dark:bg-slate-900 space-y-3">
                      <p className="font-semibold text-xs uppercase tracking-wider text-slate-500">Edit Profile</p>
                      <div>
                        <label className="block text-xs font-medium">Name</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-800 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium">Industry</label>
                        <input
                          type="text"
                          value={editIndustry}
                          onChange={(e) => setEditIndustry(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-800 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium">Website</label>
                        <input
                          type="text"
                          value={editWebsite}
                          onChange={(e) => setEditWebsite(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-800 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={loading}>Save Profile</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingCompany(false)}>Cancel</Button>
                      </div>
                    </form>
                  )}

                  {!isVerified ? (
                    <div className="p-4 rounded bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 space-y-2">
                      <p className="font-semibold text-base">🟡 Verification Pending with Platform Admin</p>
                      <p className="text-xs">
                        Your company details have been submitted to Platform Admin for review. Branch creation, department setup, team management, and member invitations are restricted until status is <strong>VERIFIED</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800 space-y-1">
                      <p className="font-semibold text-base">🟢 Verified Company Workspace</p>
                      <p className="text-xs">Your company is fully verified by Platform Admin. All HR and organization tools are unlocked.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Organization Modules - Disabled/Restricted when unverified */}
              {isVerified && (
                <div className="space-y-6">
                  {/* Branch Module */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Branch Management</CardTitle>
                      <CardDescription>Office locations & branches ({branches.length} active)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {branches.length > 0 && (
                        <div className="space-y-2 border-b pb-4">
                          <p className="text-xs font-semibold uppercase text-slate-500">Active Branches</p>
                          <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                            {branches.map((b) => (
                              <li key={b.id} className="py-2 flex items-center justify-between">
                                <div>
                                  <span className="font-medium">{b.name}</span> {b.is_headquarters && <Badge variant="outline">HQ</Badge>}
                                  <p className="text-xs text-slate-500">{b.city}, {b.country}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <form onSubmit={handleAddBranch} className="space-y-3 text-sm">
                        <label className="font-medium block">Add New Branch</label>
                        <input
                          type="text"
                          required
                          placeholder="Branch Name (e.g. Delhi HQ)"
                          value={branchName}
                          onChange={(e) => setBranchName(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-900"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            required
                            placeholder="City"
                            value={branchCity}
                            onChange={(e) => setBranchCity(e.target.value)}
                            className="p-2 border rounded dark:bg-slate-900"
                          />
                          <input
                            type="text"
                            required
                            placeholder="Country"
                            value={branchCountry}
                            onChange={(e) => setBranchCountry(e.target.value)}
                            className="p-2 border rounded dark:bg-slate-900"
                          />
                        </div>
                        <Button type="submit" disabled={loading}>Add Branch</Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Department & Team Module */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Departments & Teams</CardTitle>
                      <CardDescription>Structure internal organization hierarchy ({departments.length} Depts, {teams.length} Teams)</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {departments.length > 0 && (
                        <div className="space-y-2 border-b pb-4">
                          <p className="text-xs font-semibold uppercase text-slate-500">Active Departments</p>
                          <ul className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                            {departments.map((d) => (
                              <li key={d.id} className="py-2">
                                <span className="font-medium">{d.name}</span>
                                {teams.filter((t) => t.department_id === d.id).length > 0 && (
                                  <span className="text-xs text-slate-500 ml-2">
                                    (Teams: {teams.filter((t) => t.department_id === d.id).map((t) => t.name).join(', ')})
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <form onSubmit={handleAddDepartment} className="space-y-2 text-sm">
                        <label className="font-medium block">Create Department</label>
                        <input
                          type="text"
                          required
                          placeholder="Department Name (e.g. Engineering)"
                          value={deptName}
                          onChange={(e) => setDeptName(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-900"
                        />
                        <Button type="submit" disabled={loading}>Create Department</Button>
                      </form>

                      {departments.length > 0 && (
                        <form onSubmit={handleAddTeam} className="space-y-2 text-sm pt-4 border-t">
                          <label className="font-medium block">Add Team to Department</label>
                          <select
                            value={deptIdForTeam}
                            onChange={(e) => setDeptIdForTeam(e.target.value)}
                            className="w-full p-2 border rounded dark:bg-slate-900 text-sm"
                          >
                            <option value="">Select Department...</option>
                            {departments.map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            required
                            placeholder="Team Name (e.g. Backend Core)"
                            value={teamName}
                            onChange={(e) => setTeamName(e.target.value)}
                            className="w-full p-2 border rounded dark:bg-slate-900"
                          />
                          <Button type="submit" disabled={loading || !deptIdForTeam}>Add Team</Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>

                  {/* Email-Based Member Invite Module */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Invite Registered Team Member</CardTitle>
                      <CardDescription>Send invitation to existing registered user by email (Option A Flow).</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleInviteMember} className="space-y-3 text-sm">
                        <input
                          type="email"
                          required
                          placeholder="Invitee Account Email (e.g. hr@acme.com)"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          placeholder="Job Title (e.g. Senior Software Engineer)"
                          value={inviteTitle}
                          onChange={(e) => setInviteTitle(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-900"
                        />
                        <Button type="submit" disabled={loading}>Send Invitation</Button>
                      </form>
                    </CardContent>
                  </Card>

                  {/* Ownership Transfer Module */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Transfer Ownership</CardTitle>
                      <CardDescription>Transfer primary company ownership to another active member.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleTransferOwnership} className="space-y-3 text-sm">
                        <input
                          type="text"
                          required
                          placeholder="New Owner User ID"
                          value={newOwnerUserId}
                          onChange={(e) => setNewOwnerUserId(e.target.value)}
                          className="w-full p-2 border rounded dark:bg-slate-900"
                        />
                        <Button type="submit" variant="danger" disabled={loading}>Transfer Ownership</Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </RoleGuard>
  );
}
