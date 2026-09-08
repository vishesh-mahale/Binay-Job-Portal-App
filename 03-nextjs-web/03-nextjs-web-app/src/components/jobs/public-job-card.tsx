'use client';

import React from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Briefcase, Building2, Shield, Calendar, ArrowRight, IndianRupee } from 'lucide-react';
import type { PublicJobItem } from '@/types/jobs';

export interface PublicJobCardProps {
  job: PublicJobItem;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function PublicJobCard({ job, isSelected = false, onSelect }: PublicJobCardProps) {
  const isConfidential = Boolean(job.is_confidential || job.company_name === 'Confidential Employer');
  const companyDisplayName = isConfidential ? 'Confidential Employer' : (job.company_name || 'Verified Employer');

  // Format Location
  const locationParts = [job.location_city, job.location_state, job.location_country].filter(Boolean);
  const locationText = locationParts.length > 0 ? locationParts.join(', ') : (job.work_mode === 'remote' ? 'Remote' : 'Location Not Specified');

  // Format Work Mode
  const workModeLabel = job.work_mode
    ? job.work_mode.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Format Employment Type
  const employmentTypeLabel = job.employment_type
    ? job.employment_type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Format Experience Level
  const experienceLabel = job.experience_level
    ? job.experience_level.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null;

  // Format Salary if visible
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

  // Skills if present in public DTO
  const skillTags: string[] = [];
  if (Array.isArray(job.custom_skills) && job.custom_skills.length > 0) {
    skillTags.push(...job.custom_skills);
  }
  if (Array.isArray(job.skills) && job.skills.length > 0) {
    job.skills.forEach((s) => {
      if (s.skill_name && !skillTags.includes(s.skill_name)) {
        skillTags.push(s.skill_name);
      }
    });
  }

  // Published Date
  const publishedDateText = job.published_at
    ? new Date(job.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Card
      data-testid="public-job-card"
      onClick={onSelect}
      aria-selected={isSelected}
      className={`cursor-pointer transition-all border bg-white dark:bg-slate-900 hover:shadow-sm ${
        isSelected
          ? 'border-indigo-500 bg-indigo-50/40 dark:border-indigo-400 dark:bg-indigo-950/20 shadow-sm'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="p-3 space-y-1.5">
        {/* Title + Badges */}
        <div className="flex items-start justify-between gap-1.5">
          <h3
            data-testid="job-title"
            className="text-sm font-semibold text-slate-900 dark:text-white line-clamp-2 leading-snug flex-1"
          >
            {job.title}
          </h3>
          <div className="flex gap-1 shrink-0 mt-0.5">
            {job.is_urgent && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0 uppercase">
                Urgent
              </Badge>
            )}
            {job.is_featured && (
              <Badge variant="default" className="text-[9px] px-1 py-0 uppercase bg-indigo-600">
                Featured
              </Badge>
            )}
          </div>
        </div>

        {/* Company */}
        <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
          {isConfidential ? (
            <>
              <Shield className="w-3 h-3 text-amber-500 shrink-0" />
              <span data-testid="company-name" className="italic truncate">{companyDisplayName}</span>
            </>
          ) : (
            <>
              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span data-testid="company-name" className="truncate">{companyDisplayName}</span>
            </>
          )}
        </div>

        {/* Location + Work Mode */}
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1" data-testid="job-location">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate">{locationText}</span>
          </div>
          {workModeLabel && (
            <div className="flex items-center gap-1" data-testid="job-work-mode">
              <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate">{workModeLabel}</span>
            </div>
          )}
        </div>

        {/* Salary */}
        {salaryText && (
          <div
            className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
            data-testid="job-salary"
          >
            <IndianRupee className="w-3 h-3 shrink-0" />
            <span className="truncate">{salaryText}</span>
          </div>
        )}

        {/* Footer: date + mobile link */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1 text-[10px] text-slate-400" data-testid="job-published-date">
            <Calendar className="w-3 h-3" />
            <span>{publishedDateText ? `Posted ${publishedDateText}` : 'Recently Posted'}</span>
          </div>
          <Link
            href={`/jobs/${encodeURIComponent(job.slug)}`}
            className="lg:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 text-indigo-600 hover:text-indigo-700 px-1.5">
              Open <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
