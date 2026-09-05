'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Spinner } from '@/components/ui/spinner';

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (user.role === 'admin') {
        router.push('/dashboard/admin');
      } else if (user.role === 'hr') {
        router.push('/dashboard/hr');
      } else if (user.role === 'employer') {
        router.push('/dashboard/employer');
      } else {
        router.push('/dashboard/candidate');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex-1 flex items-center justify-center p-12 bg-slate-50 dark:bg-slate-950">
      <div className="text-center space-y-4">
        <Spinner size="lg" />
        <p className="text-sm text-slate-500 font-medium">Redirecting to your dashboard...</p>
      </div>
    </div>
  );
}
