'use client';

import React from 'react';
import { PublicJobCard } from './public-job-card';
import { PublicJobFilters } from './public-job-filters';
import { PublicJobDetailPane } from './public-job-detail-pane';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import type { PublicJobItem, PublicJobSearchFilters } from '@/types/jobs';
import { AlertCircle, RefreshCw, Briefcase, ChevronDown } from 'lucide-react';

export function PublicJobList() {
  const { user } = useAuth();

  const [jobs, setJobs] = React.useState<PublicJobItem[]>([]);
  const [categories, setCategories] = React.useState<{ id: string; name: string }[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<PublicJobSearchFilters>({ limit: 12 });
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Track which job is selected in the right pane
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null);

  // Derived: selected job object
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;

  // Load categories once on mount
  React.useEffect(() => {
    let isMounted = true;
    apiClient
      .listJobCategories()
      .then((cats) => {
        if (isMounted && Array.isArray(cats)) {
          setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
        }
      })
      .catch(() => {
        // Non-critical; fallback to empty
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch jobs on filter change (resets cursor to first page)
  const fetchJobs = React.useCallback(async (searchFilters: PublicJobSearchFilters) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.searchPublicJobs(searchFilters);
      const validItems = (res.items || []).filter(
        (j) => j.status === 'published' && (!j.expires_at || new Date(j.expires_at) > new Date())
      );
      setJobs(validItems);
      setNextCursor(res.next_cursor || null);
      // Auto-select first job on initial load / filter change
      setSelectedJobId(validItems[0]?.id ?? null);
    } catch (err: any) {
      setError(err?.message || 'Unable to load jobs at this time. Please check your connection and retry.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchJobs(filters);
  }, [filters, fetchJobs]);

  const handleFilterChange = (newValues: Partial<PublicJobSearchFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newValues,
      cursor: undefined,
    }));
  };

  const handleClearFilters = () => {
    setFilters({ limit: 12 });
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await apiClient.searchPublicJobs({
        ...filters,
        cursor: nextCursor,
      });
      const validItems = (res.items || []).filter(
        (j) => j.status === 'published' && (!j.expires_at || new Date(j.expires_at) > new Date())
      );
      setJobs((prev) => [...prev, ...validItems]);
      setNextCursor(res.next_cursor || null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load more jobs.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <div className="w-full space-y-6" data-testid="public-jobs-container">
      {/* Search & Filters */}
      <PublicJobFilters
        filters={filters}
        categories={categories}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        isLoading={isLoading}
      />

      {/* Error State */}
      {error && (
        <Alert variant="destructive" data-testid="jobs-error-alert" className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <AlertTitle>Error Loading Jobs</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchJobs(filters)}
            className="gap-1.5 ml-4 shrink-0"
            data-testid="retry-button"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        </Alert>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div data-testid="jobs-loading-skeleton" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 animate-pulse space-y-4"
            >
              <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full" />
              <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && jobs.length === 0 && (
        <div
          data-testid="empty-jobs-state"
          className="text-center py-16 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 shadow-sm"
        >
          <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-950/60 rounded-full flex items-center justify-center mx-auto text-indigo-600">
            <Briefcase className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            No published jobs found
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            We couldn&apos;t find any jobs matching your current search criteria. Try modifying your search keywords or clearing filters.
          </p>
          <Button variant="outline" size="sm" onClick={handleClearFilters} data-testid="empty-clear-filters">
            Clear Filters
          </Button>
        </div>
      )}

      {/* Master-Detail Split Layout */}
      {!isLoading && !error && jobs.length > 0 && (
        <>
          {/* Jobs count */}
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 px-1">
            <span>
              Showing <strong>{jobs.length}</strong> available job{jobs.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Split layout: left list + right detail pane */}
          <div className="flex gap-4 items-start" data-testid="jobs-grid">
            {/* Left Pane — 30% width job card list */}
            <div className="w-full lg:w-[30%] shrink-0 space-y-2 overflow-y-auto max-h-[calc(100vh-12rem)] pb-2 pr-1">
              {jobs.map((job) => (
                <PublicJobCard
                  key={job.id}
                  job={job}
                  isSelected={job.id === selectedJobId}
                  onSelect={() => setSelectedJobId(job.id)}
                />
              ))}

              {/* Load More Button — inside left pane so it scrolls with the list */}
              {nextCursor && (
                <div className="text-center pt-4">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleLoadMore}
                    disabled={isLoadingMore}
                    className="gap-2 px-8 w-full"
                    data-testid="load-more-button"
                  >
                    {isLoadingMore ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Loading more jobs...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" /> Load More Jobs
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Right Pane — 70% width detail (desktop only, sticky) */}
            <div className="hidden lg:block w-[70%] sticky top-4 h-[calc(100vh-8rem)] min-h-[500px]">
              <PublicJobDetailPane job={selectedJob} user={user} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
