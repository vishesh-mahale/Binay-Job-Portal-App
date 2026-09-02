'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

export default function UnauthorizedPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <Card className="w-full max-w-md shadow-lg text-center border border-slate-200 dark:border-slate-800">
        <CardHeader className="space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-300">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m12-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">401 - Authentication Required</CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            You must be signed in to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2 text-sm text-slate-500">
          Your session may have expired or you have not logged in yet.
        </CardContent>
        <CardFooter className="flex flex-col space-y-2 pt-4">
          <Link href="/login" className="w-full">
            <Button className="w-full">Sign In</Button>
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
