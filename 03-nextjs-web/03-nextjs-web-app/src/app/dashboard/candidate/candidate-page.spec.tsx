import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CandidateDashboardPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiClient } from '@/lib/api-client';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('apply=job-1'),
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/context/auth-context', () => ({ useAuth: jest.fn() }));
jest.mock('@/lib/api-client', () => ({ apiClient: {
  getCandidateProfile: jest.fn(), listCandidateResumes: jest.fn(), getMyApplications: jest.fn(),
  getPublicJobById: jest.fn(), getResumeStatus: jest.fn(), getParsedResume: jest.fn(),
  uploadResume: jest.fn(), updateCandidateProfile: jest.fn(), confirmResume: jest.fn(),
  applyToJob: jest.fn(),
} }));

const profile = { profile: { id: 'candidate-1', professional_title: 'Engineer', summary: 'Builds systems', current_location: 'Delhi', city: 'Delhi', state: null, country: 'India', postal_code: null, preferred_work_mode: 'remote', willing_to_relocate: false, willing_to_travel: false, remote_experience: true, notice_period_days: 30, expected_salary_min: null, expected_salary_max: null, salary_currency: 'INR', work_authorization: null, visa_sponsorship_needed: false, is_open_to_work: true, available_from: null, profile_revision: 2, profile_completed_at: null }, links: [], skills: [], experiences: [], educations: [], certifications: [], projects: [], languages: [], awards: [] };

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'candidate-1', email: 'candidate@example.com', role: 'candidate', status: 'active' }, logout: jest.fn(), loading: false });
  (apiClient.getCandidateProfile as jest.Mock).mockResolvedValue(profile);
  (apiClient.listCandidateResumes as jest.Mock).mockResolvedValue([{ document_id: 'doc-1', document_role: 'resume', version_number: 1, is_current: true, uploaded_at: '2026-09-01', updated_at: '2026-09-01', security_scan_status: 'clean', processing_status: 'completed', stage: 'REVIEW_READY', retryable: false }]);
  (apiClient.getMyApplications as jest.Mock).mockResolvedValue([]);
  (apiClient.getPublicJobById as jest.Mock).mockResolvedValue({ id: 'job-1', title: 'Backend Engineer', status: 'published', screening_questions: [{ question: 'Why this role?', required: true, type: 'text' }] });
  (apiClient.getResumeStatus as jest.Mock).mockResolvedValue({ document_id: 'doc-1', security_scan_status: 'clean', processing_status: 'completed', stage: 'REVIEW_READY', retryable: false });
  (apiClient.getParsedResume as jest.Mock).mockResolvedValue({ document_id: 'doc-1', parsing_job_id: 'parse-1', schema_version: 'resume.v1', overall_confidence: 0.92, confidence_details: {}, validation_result: {}, normalized_output: { headline: 'Engineer' }, partial: false, created_at: '2026-09-01' });
});

describe('Candidate dashboard', () => {
  it('loads profile, resume and apply context', async () => {
    render(<CandidateDashboardPage />);
    expect(await screen.findByText('Candidate Portal')).toBeInTheDocument();
    expect(screen.getByTestId('apply-context')).toHaveTextContent('job-1');
    fireEvent.click(screen.getByRole('button', { name: 'Resumes' }));
    expect(await screen.findByText('Resume v1')).toBeInTheDocument();
  });

  it('renders profile editor and resume screening question', async () => {
    render(<CandidateDashboardPage />);
    expect(await screen.findByText('Resume v1')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Profile' }));
    expect(screen.getByDisplayValue('Engineer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resumes' }));
    expect(await screen.findByText('Why this role?')).toBeInTheDocument();
  });

  it('submits consent and screening answer with a ready resume', async () => {
    (apiClient.applyToJob as jest.Mock).mockResolvedValue({ application_id: 'app-1', job_id: 'job-1', status: 'applied', applied_at: '2026-09-09', job_title: 'Backend Engineer' });
    render(<CandidateDashboardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resumes' }));
    expect(await screen.findByText('Selected resume status: REVIEW_READY')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Your answer'), { target: { value: 'I enjoy backend systems.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit Application' }));
    await waitFor(() => expect(apiClient.applyToJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ document_id: 'doc-1', consent: true, answers_to_screening_questions: [{ question_id: 'q_0', answer: 'I enjoy backend systems.' }] })));
  });

  it('locks profile editing until the first resume is uploaded', async () => {
    (apiClient.listCandidateResumes as jest.Mock).mockResolvedValue([]);
    render(<CandidateDashboardPage />);
    const profileButton = await screen.findByRole('button', { name: 'Profile' });
    expect(profileButton).toBeDisabled();
    expect(profileButton.parentElement).toHaveAttribute('title', 'Upload a resume to enable your profile');
    expect(await screen.findByRole('button', { name: 'Upload Resume' })).toBeInTheDocument();
  });
});
