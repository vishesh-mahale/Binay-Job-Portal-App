'use client';

import React from 'react';
import Link from 'next/link';
import { PublicJobList } from '@/components/jobs/public-job-list';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function JobsIndexPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8 w-full space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Button>
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Explore All Published Jobs
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Search and filter verified opportunities across companies and categories.
        </p>
      </div>
      <PublicJobList />
    </main>
  );
}
