'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { RoleGuard } from '@/components/role-guard';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import type { CandidateProfileResponse, CandidateResume, ParsedResumeResponse, ResumeStatusResponse } from '@/types/candidate';
import type { ApplicationDetail, ApplicationHistoryItem, ApplicationListItem } from '@/types/applications';
import type { PublicJobItem } from '@/types/jobs';

type Section = 'overview' | 'profile' | 'resumes' | 'applications';

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  UPLOADED: { label: 'Uploaded', color: 'text-slate-500' },
  SECURITY_SCANNING: { label: 'Security scanning…', color: 'text-amber-600' },
  SECURITY_REJECTED: { label: 'Security threat detected', color: 'text-rose-600' },
  SECURITY_RETRYABLE_FAILURE: { label: 'Security scan failed (retryable)', color: 'text-amber-600' },
  PARSING_QUEUED: { label: 'Queued for parsing', color: 'text-slate-500' },
  PARSING_IN_PROGRESS: { label: 'Parsing resume…', color: 'text-amber-600' },
  PARSING_FAILED: { label: 'Parsing failed', color: 'text-rose-600' },
  REVIEW_READY: { label: 'Ready for review', color: 'text-emerald-600' },
  REVIEW_READY_PARTIAL: { label: 'Partially parsed', color: 'text-amber-600' },
};

