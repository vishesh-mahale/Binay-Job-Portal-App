'use client';

import React from 'react';
import { useAuth } from '@/context/auth-context';
import { RoleGuard } from '@/components/role-guard';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function CandidateDashboardPage() {
  const { user, logout } = useAuth();

  return (
    <RoleGuard allowedRoles={['candidate']}>
      <main className="flex-1 p-6 md:p-10 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-4xl mx-auto space-y-6">
          <header className="flex items-center justify-between border-b pb-4 border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Candidate Portal</h1>
              <p className="text-slate-500 text-sm">Welcome back to your job search dashboard</p>
            </div>
            <Button variant="outline" onClick={logout} data-testid="logout-button">
              Sign Out
            </Button>
          </header>

          <Card data-testid="candidate-dashboard-card">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Account Overview</CardTitle>
                <Badge variant="primary">Candidate</Badge>
              </div>
              <CardDescription>Verified session active</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>User ID:</strong> {user?.id}</p>
              <p><strong>Account Status:</strong> {user?.status}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </RoleGuard>
  );
}
