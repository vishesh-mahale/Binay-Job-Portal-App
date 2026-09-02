'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

export default function ForbiddenPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md shadow-lg text-center border border-slate-200 dark:border-slate-800">
        <CardHeader className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-600 dark:text-red-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">403 - Access Denied</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            You do not have permission to access this area.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2 text-sm text-slate-500">
          This dashboard requires a different application role.
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 pt-4">
          <Link href="/dashboard" className="w-full">
            <Button className="w-full">Go to My Dashboard</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