function CandidateDashboardContent() {
  const { user, logout } = useAuth();
  const searchParams = useSearchParams();
  const applyJobId = searchParams.get('apply');
  const [section, setSection] = useState<Section>(applyJobId ? 'resumes' : 'overview');
  const [candidate, setCandidate] = useState<CandidateProfileResponse | null>(null);
  const [resumes, setResumes] = useState<CandidateResume[]>([]);
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [useAsActive, setUseAsActive] = useState(true);
  const [selectedResumeId, setSelectedResumeId] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<ResumeStatusResponse | null>(null);
  const [parsedResume, setParsedResume] = useState<ParsedResumeResponse | null>(null);
  const [editedFacts, setEditedFacts] = useState<Record<string, unknown>>({});
  const [confirming, setConfirming] = useState(false);
  const [selectedJob, setSelectedJob] = useState<PublicJobItem | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [consent, setConsent] = useState(false);
  const [screeningAnswers, setScreeningAnswers] = useState<Record<string, string>>({});
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationDetail | null>(null);
  const [applicationHistory, setApplicationHistory] = useState<ApplicationHistoryItem[]>([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [profile, resumeList, applicationList] = await Promise.all([
        apiClient.getCandidateProfile(), apiClient.listCandidateResumes(), apiClient.getMyApplications(),
      ]);
      setCandidate(profile); setResumes(resumeList); setApplications(applicationList);
      // Seed editedFacts from existing profile facts so edits always start from current state
      setEditedFacts((prev) => ({
        ...prev,
        // Seeded empty on purpose: candidate_profiles carries no name/email/phone, and a pre-filled
        // object here would make mergeIfEmpty() reject the parsed resume's real contact_info below.
        contact_info: prev.contact_info || {},
        professional_title: prev.professional_title || profile.profile?.professional_title || '',
        summary: prev.summary || profile.profile?.summary || '',
        skills: Array.isArray(prev.skills) && prev.skills.length > 0 ? prev.skills : (Array.isArray(profile.skills) ? profile.skills : []),
        experiences: Array.isArray(prev.experiences) && prev.experiences.length > 0 ? prev.experiences : (Array.isArray(profile.experiences) ? profile.experiences : []).map((e: any) => ({
          ...e,
          responsibilities: Array.isArray(e.responsibilities) ? e.responsibilities.join('\n') : (typeof e.responsibilities === 'string' ? e.responsibilities : ''),
          achievements: Array.isArray(e.achievements) ? e.achievements.join('\n') : (typeof e.achievements === 'string' ? e.achievements : ''),
          skills: Array.isArray(e.skills) ? e.skills.join(', ') : (typeof e.skills === 'string' ? e.skills : ''),
        })),
        educations: Array.isArray(prev.educations) && prev.educations.length > 0 ? prev.educations : (Array.isArray(profile.educations) ? profile.educations : []),
        certifications: Array.isArray(prev.certifications) && prev.certifications.length > 0 ? prev.certifications : (Array.isArray(profile.certifications) ? profile.certifications : []),
        projects: Array.isArray(prev.projects) && prev.projects.length > 0 ? prev.projects : (Array.isArray(profile.projects) ? profile.projects : []).map((p: any) => ({
          ...p,
          technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : (typeof p.technologies === 'string' ? p.technologies : ''),
        })),
        languages: Array.isArray(prev.languages) && prev.languages.length > 0 ? prev.languages : (Array.isArray(profile.languages) ? profile.languages : []),
        awards: Array.isArray(prev.awards) && prev.awards.length > 0 ? prev.awards : (Array.isArray(profile.awards) ? profile.awards : []),
        links: Array.isArray(prev.links) && prev.links.length > 0 ? prev.links : (Array.isArray(profile.links) ? profile.links : []),
      }));
      // First-time candidates start with the resume onboarding flow. Profile
      // remains available for manual edits, but it is not a prerequisite for
      // the canonical resume -> review -> confirm journey.
      if (resumeList.length === 0) setSection('resumes');
      setSelectedResumeId((current) => current || resumeList.find((item) => item.is_current)?.document_id || resumeList[0]?.document_id || null);
    } catch (err: any) { setError(err?.message || 'Unable to load your candidate dashboard.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!applyJobId) return;
    let cancelled = false;
    void apiClient.getPublicJobById(applyJobId).then((job) => { if (!cancelled) setSelectedJob(job); }).catch((err: any) => { if (!cancelled) setError(err?.message || 'Unable to load the selected job.'); });
    return () => { cancelled = true; };
  }, [applyJobId]);

  useEffect(() => {
    if (!selectedResumeId) return;
    setParsedResume(null);
    setResumeStatus(null);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    let attempt = 0;
    const poll = async () => {
      if (Date.now() - startedAt >= 5 * 60 * 1000) {
        if (!cancelled) setError('Resume processing is taking longer than expected. Please refresh later.');
        return;
      }
      try {
        const status = await apiClient.getResumeStatus(selectedResumeId);
        if (cancelled) return;
        setResumeStatus(status);
        setResumes((prev) => prev.map((r) => r.document_id === selectedResumeId ? { ...r, stage: status.stage, security_scan_status: status.security_scan_status, processing_status: status.processing_status } : r));
        if (status.stage === 'REVIEW_READY' || status.stage === 'REVIEW_READY_PARTIAL') {
          const parsed = await apiClient.getParsedResume(selectedResumeId);
          if (!cancelled) {
            setParsedResume(parsed);
            const output = parsed?.normalized_output || {};
            // Only auto-fill from parsed data if form is empty (no previous auto-fill or user hasn't edited yet)
            setEditedFacts((prev) => {
              return {
                contact_info: output.contact_info || prev.contact_info || {},
                professional_title: output.professional_title || prev.professional_title || '',
                summary: output.summary || prev.summary || '',
                date_of_birth: output.date_of_birth || prev.date_of_birth || '',
                gender: output.gender || prev.gender || '',
                experience_years: output.experience_years ?? prev.experience_years ?? null,
                skills: Array.isArray(output.skills) && output.skills.length > 0 ? output.skills : prev.skills,
                experiences: (Array.isArray(output.experiences) && output.experiences.length > 0 ? output.experiences : prev.experiences || []).map((e: any) => ({
                  ...e,
                  responsibilities: Array.isArray(e.responsibilities) ? e.responsibilities.join('\n') : (typeof e.responsibilities === 'string' ? e.responsibilities : ''),
                  achievements: Array.isArray(e.achievements) ? e.achievements.join('\n') : (typeof e.achievements === 'string' ? e.achievements : ''),
                  skills: Array.isArray(e.skills) ? e.skills.join(', ') : (typeof e.skills === 'string' ? e.skills : ''),
                })),
                educations: Array.isArray(output.educations) && output.educations.length > 0 ? output.educations : prev.educations,
                certifications: Array.isArray(output.certifications) && output.certifications.length > 0 ? output.certifications : prev.certifications,
                projects: (Array.isArray(output.projects) && output.projects.length > 0 ? output.projects : prev.projects || []).map((p: any) => ({
                  ...p,
                  technologies: Array.isArray(p.technologies) ? p.technologies.join(', ') : (typeof p.technologies === 'string' ? p.technologies : ''),
                })),
                languages: Array.isArray(output.languages) && output.languages.length > 0 ? output.languages : prev.languages,
                awards: Array.isArray(output.awards) && output.awards.length > 0 ? output.awards : prev.awards,
                links: Array.isArray(output.links) && output.links.length > 0 ? output.links : prev.links,
              };
            });
            // First-time: auto-switch to profile tab with pre-filled data
            const freshProfile = await apiClient.getCandidateProfile();
            if (!cancelled && !freshProfile.profile?.profile_completed_at) {
              setCandidate(freshProfile);
              setSection('profile');
            }
          }
          return;
        }
        if (!['SECURITY_REJECTED', 'PARSING_FAILED'].includes(status.stage)) {
          const delay = Math.min(10000, 2000 * (2 ** Math.min(attempt, 3)));
          attempt += 1;
          timer = setTimeout(poll, delay);
        }
      } catch (err: any) { if (!cancelled) setError(err?.message || 'Unable to read resume status.'); }
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [selectedResumeId]);

  const updateEditedFacts = (path: string, value: unknown) => {
    setEditedFacts((prev) => {
      const next = { ...prev };
      const keys = path.split('.');
      let obj: any = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        obj[k] = typeof obj[k] === 'object' && obj[k] !== null ? { ...obj[k] } : {};
        obj = obj[k];
      }
      obj[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const updateArrayItem = (key: string, index: number, field: string, value: unknown) => {
    setEditedFacts((prev) => {
      const arr = [...((prev[key] as any[]) || [])];
      arr[index] = { ...arr[index], [field]: value };
      return { ...prev, [key]: arr };
    });
  };

  const addArrayItem = (key: string, template: Record<string, unknown>) => {
    setEditedFacts((prev) => ({ ...prev, [key]: [...((prev[key] as any[]) || []), { ...template }] }));
  };

  const removeArrayItem = (key: string, index: number) => {
    setEditedFacts((prev) => ({ ...prev, [key]: ((prev[key] as any[]) || []).filter((_, i) => i !== index) }));
  };

  // The API stores these columns with toJsonArray(), which turns any non-array into [].
  // The UI edits them as text, so both save paths must split before sending or the values are wiped.
  const toCommaArray = (value: unknown) => (typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value);
  const toLineArray = (value: unknown) => (typeof value === 'string' ? value.split('\n').map((s) => s.trim()).filter(Boolean) : value);

  // is_current is deliberately not sent: the field is no longer editable in the UI, and the API
  // derives it from a blank end_date. Sending the resume's stale value would make it uncorrectable.
  const toExperiencePayload = (items: any[]) => (items || []).map((item: any) => {
    const copy: Record<string, unknown> = { ...item };
    delete copy.is_current;
    copy.skills = toCommaArray(copy.skills);
    copy.responsibilities = toLineArray(copy.responsibilities);
    copy.achievements = toLineArray(copy.achievements);
    return copy;
  });

  const toProjectPayload = (items: any[]) => (items || []).map((item: any) => ({ ...item, technologies: toCommaArray(item?.technologies) }));

  const renderEditableSection = (title: string, key: string, items: any[], fields: { label: string; field: string; type?: string }[], template: Record<string, unknown>, confidence?: Record<string, number>) => {
    const rows = Array.isArray(items) ? items : [];
    const conf = confidence?.[title.toLowerCase()];
    return (
      <div className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">{title}</h4>
          <div className="flex items-center gap-2">
            {typeof conf === 'number' && <span className={`text-xs px-2 py-0.5 rounded-full ${conf >= 80 ? 'bg-emerald-100 text-emerald-700' : conf >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{conf}%</span>}
            <button type="button" onClick={() => addArrayItem(key, template)} className="text-xs text-indigo-600 hover:text-indigo-800">+ Add</button>
          </div>
        </div>
        <div className="space-y-2">
          {rows.length === 0 && <p className="text-xs text-slate-400">Nothing extracted — use + Add to fill this in.</p>}
          {rows.map((item: any, i: number) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded border border-slate-100 p-2">
              {fields.map(({ label, field, type }) => (
                <label key={field} className="flex flex-col gap-0.5">
                  <span className="text-xs text-slate-500">{label}</span>
                  {type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={item?.[field] ?? ''}
                      onChange={(e) => updateArrayItem(key, i, field, e.target.value)}
                      className="min-w-52 rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <input
                      type={type || 'text'}
                      value={item?.[field] ?? ''}
                      onChange={(e) => updateArrayItem(key, i, field, type === 'number' ? (e.target.value ? Number(e.target.value) : null) : e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm"
                    />
                  )}
                </label>
              ))}
              <button type="button" onClick={() => removeArrayItem(key, i)} className="text-xs text-rose-500 hover:text-rose-700 mb-0.5">Remove</button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderReview = () => {
    if (!parsedResume) return null;
    const confidence = (parsedResume.confidence_details?.fields ?? {}) as Record<string, number>;
    const ci = editedFacts.contact_info as Record<string, unknown> || {};
    return <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 p-3">
        <h4 className="text-sm font-medium mb-1">Contact Info</h4>
        <p className="text-xs text-slate-500 mb-2">Extracted for verification only — confirming your resume does not change your name, email or phone. Update those in account settings.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {['name', 'email', 'phone'].map((f) => (
            <div key={f} className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-500">{f}</span>
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700">{((ci[f] || (f === 'phone' ? (ci.phone_number || ci.mobile || ci.contact_number) : null)) as string) || '—'}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 p-3">
        <h4 className="text-sm font-medium mb-2">Professional Title</h4>
        <input type="text" value={(editedFacts.professional_title as string) || ''} onChange={(e) => updateEditedFacts('professional_title', e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </div>
      {renderEditableSection('skills', 'skills', editedFacts.skills as any[] || [], [{ label: 'Name', field: 'name' }, { label: 'Proficiency (1-10)', field: 'proficiency_level', type: 'number' }, { label: 'Years', field: 'years_of_experience', type: 'number' }], { name: '' }, confidence)}
      {renderEditableSection('experiences', 'experiences', editedFacts.experiences as any[] || [], [{ label: 'Company', field: 'company_name' }, { label: 'Title', field: 'job_title' }, { label: 'Start', field: 'start_date', type: 'date' }, { label: 'End (blank = current)', field: 'end_date', type: 'date' }, { label: 'Achievements (one per line)', field: 'achievements', type: 'textarea' }], { company_name: '', job_title: '', start_date: '', end_date: '' }, confidence)}
      {renderEditableSection('educations', 'educations', editedFacts.educations as any[] || [], [{ label: 'Institution', field: 'institution_name' }, { label: 'Degree', field: 'degree' }, { label: 'Field', field: 'field_of_study' }, { label: 'Start', field: 'start_date', type: 'date' }, { label: 'End', field: 'end_date', type: 'date' }], { institution_name: '', degree: '' }, confidence)}
      {renderEditableSection('certifications', 'certifications', editedFacts.certifications as any[] || [], [{ label: 'Name', field: 'name' }, { label: 'Issuer', field: 'issuer' }], { name: '' }, confidence)}
      {renderEditableSection('projects', 'projects', editedFacts.projects as any[] || [], [{ label: 'Title', field: 'title' }, { label: 'Description', field: 'description' }], { title: '' }, confidence)}
      {renderEditableSection('languages', 'languages', editedFacts.languages as any[] || [], [{ label: 'Language', field: 'language_name' }, { label: 'Proficiency', field: 'proficiency' }], { language_name: '' }, confidence)}
      {renderEditableSection('awards', 'awards', editedFacts.awards as any[] || [], [{ label: 'Title', field: 'title' }, { label: 'Issuer', field: 'issuer' }], { title: '' }, confidence)}
      {renderEditableSection('links', 'links', editedFacts.links as any[] || [], [{ label: 'URL', field: 'url' }, { label: 'Type', field: 'link_type' }, { label: 'Label', field: 'label' }], { url: '' }, confidence)}
      {parsedResume.overall_confidence != null && <div className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">Overall Confidence: <span className={parsedResume.overall_confidence >= 80 ? 'text-emerald-600' : parsedResume.overall_confidence >= 50 ? 'text-amber-600' : 'text-rose-600'}>{parsedResume.overall_confidence}%</span></p></div>}
    </div>;
  };

  const confirmParsedResume = async () => {
    if (!candidate || !selectedResumeId || !parsedResume) return;
    const profileKeys = ['professional_title', 'summary', 'current_location', 'city', 'state', 'country', 'postal_code', 'preferred_work_mode', 'willing_to_relocate', 'willing_to_travel', 'remote_experience', 'notice_period_days', 'expected_salary_min', 'expected_salary_max', 'work_authorization', 'visa_sponsorship_needed', 'is_open_to_work', 'available_from'];
    const profile = Object.fromEntries(profileKeys.filter((key) => editedFacts[key] !== undefined).map((key) => [key, editedFacts[key]]));
    const facts = Object.fromEntries(['skills', 'experiences', 'educations', 'certifications', 'projects', 'languages', 'awards', 'links']
      .filter((key) => Array.isArray(editedFacts[key]) && editedFacts[key].length > 0)
      .map((key) => [key, key === 'experiences'
        ? toExperiencePayload(editedFacts[key] as any[])
        : key === 'projects'
          ? toProjectPayload(editedFacts[key] as any[])
          : editedFacts[key]]));
    setConfirming(true); setError(null); setMessage(null);
    try {
      const result = await apiClient.confirmResume(selectedResumeId, { expected_profile_revision: candidate.profile.profile_revision, profile, facts });
      const skipped = Object.entries(result.skipped_facts || {}).filter(([, count]) => count > 0);
      setMessage(skipped.length
        ? `Resume confirmed, but ${skipped.reduce((total, [, count]) => total + count, 0)} row(s) were not saved because required fields were missing or invalid: ${skipped.map(([section, count]) => `${count} ${section}`).join(', ')}. Please add them from your profile.`
        : 'Resume review confirmed and candidate profile update queued.');
      await loadDashboard();
    }
    catch (err: any) { setError(err?.message || 'Resume confirmation failed.'); }
    finally { setConfirming(false); }
  };

  const submitApplication = async () => {
    if (!selectedJob || !selectedResumeId || !consent) { setError('Select a resume and provide consent before applying.'); return; }
    if (!resumeStatus || resumeStatus.security_scan_status !== 'clean' || !['REVIEW_READY', 'REVIEW_READY_PARTIAL'].includes(resumeStatus.stage)) { setError('This resume is not ready for application submission.'); return; }
    setSubmittingApplication(true); setError(null); setMessage(null);
    try {
      const answers = Object.entries(screeningAnswers).filter(([, answer]) => answer.trim()).map(([question_id, answer]) => ({ question_id, answer }));
      const result = await apiClient.applyToJob(selectedJob.id, { document_id: selectedResumeId, cover_letter: coverLetter || undefined, consent: true, answers_to_screening_questions: answers });
      setMessage(`Application submitted for ${selectedJob.title}. Application ID: ${result.application_id}`); setSection('applications'); await loadDashboard();
    } catch (err: any) { setError(err?.message || 'Application could not be submitted.'); }
    finally { setSubmittingApplication(false); }
  };

  const loadApplicationDetail = async (applicationId: string) => {
    setError(null);
    try {
      const [detail, history] = await Promise.all([apiClient.getMyApplication(applicationId), apiClient.getMyApplicationHistory(applicationId)]);
      setSelectedApplication(detail); setApplicationHistory(history);
    } catch (err: any) { setError(err?.message || 'Unable to load application details.'); }
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!candidate) return;
    const data = new FormData(event.currentTarget);
    const toNull = (v: string) => v.trim() || null;
    setSaving(true); setError(null); setMessage(null);
    try {
      const profilePayload = {
        expected_profile_revision: candidate.profile.profile_revision,
        professional_title: String(data.get('professional_title') || '') || null,
        summary: toNull(String(data.get('summary') || '')),
        current_location: toNull(String(data.get('current_location') || '')),
        city: toNull(String(data.get('city') || '')),
        state: toNull(String(data.get('state') || '')),
        country: toNull(String(data.get('country') || '')),
        postal_code: toNull(String(data.get('postal_code') || '')),
        preferred_work_mode: toNull(String(data.get('preferred_work_mode') || '')),
        notice_period_days: data.get('notice_period_days') ? Number(data.get('notice_period_days')) : null,
        expected_salary_min: data.get('expected_salary_min') ? Number(data.get('expected_salary_min')) : null,
        expected_salary_max: data.get('expected_salary_max') ? Number(data.get('expected_salary_max')) : null,
        salary_currency: String(data.get('salary_currency') || 'INR'),
        is_open_to_work: data.get('is_open_to_work') === 'on',
        willing_to_relocate: data.get('willing_to_relocate') === 'on',
        willing_to_travel: data.get('willing_to_travel') === 'on',
        remote_experience: data.get('remote_experience') === 'on',
        work_authorization: toNull(String(data.get('work_authorization') || '')),
        visa_sponsorship_needed: data.get('visa_sponsorship_needed') === 'on',
        available_from: toNull(String(data.get('available_from') || '')),
        date_of_birth: toNull(String(data.get('date_of_birth') || '')),
        gender: toNull(String(data.get('gender') || '')),
        nationality: toNull(String(data.get('nationality') || '')),
      };
      const profileResult = await apiClient.updateCandidateProfile(profilePayload);
      // Save all facts (skills, experiences, etc.) via the dedicated endpoint
      const factsPayload: Record<string, unknown> = { expected_profile_revision: profileResult.profile_revision };
      for (const key of ['skills', 'educations', 'certifications', 'languages', 'awards', 'links']) {
        if (Array.isArray(editedFacts[key])) factsPayload[key] = editedFacts[key];
      }
      // Experiences & projects: convert the UI's comma/newline-separated text into arrays
      if (Array.isArray(editedFacts.experiences)) factsPayload.experiences = toExperiencePayload(editedFacts.experiences as any[]);
      if (Array.isArray(editedFacts.projects)) factsPayload.projects = toProjectPayload(editedFacts.projects as any[]);
      const factsResult = await apiClient.updateCandidateFacts(factsPayload as any);
      // If first-time and parsedResume exists, also confirm the resume document
      if (parsedResume && selectedResumeId) {
        await apiClient.confirmResume(selectedResumeId, { expected_profile_revision: factsResult.profile_revision, profile: {}, facts: {} }).catch(() => {});
      }
      setMessage(`Profile saved. Revision ${factsResult.profile_revision}.`); await loadDashboard();
    } catch (err: any) { setError(err?.message || 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  const uploadResume = async () => {
    if (!file) return; setUploading(true); setError(null); setMessage(null); setParsedResume(null); setEditedFacts({}); setResumeStatus(null);
    try {
      const result = await apiClient.uploadResume(file, useAsActive);
      setFile(null);
      if (result.reused) {
        setMessage('This resume was already uploaded. Showing existing data.');
        setSelectedResumeId(result.document_id);
      } else {
        setMessage('New resume uploaded. Security scanning and parsing in progress.');
        setSelectedResumeId(result.document_id);
      }
      await loadDashboard();
    }
    catch (err: any) {
      if (err?.message?.includes('MAX_RESUMES_REACHED')) {
        setError('You have reached the maximum limit of 5 resumes. Please delete an existing resume before uploading a new one.');
      } else {
        setError(err?.message || 'Resume upload failed.');
      }
    }
    finally { setUploading(false); }
  };

  const deleteResume = async (documentId: string, isCurrent: boolean, securityStatus: string) => {
    const infected = securityStatus === 'infected' || securityStatus === 'quarantined';
    if (isCurrent && !infected) { setError('Cannot delete the active resume. Please set another resume as active first.'); return; }
    if (!confirm('Are you sure you want to delete this resume? This action cannot be undone.')) return;
    setError(null); setMessage(null);
    try {
      await apiClient.deleteResume(documentId);
      setMessage('Resume deleted successfully.');
      if (selectedResumeId === documentId) { setSelectedResumeId(null); setParsedResume(null); setEditedFacts({}); setResumeStatus(null); }
      await loadDashboard();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT_DELETE_ACTIVE_RESUME')) {
        setError('Cannot delete the active resume. Please set another resume as active first.');
      } else {
        setError(err?.message || 'Failed to delete resume.');
      }
    }
  };

  const isInfected = (securityStatus: string) => securityStatus === 'infected' || securityStatus === 'quarantined';

  return <RoleGuard allowedRoles={['candidate']}>
    <main className="flex-1 bg-slate-50 p-4 dark:bg-slate-950 md:p-8"><div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800"><div><h1 className="text-3xl font-bold tracking-tight">Candidate Portal</h1><p className="text-sm text-slate-500">Welcome {user?.email || 'candidate'} — manage your profile, resumes and applications.</p></div><Button variant="outline" onClick={logout} data-testid="logout-button">Sign Out</Button></header>
      {applyJobId && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800" data-testid="apply-context">You are applying for job <code>{applyJobId}</code>. Select a clean resume below to continue.</div>}
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{message}</div>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert"><span>{error}</span><Button size="sm" variant="outline" className="ml-3" onClick={() => void loadDashboard()}>Retry</Button></div>}
      <nav className="flex flex-wrap gap-2" aria-label="Candidate sections">{(['overview', 'profile', 'resumes', 'applications'] as Section[]).map((item) => {
        const profileLocked = item === 'profile' && resumes.length === 0;
        const label = item[0].toUpperCase() + item.slice(1);
        return profileLocked ? <span key={item} title="Upload a resume to enable your profile" className="cursor-not-allowed"><Button variant="outline" disabled aria-disabled="true">{label}</Button></span> : <Button key={item} variant={section === item ? 'primary' : 'outline'} onClick={() => setSection(item)}>{label}</Button>;
      })}</nav>
      {loading ? <Card><CardContent className="py-10 text-center text-slate-500">Loading candidate dashboard…</CardContent></Card> : candidate && <>
        {section === 'overview' && <div className="space-y-4"><Card><CardHeader><CardTitle>Profile</CardTitle><CardDescription>Revision {candidate.profile.profile_revision}</CardDescription></CardHeader><CardContent><p className="font-medium">{candidate.profile.professional_title || 'Add a professional title'}</p><p className="text-sm text-slate-500">{candidate.profile.summary || 'Complete your profile to improve applications.'}</p></CardContent></Card><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Resumes</CardTitle><CardDescription>{resumes.length} uploaded</CardDescription></CardHeader><CardContent><p className="text-sm">{resumes.some((resume) => resume.is_current) ? 'Active resume selected' : 'Your resume is the starting point'}</p>{resumes.length === 0 && <Button className="mt-3" onClick={() => setSection('resumes')}>Upload your first resume</Button>}</CardContent></Card><Card><CardHeader><CardTitle>Applications</CardTitle><CardDescription>{applications.length} submitted</CardDescription></CardHeader><CardContent><p className="text-sm">Track your application status here.</p></CardContent></Card></div></div>}
        {section === 'profile' && <Card><CardHeader><CardTitle>Candidate Profile</CardTitle><CardDescription>{parsedResume ? 'Your resume has been parsed. Review and edit the pre-filled data below, then save.' : 'Manual edits are always available.'}</CardDescription></CardHeader><CardContent><form key={parsedResume ? `prefill-${JSON.stringify(editedFacts.professional_title)}` : 'empty'} className="grid gap-4 md:grid-cols-2" onSubmit={saveProfile}>
          <label className="text-sm">Professional title<Input name="professional_title" defaultValue={(editedFacts.professional_title as string) || candidate.profile.professional_title || ''} /></label>
          <label className="text-sm">Phone number<Input name="phone" defaultValue={(editedFacts.contact_info as any)?.phone || (editedFacts.contact_info as any)?.phone_number || (editedFacts.contact_info as any)?.mobile || ''} placeholder="Extracted phone number" onChange={(e) => updateEditedFacts('contact_info.phone', e.target.value)} /></label>
          <label className="text-sm">Current location<Input name="current_location" defaultValue={(editedFacts.contact_info as any)?.address || (editedFacts.contact_info as any)?.location || candidate.profile.current_location || ''} /></label>
          <label className="text-sm">City<Input name="city" defaultValue={(editedFacts.contact_info as any)?.city || candidate.profile.city || ''} /></label>
          <label className="text-sm">State<Input name="state" defaultValue={(editedFacts.contact_info as any)?.state || candidate.profile.state || ''} /></label>
          <label className="text-sm">Country<Input name="country" defaultValue={(editedFacts.contact_info as any)?.country || candidate.profile.country || ''} /></label>
          <label className="text-sm">Postal code<Input name="postal_code" defaultValue={(editedFacts.contact_info as any)?.postal_code || candidate.profile.postal_code || ''} /></label>
          <label className="text-sm">Total experience (years)<Input type="number" step="0.1" name="experience_years" defaultValue={(editedFacts.experience_years as any) ?? candidate.profile.total_experience_years ?? ''} placeholder="e.g. 5.5" onChange={(e) => updateEditedFacts('experience_years', e.target.value ? Number(e.target.value) : null)} /></label>
          <label className="text-sm md:col-span-2">Summary<textarea name="summary" defaultValue={(editedFacts.summary as string) || candidate.profile.summary || ''} className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
          <label className="text-sm">Date of birth<Input type="date" name="date_of_birth" defaultValue={(editedFacts.date_of_birth as string) || candidate.profile.date_of_birth || ''} /></label>
          <label className="text-sm">Gender<select name="gender" defaultValue={(editedFacts.gender as string) || candidate.profile.gender || ''} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
          <label className="text-sm">Nationality<Input name="nationality" defaultValue={candidate.profile.nationality || ''} /></label>
          <label className="text-sm">Preferred work mode<select name="preferred_work_mode" defaultValue={candidate.profile.preferred_work_mode || ''} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Select</option><option value="onsite">On-site</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select></label>
          <label className="text-sm">Work authorization<Input name="work_authorization" defaultValue={candidate.profile.work_authorization || ''} placeholder="e.g. US Citizen, H1B, OPT" /></label>
          <label className="text-sm">Available from<Input type="date" name="available_from" defaultValue={candidate.profile.available_from || ''} /></label>
          <label className="text-sm">Notice period (days)<Input type="number" min="0" name="notice_period_days" defaultValue={candidate.profile.notice_period_days ?? ''} /></label>
          <label className="text-sm">Expected salary minimum<Input type="number" min="0" name="expected_salary_min" defaultValue={candidate.profile.expected_salary_min ?? ''} /></label>
          <label className="text-sm">Expected salary maximum<Input type="number" min="0" name="expected_salary_max" defaultValue={candidate.profile.expected_salary_max ?? ''} /></label>
          <label className="text-sm">Salary currency<select name="salary_currency" defaultValue={candidate.profile.salary_currency || 'INR'} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option></select></label>
          <div className="md:col-span-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="is_open_to_work" defaultChecked={candidate.profile.is_open_to_work} /> Open to work</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="willing_to_relocate" defaultChecked={candidate.profile.willing_to_relocate} /> Willing to relocate</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="willing_to_travel" defaultChecked={candidate.profile.willing_to_travel} /> Willing to travel</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="remote_experience" defaultChecked={candidate.profile.remote_experience} /> Remote experience</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="visa_sponsorship_needed" defaultChecked={candidate.profile.visa_sponsorship_needed} /> Visa sponsorship needed</label>
          </div>
          {parsedResume && <div className="md:col-span-2">
            <p className="text-sm font-medium text-slate-500 mb-2">The sections below were pre-filled from your resume. Edit them before saving, or save as-is.</p>
          </div>}
          <div className="md:col-span-2 space-y-4">
            {renderEditableSection('Skills', 'skills', (editedFacts.skills as any[]) || [], [{ label: 'Name', field: 'name' }, { label: 'Proficiency (1-10)', field: 'proficiency_level', type: 'number' }, { label: 'Years', field: 'years_of_experience', type: 'number' }], { name: '' })}
            {renderEditableSection('Experience', 'experiences', (editedFacts.experiences as any[]) || [], [{ label: 'Company', field: 'company_name' }, { label: 'Title', field: 'job_title' }, { label: 'Employment Type', field: 'employment_type' }, { label: 'Location', field: 'location' }, { label: 'Start', field: 'start_date', type: 'date' }, { label: 'End (blank = current)', field: 'end_date', type: 'date' }, { label: 'Description', field: 'description', type: 'textarea' }, { label: 'Responsibilities (one per line)', field: 'responsibilities', type: 'textarea' }, { label: 'Achievements (one per line)', field: 'achievements', type: 'textarea' }, { label: 'Skills (comma-separated)', field: 'skills' }], { company_name: '', job_title: '', start_date: '' })}
            {renderEditableSection('Education', 'educations', (editedFacts.educations as any[]) || [], [{ label: 'Institution', field: 'institution_name' }, { label: 'Degree', field: 'degree' }, { label: 'Field of Study', field: 'field_of_study' }, { label: 'Start', field: 'start_date', type: 'date' }, { label: 'End', field: 'end_date', type: 'date' }, { label: 'Grade', field: 'grade' }, { label: 'Description', field: 'description' }], { institution_name: '', degree: '' })}
            {renderEditableSection('Certifications', 'certifications', (editedFacts.certifications as any[]) || [], [{ label: 'Name', field: 'name' }, { label: 'Issuer', field: 'issuer' }, { label: 'Credential ID', field: 'credential_id' }, { label: 'Credential URL', field: 'credential_url' }, { label: 'Issued', field: 'issued_at', type: 'date' }, { label: 'Expires', field: 'expires_at', type: 'date' }], { name: '' })}
            {renderEditableSection('Projects', 'projects', (editedFacts.projects as any[]) || [], [{ label: 'Title', field: 'title' }, { label: 'Description', field: 'description' }, { label: 'Project URL', field: 'project_url' }, { label: 'Technologies (comma-separated)', field: 'technologies' }, { label: 'Start', field: 'started_at', type: 'date' }, { label: 'End', field: 'completed_at', type: 'date' }], { title: '' })}
            {renderEditableSection('Languages', 'languages', (editedFacts.languages as any[]) || [], [{ label: 'Language', field: 'language_name' }, { label: 'Proficiency', field: 'proficiency' }], { language_name: '' })}
            {renderEditableSection('Awards', 'awards', (editedFacts.awards as any[]) || [], [{ label: 'Title', field: 'title' }, { label: 'Issuer', field: 'issuer' }, { label: 'Date', field: 'awarded_at', type: 'date' }, { label: 'Description', field: 'description' }], { title: '' })}
            {renderEditableSection('Links', 'links', (editedFacts.links as any[]) || [], [{ label: 'URL', field: 'url' }, { label: 'Type', field: 'link_type' }, { label: 'Label', field: 'label' }], { url: '' })}
          </div>
          <div className="md:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : parsedResume ? 'Save Profile & Confirm Resume' : 'Save Profile'}</Button></div>
        </form></CardContent></Card>}
        {section === 'resumes' && <Card><CardHeader><CardTitle>Resume Center</CardTitle><CardDescription>Upload, monitor and review your resume.</CardDescription></CardHeader><CardContent className="space-y-5">{resumes.length >= 5 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">You have reached the maximum limit of 5 resumes. Please delete an existing resume before uploading a new one.</div> : <div className="flex flex-wrap items-center gap-3"><Input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFile(event.target.files?.[0] || null); if (resumes.length === 0) setUseAsActive(true); }} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useAsActive} disabled={resumes.length === 0} onChange={(event) => setUseAsActive(event.target.checked)} /> Set as active resume</label><Button onClick={() => void uploadResume()} disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload Resume'}</Button></div>}{resumes.length === 0 ? <p className="text-sm text-slate-500">No resumes uploaded yet.</p> : <div className="space-y-3">{resumes.map((resume) => <div role="button" tabIndex={0} key={resume.document_id} onKeyDown={(e) => { if (e.key === 'Enter' && !isInfected(resume.security_scan_status)) { setSelectedResumeId(resume.document_id); setParsedResume(null); } }} className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left ${isInfected(resume.security_scan_status) ? 'cursor-not-allowed border-rose-200 bg-rose-50 opacity-60' : 'cursor-pointer'} ${selectedResumeId === resume.document_id && !isInfected(resume.security_scan_status) ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`} onClick={isInfected(resume.security_scan_status) ? undefined : () => { setSelectedResumeId(resume.document_id); setParsedResume(null); }}><div><p className="font-medium">Resume v{resume.version_number} {resume.is_current && <Badge variant="primary" className="ml-2">Current</Badge>}</p>          {isInfected(resume.security_scan_status) ? <p className="text-xs text-rose-600 font-medium">⚠ This document contains a threat and cannot be used. Please delete it.</p> : <p className={`text-xs font-medium ${STAGE_LABELS[resume.stage]?.color || 'text-slate-500'}`}>{STAGE_LABELS[resume.stage]?.label || resume.stage}</p>}</div><div className="flex items-center gap-3"><span className="text-xs text-indigo-600">View status</span><button type="button" onClick={(e) => { e.stopPropagation(); void deleteResume(resume.document_id, resume.is_current, resume.security_scan_status); }} className={`text-xs ${(resume.is_current && !isInfected(resume.security_scan_status)) ? 'cursor-not-allowed text-slate-400' : 'text-rose-600 hover:text-rose-800'}`} disabled={resume.is_current && !isInfected(resume.security_scan_status)}>Delete</button></div></div>)}</div>}{resumeStatus && selectedResumeId && <div className="rounded-lg border bg-slate-50 p-4"><p className="font-medium">Selected resume status: {resumeStatus.stage}</p><p className="text-sm text-slate-500">Scan: {resumeStatus.security_scan_status} · Processing: {resumeStatus.processing_status || 'not started'}</p>{parsedResume && <div className="mt-4 space-y-3"><div className="text-sm font-medium mb-2">Review extracted data</div>{renderReview()}<Button onClick={() => void confirmParsedResume()} disabled={confirming}>{confirming ? 'Confirming…' : 'Confirm Resume Data'}</Button></div>}</div>}</CardContent></Card>}
        {section === 'applications' && <Card><CardHeader><CardTitle>My Applications</CardTitle><CardDescription>View submitted applications and their current status.</CardDescription></CardHeader><CardContent>{applications.length === 0 ? <p className="text-sm text-slate-500">No applications submitted yet.</p> : <div className="space-y-3">{applications.map((application) => <button type="button" key={application.application_id} onClick={() => void loadApplicationDetail(application.application_id)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left"><div><p className="font-medium">{application.job_title}</p><p className="text-xs text-slate-500">Applied {new Date(application.applied_at).toLocaleDateString()}</p></div><Badge>{application.status}</Badge></button>)}</div>}{selectedApplication && <div className="mt-5 rounded-lg border bg-slate-50 p-4"><p className="font-medium">Application timeline</p><p className="text-sm text-slate-600">{selectedApplication.job_title} · {selectedApplication.status}</p><div className="mt-3 space-y-2">{applicationHistory.map((item) => <div key={item.id} className="text-sm"><span className="font-medium">{item.to_status}</span> · {new Date(item.created_at).toLocaleString()} {item.change_reason && <span className="text-slate-500">({item.change_reason})</span>}</div>)}</div></div>}</CardContent></Card>}
        {applyJobId && selectedJob && section === 'resumes' && <Card><CardHeader><CardTitle>Apply for {selectedJob.title}</CardTitle><CardDescription>Select a ready resume, answer required questions, add an optional cover letter and provide consent.</CardDescription></CardHeader><CardContent className="space-y-4">{Array.isArray(selectedJob.screening_questions) && selectedJob.screening_questions.map((raw, index) => { const question = raw as { question?: string; required?: boolean; type?: string }; return <label key={`q_${index}`} className="block text-sm">{question.question || `Screening question ${index + 1}`}{question.required && <span className="text-rose-600"> *</span>}<Input value={screeningAnswers[`q_${index}`] || ''} onChange={(event) => setScreeningAnswers((current) => ({ ...current, [`q_${index}`]: event.target.value }))} placeholder={question.type === 'number' ? 'Enter a number' : 'Your answer'} /></label>; })}<textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="Optional cover letter" className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I consent to share this profile and resume for this application.</label><Button onClick={() => void submitApplication()} disabled={submittingApplication}>{submittingApplication ? 'Submitting…' : 'Submit Application'}</Button></CardContent></Card>}
      </>}
    </div></main>
  </RoleGuard>;
}

export default function CandidateDashboardPage() {
  return <Suspense fallback={<main className="flex-1 p-8 text-center text-slate-500">Loading candidate portal…</main>}><CandidateDashboardContent /></Suspense>;
}
