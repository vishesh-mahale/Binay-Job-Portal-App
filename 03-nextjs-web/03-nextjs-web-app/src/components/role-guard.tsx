'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import type { ApplicationRole } from '@/types/auth';
import { Spinner } from '@/components/ui/spinner';

interface RoleGuardProps {
  allowedRoles: ApplicationRole[];
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const rolesKey = allowedRoles.join(',');

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = `/login?redirectTo=${encodeURIComponent(window.location.pathname)}`;
        }
      } else if (!allowedRoles.includes(user.role)) {
        router.push('/forbidden');
      }
    }
  }, [user, loading, rolesKey, router]);

  if (loading || !user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex-1 flex items-center justify-center p-12" data-testid="role-guard-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  return <>{children}</>;
}
