'use client';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { apiClient } from '@/lib/api-client';
import type { PublicJobItem } from '@/types/jobs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Briefcase,
  Clock,
  IndianRupee,
  Shield,
  Calendar,
  Users,
  CheckCircle2,
  Share2,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Award
} from 'lucide-react';

function JobDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const slugParam = params?.slug as string | undefined;
  const idParam = searchParams?.get('id');

  const [job, setJob] = React.useState<PublicJobItem | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isMounted = true;
    async function loadJob() {
      setIsLoading(true);
      setError(null);
      try {
        let res: PublicJobItem;
        if (slugParam && slugParam !== 'index') {
          // Attempt slug lookup first
          try {
            res = await apiClient.getPublicJobBySlug(slugParam);
          } catch (slugErr: any) {
            // If slug lookup fails and it looks like a UUID or idParam is present, fallback
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidPattern.test(slugParam)) {
              res = await apiClient.getPublicJobById(slugParam);
            } else if (idParam && uuidPattern.test(idParam)) {
              res = await apiClient.getPublicJobById(idParam);
            } else {
              throw slugErr;
            }
          }
        } else if (idParam) {
          res = await apiClient.getPublicJobById(idParam);
        } else {
          throw new Error('No job identifier provided.');
        }

        if (isMounted) {
          setJob(res);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Job not found or no longer active.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadJob();

    return () => {
      isMounted = false;
    };
  }, [slugParam, idParam]);

  const handleShare = async () => {
    if (typeof window !== 'undefined') {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // clipboard write failed
      }
    }
  };

  if (isLoading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12 w-full">
        <div data-testid="job-detail-loading" className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500">Loading job details...</p>
        </div>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12 w-full">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Jobs
            </Button>
          </Link>
        </div>
        <Alert variant="destructive" data-testid="job-detail-error" className="py-6">
          <AlertCircle className="w-6 h-6" />
          <div className="ml-3">
            <AlertTitle className="text-lg font-semibold">Position Unavailable</AlertTitle>
            <AlertDescription className="mt-1 text-sm">
              {error || 'This job is either unpublished, expired, or does not exist.'}
            </AlertDescription>
            <div className="mt-4">
              <Link href="/">
                <Button variant="outline" size="sm">
                  Browse Active Positions
                </Button>
              </Link>
            </div>
          </div>
        </Alert>
      </main>
    );
  }

  // Strictly enforce confidential masking
  const isConfidential = Boolean(job.is_confidential || job.company_name === 'Confidential Employer');
  const companyDisplayName = isConfidential ? 'Confidential Employer' : (job.company_name || 'Verified Employer');

  // Format Salary
  const formatSalary = () => {
    if (job.salary_visible === false) return null;
    const min = job.salary_min ? Number(job.salary_min) : null;
    const max = job.salary_max ? Number(job.salary_max) : null;
    if (!min && !max) return null;

    const currency = job.salary_currency || 'INR';
    const period = job.salary_period ? `/${job.salary_period}` : '';

    if (min && max) {
      return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()} ${period}`;
    }
    if (min) {
      return `From ${currency} ${min.toLocaleString()} ${period}`;
    }
    return `Up to ${currency} ${max!.toLocaleString()} ${period}`;
  };
  const salaryText = formatSalary();

  // Primary & secondary locations
  const locationText = (() => {
    if (Array.isArray(job.locations) && job.locations.length > 0) {
      return job.locations
        .map((l) => [l.city, l.state, l.country].filter(Boolean).join(', '))
        .join(' | ');
    }
    const parts = [job.location_city, job.location_state, job.location_country].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    return job.work_mode === 'remote' ? 'Remote' : 'Location Not Specified';
  })();

  // Skills
  const mustHaveSkills = Array.isArray(job.skills)
    ? job.skills.filter((s) => s.is_required)
    : [];
  const niceToHaveSkills = Array.isArray(job.skills)
    ? job.skills.filter((s) => !s.is_required)
    : [];
  const customSkills = Array.isArray(job.custom_skills) ? job.custom_skills : [];

  const loginRedirectUrl = `/login?redirect=/jobs/${encodeURIComponent(job.slug || job.id)}`;

  return (
    <main data-testid="public-job-detail-page" className="max-w-5xl mx-auto px-4 py-8 w-full space-y-8">
      {/* Back Navigation & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-2 text-slate-600 dark:text-slate-400">
            <ArrowLeft className="w-4 h-4" /> Back to All Jobs
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-2" data-testid="share-job-btn">
            <Share2 className="w-4 h-4" />
            {copied ? 'Link Copied!' : 'Share'}
          </Button>
        </div>
      </div>

      {/* Hero Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-4 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {job.is_urgent && (
                <Badge variant="destructive" className="bg-amber-500/10 text-amber-700 border-amber-300">
                  Urgent
                </Badge>
              )}
              {job.is_featured && (
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                  Featured
                </Badge>
              )}
              {job.work_mode && (
                <Badge variant="outline" className="capitalize">
                  {job.work_mode.replace('_', ' ')}
                </Badge>
              )}
              {job.employment_type && (
                <Badge variant="outline" className="capitalize">
                  {job.employment_type.replace('_', ' ')}
                </Badge>
              )}
            </div>

            <div>
              <h1 data-testid="detail-job-title" className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {job.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-slate-600 dark:text-slate-400 text-sm">
                <div className="flex items-center gap-1.5 font-medium">
                  {isConfidential ? (
                    <>
                      <Shield className="w-4 h-4 text-amber-500" />
                      <span data-testid="detail-company-name" className="italic text-slate-500">
                        {companyDisplayName}
                      </span>
                    </>
                  ) : (
                    <>
                      <Building2 className="w-4 h-4 text-slate-400" />
                      <span data-testid="detail-company-name">{companyDisplayName}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  <span>{locationText}</span>
                </div>
                {job.published_at && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Posted {new Date(job.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                )}
              </div>
            </div>

            {salaryText && (
              <div data-testid="detail-salary" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold rounded-md text-sm border border-emerald-200 dark:border-emerald-800">
                <IndianRupee className="w-4 h-4" />
                <span>{salaryText}</span>
              </div>
            )}
          </div>

          {/* CTA Box */}
          <div className="md:w-64 w-full flex flex-col gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-800">
            {user ? (
              <Button
                size="lg"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                onClick={() => {
                  router.push(`/dashboard/candidate?apply=${encodeURIComponent(job.id)}`);
                }}
                data-testid="apply-now-btn"
              >
                Apply Now
              </Button>
            ) : (
              <Link href={loginRedirectUrl} className="w-full">
                <Button size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold" data-testid="signin-to-apply-btn">
                  Sign in to Apply
                </Button>
              </Link>
            )}
            <p className="text-xs text-center text-slate-500">
              {user ? 'Click to submit your profile & resume' : 'Requires candidate registration'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Details & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Description & Requirements */}
        <div className="lg:col-span-2 space-y-8">
          {/* Job Overview */}
          {job.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Job Overview</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                {job.description}
              </CardContent>
            </Card>
          )}

          {/* Key Responsibilities */}
          {job.responsibilities && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Key Responsibilities</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                {job.responsibilities}
              </CardContent>
            </Card>
          )}

          {/* Requirements */}
          {job.requirements && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Requirements & Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                {job.requirements}
              </CardContent>
            </Card>
          )}

          {/* Preferred Qualifications */}
          {job.preferred_qualifications && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Preferred Qualifications</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                {job.preferred_qualifications}
              </CardContent>
            </Card>
          )}

          {/* Benefits */}
          {job.benefits && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Perks & Benefits</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                {job.benefits}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right 1 Col: Job Metadata & Required Skills */}
        <div className="space-y-6">
          {/* Job Summary Specs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Job Specification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Employment Type</span>
                <span className="font-medium text-slate-900 dark:text-white capitalize">
                  {job.employment_type?.replace('_', ' ') || 'Full Time'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Work Mode</span>
                <span className="font-medium text-slate-900 dark:text-white capitalize">
                  {job.work_mode?.replace('_', ' ') || 'On-site'}
                </span>
              </div>
              {job.work_shift && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Work Shift</span>
                  <span className="font-medium text-slate-900 dark:text-white capitalize">
                    {job.work_shift.replace('_', ' ')}
                  </span>
                </div>
              )}
              {job.experience_level && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Experience Level</span>
                  <span className="font-medium text-slate-900 dark:text-white capitalize">
                    {job.experience_level.replace('_', ' ')}
                  </span>
                </div>
              )}
              {job.min_education_level && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Min Education</span>
                  <span className="font-medium text-slate-900 dark:text-white capitalize">
                    {job.min_education_level.replace('_', ' ')}
                  </span>
                </div>
              )}
              {job.max_notice_period_days !== undefined && job.max_notice_period_days !== null && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Max Notice Period</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {job.max_notice_period_days} days
                  </span>
                </div>
              )}
              {job.vacancies !== undefined && job.vacancies !== null && job.vacancies > 0 && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Openings</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {job.vacancies}
                  </span>
                </div>
              )}
              {job.expires_at && (
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Deadline</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {new Date(job.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills Breakdown */}
          {(mustHaveSkills.length > 0 || niceToHaveSkills.length > 0 || customSkills.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Skills & Competencies</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mustHaveSkills.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      Must Have
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {mustHaveSkills.map((s, idx) => (
                        <Badge key={s.id || idx} variant="default" className="bg-indigo-600 text-white hover:bg-indigo-700">
                          {s.skill_name}
                          {s.min_years ? ` (${s.min_years}y+)` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {niceToHaveSkills.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Nice to Have
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {niceToHaveSkills.map((s, idx) => (
                        <Badge key={s.id || idx} variant="secondary">
                          {s.skill_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {customSkills.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Additional Skills
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {customSkills.map((cs, idx) => (
                        <Badge key={idx} variant="outline">
                          {cs}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Screening Notice */}
          {job.screening_questions_enabled && (
            <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Screening Step Included</span>
              </div>
              <p>This job includes quick screening questions during candidate application submission.</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PublicJobDetailPage() {
  return (
    <React.Suspense
      fallback={
        <main className="max-w-5xl mx-auto px-4 py-12 w-full">
          <div data-testid="job-detail-loading" className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-500">Loading job details...</p>
          </div>
        </main>
      }
    >
      <JobDetailContent />
    </React.Suspense>
  );
}
