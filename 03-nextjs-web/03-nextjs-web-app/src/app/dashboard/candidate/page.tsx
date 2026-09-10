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
  const [reviewJson, setReviewJson] = useState('');
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
    setReviewJson('');
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
          if (!cancelled) { setParsedResume(parsed); setReviewJson(JSON.stringify(parsed.normalized_output, null, 2)); }
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

  const confirmParsedResume = async () => {
    if (!candidate || !selectedResumeId) return;
    let normalized: Record<string, unknown>;
    try { normalized = JSON.parse(reviewJson) as Record<string, unknown>; }
    catch { setError('Review data must be valid JSON before confirmation.'); return; }
    const profileKeys = ['professional_title', 'summary', 'current_location', 'city', 'state', 'country', 'postal_code', 'preferred_work_mode', 'willing_to_relocate', 'willing_to_travel', 'remote_experience', 'notice_period_days', 'expected_salary_min', 'expected_salary_max', 'work_authorization', 'visa_sponsorship_needed', 'is_open_to_work', 'available_from'];
    const profile = Object.fromEntries(profileKeys.filter((key) => Object.prototype.hasOwnProperty.call(normalized, key)).map((key) => [key, normalized[key]]));
    const facts = Object.fromEntries(['skills', 'experiences', 'educations', 'certifications', 'projects', 'languages', 'awards', 'links'].filter((key) => Object.prototype.hasOwnProperty.call(normalized, key)).map((key) => [key, normalized[key]]));
    setConfirming(true); setError(null); setMessage(null);
    try { await apiClient.confirmResume(selectedResumeId, { expected_profile_revision: candidate.profile.profile_revision, profile, facts }); setMessage('Resume review confirmed and candidate profile update queued.'); await loadDashboard(); }
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
    setSaving(true); setError(null); setMessage(null);
    try {
      const result = await apiClient.updateCandidateProfile({
        expected_profile_revision: candidate.profile.profile_revision,
        professional_title: String(data.get('professional_title') || ''),
        summary: String(data.get('summary') || ''),
        current_location: String(data.get('current_location') || ''),
        city: String(data.get('city') || '') || null,
        state: String(data.get('state') || '') || null,
        country: String(data.get('country') || '') || null,
        postal_code: String(data.get('postal_code') || '') || null,
        preferred_work_mode: String(data.get('preferred_work_mode') || '') || null,
        notice_period_days: data.get('notice_period_days') ? Number(data.get('notice_period_days')) : null,
        expected_salary_min: data.get('expected_salary_min') ? Number(data.get('expected_salary_min')) : null,
        expected_salary_max: data.get('expected_salary_max') ? Number(data.get('expected_salary_max')) : null,
        salary_currency: String(data.get('salary_currency') || 'INR'),
        is_open_to_work: data.get('is_open_to_work') === 'on',
        willing_to_relocate: data.get('willing_to_relocate') === 'on',
        willing_to_travel: data.get('willing_to_travel') === 'on',
        remote_experience: data.get('remote_experience') === 'on',
        work_authorization: String(data.get('work_authorization') || '') || null,
        visa_sponsorship_needed: data.get('visa_sponsorship_needed') === 'on',
        available_from: String(data.get('available_from') || '') || null,
        date_of_birth: String(data.get('date_of_birth') || '') || null,
        gender: String(data.get('gender') || '') || null,
        nationality: String(data.get('nationality') || '') || null,
      });
      setMessage(`Profile saved. Revision ${result.profile_revision}.`); await loadDashboard();
    } catch (err: any) { setError(err?.message || 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  const uploadResume = async () => {
    if (!file) return; setUploading(true); setError(null); setMessage(null); setParsedResume(null); setReviewJson(''); setResumeStatus(null);
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

  const deleteResume = async (documentId: string, isCurrent: boolean) => {
    if (isCurrent) { setError('Cannot delete the active resume. Please set another resume as active first.'); return; }
    if (!confirm('Are you sure you want to delete this resume? This action cannot be undone.')) return;
    setError(null); setMessage(null);
    try {
      await apiClient.deleteResume(documentId);
      setMessage('Resume deleted successfully.');
      if (selectedResumeId === documentId) { setSelectedResumeId(null); setParsedResume(null); setReviewJson(''); setResumeStatus(null); }
      await loadDashboard();
    } catch (err: any) {
      if (err?.message?.includes('CANNOT_DELETE_ACTIVE_RESUME')) {
        setError('Cannot delete the active resume. Please set another resume as active first.');
      } else {
        setError(err?.message || 'Failed to delete resume.');
      }
    }
  };

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
        {section === 'profile' && <Card><CardHeader><CardTitle>Candidate Profile</CardTitle><CardDescription>First time here? Upload your resume first. After review and confirmation, parsed details can update this profile. Manual edits are always available.</CardDescription></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={saveProfile}>
          <label className="text-sm">Professional title<Input name="professional_title" defaultValue={candidate.profile.professional_title || ''} /></label>
          <label className="text-sm">Current location<Input name="current_location" defaultValue={candidate.profile.current_location || ''} /></label>
          <label className="text-sm">City<Input name="city" defaultValue={candidate.profile.city || ''} /></label>
          <label className="text-sm">State<Input name="state" defaultValue={candidate.profile.state || ''} /></label>
          <label className="text-sm">Country<Input name="country" defaultValue={candidate.profile.country || ''} /></label>
          <label className="text-sm">Postal code<Input name="postal_code" defaultValue={candidate.profile.postal_code || ''} /></label>
          <label className="text-sm md:col-span-2">Summary<textarea name="summary" defaultValue={candidate.profile.summary || ''} className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label>
          <label className="text-sm">Date of birth<Input type="date" name="date_of_birth" defaultValue={candidate.profile.date_of_birth || ''} /></label>
          <label className="text-sm">Gender<select name="gender" defaultValue={candidate.profile.gender || ''} className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
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
          <div className="md:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</Button></div>
        </form></CardContent></Card>}
        {section === 'resumes' && <Card><CardHeader><CardTitle>Resume Center</CardTitle><CardDescription>Upload, monitor and review your resume.</CardDescription></CardHeader><CardContent className="space-y-5">{resumes.length >= 5 ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">You have reached the maximum limit of 5 resumes. Please delete an existing resume before uploading a new one.</div> : <div className="flex flex-wrap items-center gap-3"><Input type="file" accept=".pdf,.doc,.docx,application/pdf" onChange={(event) => { setFile(event.target.files?.[0] || null); if (resumes.length === 0) setUseAsActive(true); }} /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={useAsActive} disabled={resumes.length === 0} onChange={(event) => setUseAsActive(event.target.checked)} /> Set as active resume</label><Button onClick={() => void uploadResume()} disabled={!file || uploading}>{uploading ? 'Uploading…' : 'Upload Resume'}</Button></div>}{resumes.length === 0 ? <p className="text-sm text-slate-500">No resumes uploaded yet.</p> : <div className="space-y-3">{resumes.map((resume) => <div role="button" tabIndex={0} key={resume.document_id} onClick={() => { setSelectedResumeId(resume.document_id); setParsedResume(null); }} onKeyDown={(e) => { if (e.key === 'Enter') { setSelectedResumeId(resume.document_id); setParsedResume(null); } }} className={`flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-left ${selectedResumeId === resume.document_id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}><div><p className="font-medium">Resume v{resume.version_number} {resume.is_current && <Badge variant="primary" className="ml-2">Current</Badge>}</p><p className="text-xs text-slate-500">{resume.stage} · {resume.security_scan_status}</p></div><div className="flex items-center gap-3"><span className="text-xs text-indigo-600">View status</span><button type="button" onClick={(e) => { e.stopPropagation(); void deleteResume(resume.document_id, resume.is_current); }} className={`text-xs ${resume.is_current ? 'cursor-not-allowed text-slate-400' : 'text-rose-600 hover:text-rose-800'}`} disabled={resume.is_current}>Delete</button></div></div>)}</div>}{resumeStatus && selectedResumeId && <div className="rounded-lg border bg-slate-50 p-4"><p className="font-medium">Selected resume status: {resumeStatus.stage}</p><p className="text-sm text-slate-500">Scan: {resumeStatus.security_scan_status} · Processing: {resumeStatus.processing_status || 'not started'}</p>{parsedResume && <div className="mt-4 space-y-3"><label className="block text-sm font-medium">Review parsed candidate data<textarea value={reviewJson} onChange={(event) => setReviewJson(event.target.value)} className="mt-1 min-h-48 w-full rounded-lg border border-slate-300 p-3 font-mono text-xs" /></label><Button onClick={() => void confirmParsedResume()} disabled={confirming}>{confirming ? 'Confirming…' : 'Confirm Resume Data'}</Button></div>}</div>}</CardContent></Card>}
        {section === 'applications' && <Card><CardHeader><CardTitle>My Applications</CardTitle><CardDescription>View submitted applications and their current status.</CardDescription></CardHeader><CardContent>{applications.length === 0 ? <p className="text-sm text-slate-500">No applications submitted yet.</p> : <div className="space-y-3">{applications.map((application) => <button type="button" key={application.application_id} onClick={() => void loadApplicationDetail(application.application_id)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left"><div><p className="font-medium">{application.job_title}</p><p className="text-xs text-slate-500">Applied {new Date(application.applied_at).toLocaleDateString()}</p></div><Badge>{application.status}</Badge></button>)}</div>}{selectedApplication && <div className="mt-5 rounded-lg border bg-slate-50 p-4"><p className="font-medium">Application timeline</p><p className="text-sm text-slate-600">{selectedApplication.job_title} · {selectedApplication.status}</p><div className="mt-3 space-y-2">{applicationHistory.map((item) => <div key={item.id} className="text-sm"><span className="font-medium">{item.to_status}</span> · {new Date(item.created_at).toLocaleString()} {item.change_reason && <span className="text-slate-500">({item.change_reason})</span>}</div>)}</div></div>}</CardContent></Card>}
        {applyJobId && selectedJob && section === 'resumes' && <Card><CardHeader><CardTitle>Apply for {selectedJob.title}</CardTitle><CardDescription>Select a ready resume, answer required questions, add an optional cover letter and provide consent.</CardDescription></CardHeader><CardContent className="space-y-4">{Array.isArray(selectedJob.screening_questions) && selectedJob.screening_questions.map((raw, index) => { const question = raw as { question?: string; required?: boolean; type?: string }; return <label key={`q_${index}`} className="block text-sm">{question.question || `Screening question ${index + 1}`}{question.required && <span className="text-rose-600"> *</span>}<Input value={screeningAnswers[`q_${index}`] || ''} onChange={(event) => setScreeningAnswers((current) => ({ ...current, [`q_${index}`]: event.target.value }))} placeholder={question.type === 'number' ? 'Enter a number' : 'Your answer'} /></label>; })}<textarea value={coverLetter} onChange={(event) => setCoverLetter(event.target.value)} placeholder="Optional cover letter" className="min-h-28 w-full rounded-lg border border-slate-300 p-3 text-sm" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> I consent to share this profile and resume for this application.</label><Button onClick={() => void submitApplication()} disabled={submittingApplication}>{submittingApplication ? 'Submitting…' : 'Submit Application'}</Button></CardContent></Card>}
      </>}
    </div></main>
  </RoleGuard>;
}

export default function CandidateDashboardPage() {
  return <Suspense fallback={<main className="flex-1 p-8 text-center text-slate-500">Loading candidate portal…</main>}><CandidateDashboardContent /></Suspense>;
}
