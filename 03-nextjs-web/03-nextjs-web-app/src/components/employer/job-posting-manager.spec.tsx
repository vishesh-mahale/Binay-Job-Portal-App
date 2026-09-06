import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { JobPostingManager } from './job-posting-manager';
import { apiClient } from '@/lib/api-client';
import type { Job, CompanySettings } from '@/types/jobs';

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    listCompanyJobs: jest.fn(),
    getCompanySettings: jest.fn(),
    updateCompanySettings: jest.fn(),
    listJobCategories: jest.fn(),
    listSkills: jest.fn(),
    listCities: jest.fn(),
    createJob: jest.fn(),
    updateJob: jest.fn(),
    publishJob: jest.fn(),
    submitJobForApproval: jest.fn(),
    approveJob: jest.fn(),
    rejectJob: jest.fn(),
    pauseJob: jest.fn(),
    resumeJob: jest.fn(),
    closeJob: jest.fn(),
    archiveJob: jest.fn(),
  },
}));

describe('JobPostingManager Component', () => {
  const mockCompanyId = 'company-123';

  const mockSettings: CompanySettings = {
    company_id: mockCompanyId,
    job_approval_required: false,
  };

  const mockDraftJob: Job = {
    id: 'job-1',
    company_id: mockCompanyId,
    title: 'Frontend Developer',
    slug: 'frontend-developer',
    description: 'React developer position',
    status: 'draft',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const mockPendingJob: Job = {
    id: 'job-2',
    company_id: mockCompanyId,
    title: 'Backend Engineer',
    slug: 'backend-engineer',
    description: 'Node.js developer position',
    status: 'pending_approval',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const mockPublishedJob: Job = {
    id: 'job-3',
    company_id: mockCompanyId,
    title: 'DevOps Specialist',
    slug: 'devops-specialist',
    description: 'AWS Cloud position',
    status: 'published',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const mockPausedJob: Job = {
    id: 'job-4',
    company_id: mockCompanyId,
    title: 'QA Automation Lead',
    slug: 'qa-automation-lead',
    description: 'Playwright testing lead',
    status: 'paused',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  const mockClosedJob: Job = {
    id: 'job-5',
    company_id: mockCompanyId,
    title: 'Data Analyst',
    slug: 'data-analyst',
    description: 'SQL Analytics position',
    status: 'closed',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (apiClient.listCompanyJobs as jest.Mock).mockResolvedValue([
      mockDraftJob,
      mockPendingJob,
      mockPublishedJob,
      mockPausedJob,
      mockClosedJob,
    ]);
    (apiClient.getCompanySettings as jest.Mock).mockResolvedValue(mockSettings);
    (apiClient.listJobCategories as jest.Mock).mockResolvedValue([{ id: 'cat-1', name: 'Engineering' }]);
    (apiClient.listSkills as jest.Mock).mockResolvedValue([{ id: 'sk-1', name: 'TypeScript' }]);
    (apiClient.listCities as jest.Mock).mockResolvedValue([{ id: 'ct-1', name: 'Pune', state: 'Maharashtra', country: 'India' }]);
  });

  it('1. Renders warning banner for unverified company', async () => {
    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="unverified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('unverified-company-warning')).toBeInTheDocument();
      expect(screen.getByText(/Company Unverified/i)).toBeInTheDocument();
    });
  });

  it('2. Owner/Admin can toggle job approval settings', async () => {
    (apiClient.updateCompanySettings as jest.Mock).mockResolvedValue({
      company_id: mockCompanyId,
      job_approval_required: true,
    });

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('toggle-approval-setting-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('toggle-approval-setting-btn'));

    await waitFor(() => {
      expect(apiClient.updateCompanySettings).toHaveBeenCalledWith(mockCompanyId, {
        job_approval_required: true,
      });
      expect(screen.getByTestId('job-manager-success')).toHaveTextContent(/Job approval policy updated/i);
    });
  });

  it('3. Creates a new draft job via form submission', async () => {
    const newJob: Job = {
      id: 'job-new',
      company_id: mockCompanyId,
      title: 'Fullstack Architect',
      slug: 'fullstack-architect',
      description: 'System design role',
      status: 'draft',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    };
    (apiClient.createJob as jest.Mock).mockResolvedValue(newJob);

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-job-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-job-btn'));

    fireEvent.change(screen.getByTestId('input-job-title'), { target: { value: 'Fullstack Architect' } });
    fireEvent.change(screen.getByTestId('input-job-description'), { target: { value: 'System design role' } });

    fireEvent.click(screen.getByTestId('save-job-btn'));

    await waitFor(() => {
      expect(apiClient.createJob).toHaveBeenCalledWith(mockCompanyId, expect.objectContaining({
        title: 'Fullstack Architect',
        slug: 'fullstack-architect',
        description: 'System design role',
      }));
      expect(screen.getByTestId('job-manager-success')).toHaveTextContent(/Draft job 'Fullstack Architect' created/i);
    });
  });

  it('3b. Creates draft job with work_shift, education_type, min_education_level and interview_rounds', async () => {
    const newJob: Job = {
      id: 'job-enhanced',
      company_id: mockCompanyId,
      title: 'Lead Systems Engineer',
      slug: 'lead-systems-engineer',
      description: 'Distributed systems engineering',
      work_shift: 'night',
      education_type: 'technical',
      min_education_level: 'bachelors',
      interview_rounds: [{ round: 1, name: 'HR Screening' }, { round: 2, name: 'Tech Round' }],
      status: 'draft',
      created_at: '2026-09-02T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    };
    (apiClient.createJob as jest.Mock).mockResolvedValue(newJob);

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('create-job-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-job-btn'));

    fireEvent.change(screen.getByTestId('input-job-title'), { target: { value: 'Lead Systems Engineer' } });
    fireEvent.change(screen.getByTestId('input-job-description'), { target: { value: 'Distributed systems engineering' } });
    fireEvent.change(screen.getByTestId('select-work-shift'), { target: { value: 'night' } });
    fireEvent.change(screen.getByTestId('select-education-type'), { target: { value: 'technical' } });
    fireEvent.change(screen.getByTestId('select-min-education-level'), { target: { value: 'bachelors' } });

    // Add interview round
    fireEvent.click(screen.getByTestId('btn-add-interview-round'));
    fireEvent.change(screen.getByTestId('input-round-name-0'), { target: { value: 'HR Screening' } });

    fireEvent.click(screen.getByTestId('save-job-btn'));

    await waitFor(() => {
      expect(apiClient.createJob).toHaveBeenCalledWith(mockCompanyId, expect.objectContaining({
        title: 'Lead Systems Engineer',
        work_shift: 'night',
        education_type: 'technical',
        min_education_level: 'bachelors',
        interview_rounds: [{ round: 1, name: 'HR Screening' }],
      }));
    });
  });

  it('4. HR publishes draft job directly when company is verified & approval not required', async () => {
    const publishedDraft: Job = { ...mockDraftJob, status: 'published' };
    (apiClient.publishJob as jest.Mock).mockResolvedValue(publishedDraft);

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`publish-btn-${mockDraftJob.id}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`publish-btn-${mockDraftJob.id}`));

    await waitFor(() => {
      expect(apiClient.publishJob).toHaveBeenCalledWith(mockCompanyId, mockDraftJob.id);
      expect(screen.getByTestId('job-manager-success')).toHaveTextContent(/published successfully/i);
    });
  });

  it('5. Handles unverified company HTTP 403 error on publish', async () => {
    (apiClient.publishJob as jest.Mock).mockRejectedValue(new Error('FORBIDDEN: Company unverified'));

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="unverified"
        isOwnerOrAdmin={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`publish-btn-${mockDraftJob.id}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`publish-btn-${mockDraftJob.id}`));

    await waitFor(() => {
      expect(screen.getByTestId('job-manager-error')).toHaveTextContent(/FORBIDDEN: Company unverified/i);
    });
  });

  it('6a. Owner/Admin approves pending job', async () => {
    const approvedJob: Job = { ...mockPendingJob, status: 'published' };
    (apiClient.approveJob as jest.Mock).mockResolvedValue(approvedJob);

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`approve-btn-${mockPendingJob.id}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`approve-btn-${mockPendingJob.id}`));
    await waitFor(() => {
      expect(apiClient.approveJob).toHaveBeenCalledWith(mockCompanyId, mockPendingJob.id);
      expect(screen.getByTestId('job-manager-success')).toHaveTextContent(/approved & published/i);
    });
  });

  it('6b. Owner/Admin rejects pending job with reason', async () => {
    const rejectedJob: Job = { ...mockPendingJob, status: 'draft' };
    (apiClient.rejectJob as jest.Mock).mockResolvedValue(rejectedJob);

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`reject-btn-${mockPendingJob.id}`)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId(`reject-reason-input-${mockPendingJob.id}`), {
      target: { value: 'Salary range missing' },
    });
    fireEvent.click(screen.getByTestId(`reject-btn-${mockPendingJob.id}`));
    await waitFor(() => {
      expect(apiClient.rejectJob).toHaveBeenCalledWith(mockCompanyId, mockPendingJob.id, 'Salary range missing');
      expect(screen.getByTestId('job-manager-success')).toHaveTextContent(/rejected and returned to draft/i);
    });
  });

  it('7. Non-owner HR sees pending badge instead of approve/reject buttons', async () => {
    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={false}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId(`approve-btn-${mockPendingJob.id}`)).not.toBeInTheDocument();
      expect(screen.getByText(/Pending Owner\/Admin Approval/i)).toBeInTheDocument();
    });
  });

  it('8. Executes Pause, Resume, Close, and Archive lifecycle actions', async () => {
    (apiClient.pauseJob as jest.Mock).mockResolvedValue({ ...mockPublishedJob, status: 'paused' });
    (apiClient.resumeJob as jest.Mock).mockResolvedValue({ ...mockPausedJob, status: 'published' });
    (apiClient.closeJob as jest.Mock).mockResolvedValue({ ...mockPublishedJob, status: 'closed' });
    (apiClient.archiveJob as jest.Mock).mockResolvedValue({ ...mockClosedJob, status: 'archived' });

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`pause-btn-${mockPublishedJob.id}`)).toBeInTheDocument();
    });

    // Pause
    fireEvent.click(screen.getByTestId(`pause-btn-${mockPublishedJob.id}`));
    await waitFor(() => {
      expect(apiClient.pauseJob).toHaveBeenCalledWith(mockCompanyId, mockPublishedJob.id);
    });

    // Resume
    fireEvent.click(screen.getByTestId(`resume-btn-${mockPausedJob.id}`));
    await waitFor(() => {
      expect(apiClient.resumeJob).toHaveBeenCalledWith(mockCompanyId, mockPausedJob.id);
    });

    // Close
    fireEvent.click(screen.getByTestId(`close-btn-${mockPublishedJob.id}`));
    await waitFor(() => {
      expect(apiClient.closeJob).toHaveBeenCalledWith(mockCompanyId, mockPublishedJob.id);
    });

    // Archive
    fireEvent.change(screen.getByTestId(`archive-reason-input-${mockClosedJob.id}`), {
      target: { value: 'Position filled' },
    });
    fireEvent.click(screen.getByTestId(`archive-btn-${mockClosedJob.id}`));
    await waitFor(() => {
      expect(apiClient.archiveJob).toHaveBeenCalledWith(mockCompanyId, mockClosedJob.id, 'Position filled');
    });
  });

  it('9. Renders fail-visible error banner with Retry button when loading jobs fails', async () => {
    (apiClient.listCompanyJobs as jest.Mock).mockRejectedValueOnce(new Error('HTTP 403 Forbidden: Access denied'));

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('job-manager-error')).toBeInTheDocument();
      expect(screen.getByTestId('retry-load-btn')).toBeInTheDocument();
      expect(screen.getByTestId('job-manager-error')).toHaveTextContent('HTTP 403 Forbidden: Access denied');
    });
  });

  it('9b. Renders fail-visible error banner with Retry button when loading company settings fails', async () => {
    (apiClient.getCompanySettings as jest.Mock).mockRejectedValueOnce(new Error('HTTP 403 Forbidden: Settings access denied'));

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('job-manager-error')).toBeInTheDocument();
      expect(screen.getByTestId('retry-load-btn')).toBeInTheDocument();
      expect(screen.getByTestId('job-manager-error')).toHaveTextContent('HTTP 403 Forbidden: Settings access denied');
    });
  });

  it('10. Populates custom_skills on edit, allows removing all custom skills, and asserts custom_skills: [] in updateJob payload', async () => {
    const jobWithCustomSkills: Job = {
      ...mockDraftJob,
      id: 'job-custom-edit',
      title: 'Rust Backend Developer',
      slug: 'rust-backend-developer',
      custom_skills: ['Mojo', 'Qdrant'],
    };

    (apiClient.listCompanyJobs as jest.Mock).mockResolvedValue([jobWithCustomSkills]);
    (apiClient.updateJob as jest.Mock).mockResolvedValue({
      ...jobWithCustomSkills,
      custom_skills: [],
    });

    render(
      <JobPostingManager
        companyId={mockCompanyId}
        verificationStatus="verified"
        isOwnerOrAdmin={true}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId(`edit-btn-${jobWithCustomSkills.id}`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`edit-btn-${jobWithCustomSkills.id}`));

    await waitFor(() => {
      expect(screen.getAllByText(/Mojo/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Qdrant/i).length).toBeGreaterThan(0);
    });

    // Remove custom skill Mojo
    const removeButtons = screen.getAllByTitle('Remove custom skill');
    fireEvent.click(removeButtons[0]);

    // Remove custom skill Qdrant
    const removeButtons2 = screen.getAllByTitle('Remove custom skill');
    fireEvent.click(removeButtons2[0]);

    // Save changes
    fireEvent.click(screen.getByTestId('save-job-btn'));

    await waitFor(() => {
      expect(apiClient.updateJob).toHaveBeenCalledWith(
        mockCompanyId,
        jobWithCustomSkills.id,
        expect.objectContaining({
          custom_skills: [],
        })
      );
    });
  });
});
