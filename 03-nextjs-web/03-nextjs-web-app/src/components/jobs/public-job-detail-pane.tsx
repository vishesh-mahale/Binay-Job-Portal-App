'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PublicJobItem } from '@/types/jobs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  MapPin,
  Briefcase,
  IndianRupee,
  Shield,
  Calendar,
  HelpCircle,
  Share2,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';

interface PublicJobDetailPaneProps {
  job: PublicJobItem | null;
  user: { id: string; role: string } | null;
}

export function PublicJobDetailPane({ job, user }: PublicJobDetailPaneProps) {
  const router = useRouter();
  const [copied, setCopied] = React.useState(false);
  const scrollBodyRef = React.useRef<HTMLDivElement>(null);

  // Scroll right pane back to top whenever selected job changes
  React.useEffect(() => {
    if (scrollBodyRef.current) {
      scrollBodyRef.current.scrollTop = 0;
    }
  }, [job?.id]);

  if (!job) {
    return (
      <div
        data-testid="detail-pane-empty"
        className="h-full flex flex-col items-center justify-center text-center space-y-4 p-8 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-300 dark:border-slate-700"
      >
        <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-500">
          <Briefcase className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">
          Select a job to view details
        </h3>
        <p className="text-sm text-slate-500 max-w-xs">
          Click any job card on the left to see the full description, requirements and apply.
        </p>
      </div>
    );
  }

  const isConfidential = Boolean(job.is_confidential || job.company_name === 'Confidential Employer');
  const companyDisplayName = isConfidential
    ? 'Confidential Employer'
    : job.company_name || 'Verified Employer';

  const salaryText = (() => {
    if (job.salary_visible === false) return null;
    const min = job.salary_min ? Number(job.salary_min) : null;
    const max = job.salary_max ? Number(job.salary_max) : null;
    if (!min && !max) return null;
    const currency = job.salary_currency || 'INR';
    const period = job.salary_period ? `/${job.salary_period}` : '';
    if (min && max) return `${currency} ${min.toLocaleString()} - ${max.toLocaleString()} ${period}`;
    if (min) return `From ${currency} ${min.toLocaleString()} ${period}`;
    return `Up to ${currency} ${max!.toLocaleString()} ${period}`;
  })();

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

  const mustHaveSkills = Array.isArray(job.skills) ? job.skills.filter((s) => s.is_required) : [];
  const niceToHaveSkills = Array.isArray(job.skills) ? job.skills.filter((s) => !s.is_required) : [];
  const customSkills = Array.isArray(job.custom_skills) ? job.custom_skills : [];

  const jobUrl = `/jobs/${encodeURIComponent(job.slug || job.id)}`;
  const loginRedirectUrl = `/login?redirect=${jobUrl}`;

  const handleShare = async () => {
    if (typeof window !== 'undefined') {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${jobUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } catch {
        // clipboard write failed silently
      }
    }
  };

  return (
    <div
      data-testid="detail-pane"
      className="flex flex-col h-full overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <span
          data-testid="detail-pane-job-title"
          className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate"
        >
          {job.title}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleShare}
            className="h-8 gap-1.5 text-xs"
            data-testid="detail-pane-share-btn"
          >
            <Share2 className="w-3.5 h-3.5" />
            {copied ? 'Copied!' : 'Share'}
          </Button>
          <Link
            href={jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="open-in-new-tab-btn"
          >
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
              <ExternalLink className="w-3.5 h-3.5" />
              Open
            </Button>
          </Link>
        </div>
      </div>

      {/* Scrollable Body */}
      <div ref={scrollBodyRef} className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          {job.work_mode && (
            <Badge variant="outline" className="capitalize text-xs">
              {job.work_mode.replace('_', ' ')}
            </Badge>
          )}
          {job.employment_type && (
            <Badge variant="outline" className="capitalize text-xs">
              {job.employment_type.replace('_', ' ')}
            </Badge>
          )}
          {job.experience_level && (
            <Badge variant="secondary" className="capitalize text-xs">
              {job.experience_level.replace('_', ' ')}
            </Badge>
          )}
          {job.category && (
            <Badge variant="secondary" className="text-xs">
              {job.category}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h2
          data-testid="detail-pane-heading"
          className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight"
        >
          {job.title}
        </h2>

        {/* Company + Location + Date */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-medium">
            {isConfidential ? (
              <>
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="italic text-slate-500">{companyDisplayName}</span>
              </>
            ) : (
              <>
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{companyDisplayName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{locationText}</span>
          </div>
          {job.published_at && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>
                Posted{' '}
                {new Date(job.published_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>

        {/* Salary */}
        {salaryText && (
          <div
            data-testid="detail-pane-salary"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold rounded-md text-sm border border-emerald-200 dark:border-emerald-800"
          >
            <IndianRupee className="w-4 h-4 shrink-0" />
            {salaryText}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center gap-3">
          {user ? (
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2"
              onClick={() => router.push(`/dashboard/candidate?apply=${encodeURIComponent(job.id)}`)}
              data-testid="detail-pane-apply-btn"
            >
              Apply Now <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Link href={loginRedirectUrl}>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2"
                data-testid="detail-pane-signin-btn"
              >
                Sign in to Apply <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {job.vacancies && job.vacancies > 0 ? (
            <span className="text-xs text-slate-500">
              {job.vacancies} opening{job.vacancies > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {job.description && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Job Overview</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {job.description}
            </p>
          </div>
        )}

        {job.responsibilities && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Key Responsibilities</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {job.responsibilities}
            </p>
          </div>
        )}

        {job.requirements && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Requirements &amp; Qualifications</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {job.requirements}
            </p>
          </div>
        )}

        {job.preferred_qualifications && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Preferred Qualifications</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {job.preferred_qualifications}
            </p>
          </div>
        )}

        {job.benefits && (
          <div className="space-y-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Perks &amp; Benefits</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {job.benefits}
            </p>
          </div>
        )}

        {/* Job Specification */}
        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Job Specification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm pb-4">
            {job.employment_type && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 capitalize">
                <span className="text-slate-500">Employment Type</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.employment_type.replace('_', ' ')}</span>
              </div>
            )}
            {job.work_mode && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 capitalize">
                <span className="text-slate-500">Work Mode</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.work_mode.replace('_', ' ')}</span>
              </div>
            )}
            {job.work_shift && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 capitalize">
                <span className="text-slate-500">Work Shift</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.work_shift.replace('_', ' ')}</span>
              </div>
            )}
            {job.experience_level && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 capitalize">
                <span className="text-slate-500">Experience Level</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.experience_level.replace('_', ' ')}</span>
              </div>
            )}
            {job.min_education_level && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 capitalize">
                <span className="text-slate-500">Min Education</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.min_education_level.replace('_', ' ')}</span>
              </div>
            )}
            {job.max_notice_period_days != null && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Max Notice Period</span>
                <span className="font-medium text-slate-900 dark:text-white">{job.max_notice_period_days} days</span>
              </div>
            )}
            {job.expires_at && (
              <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Application Deadline</span>
                <span className="font-medium text-slate-900 dark:text-white">
                  {new Date(job.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Skills */}
        {(mustHaveSkills.length > 0 || niceToHaveSkills.length > 0 || customSkills.length > 0) && (
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Skills &amp; Competencies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4">
              {mustHaveSkills.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Must Have</span>
                  <div className="flex flex-wrap gap-1.5">
                    {mustHaveSkills.map((s, idx) => (
                      <Badge key={s.id || idx} variant="default" className="bg-indigo-600 text-white hover:bg-indigo-700 text-xs">
                        {s.skill_name}{s.min_years ? ` (${s.min_years}y+)` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {niceToHaveSkills.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nice to Have</span>
                  <div className="flex flex-wrap gap-1.5">
                    {niceToHaveSkills.map((s, idx) => (
                      <Badge key={s.id || idx} variant="secondary" className="text-xs">{s.skill_name}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {customSkills.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Additional Skills</span>
                  <div className="flex flex-wrap gap-1.5">
                    {customSkills.map((cs, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">{cs}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Screening Notice */}
        {job.screening_questions_enabled && (
          <div className="p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Screening Step Included</span>
            </div>
            <p>This job includes quick screening questions during candidate application submission.</p>
          </div>
        )}

        {/* Bottom CTA repeat */}
        <div className="pt-2 pb-4 flex justify-center">
          {user ? (
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 px-8"
              onClick={() => router.push(`/dashboard/candidate?apply=${encodeURIComponent(job.id)}`)}
            >
              Apply Now <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Link href={loginRedirectUrl}>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2 px-8">
                Sign in to Apply <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
