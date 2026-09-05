'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import EmployerDashboardPage from '../employer/page';

export default function HrDashboardWrapper() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user?.role === 'employer') {
      router.replace('/dashboard/employer');
    }
  }, [user, loading, router]);

  return <EmployerDashboardPage />;
}
