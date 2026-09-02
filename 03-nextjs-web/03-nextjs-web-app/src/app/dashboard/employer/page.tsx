'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { RoleGuard } from '@/components/role-guard';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function EmployerDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <RoleGuard allowedRoles={['employer', 'hr']}>
      <main className="flex-1 p-6 md:p-10 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {user?.role === 'hr' ? 'HR Portal' : 'Employer Portal'}
              </h1>
              <p className="text-slate-500 text-sm">Recruitment, job postings and applicant management</p>
            </div>
            <Button variant="outline" onClick={logout} data-testid="logout-button">
              Sign Out
            </Button>
          </header>

          <Card data-testid="employer-dashboard-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Organization Workspace</CardTitle>
                <Badge variant="default">{user?.role?.toUpperCase()}</Badge>
              </div>
              <CardDescription>Verified employer session active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>User ID:</strong> {user?.id}</p>
              <p><strong>Role:</strong> {user?.role}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </RoleGuard>
  );
}
