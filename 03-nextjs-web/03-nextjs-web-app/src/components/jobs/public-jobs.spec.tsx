import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PublicJobList } from './public-job-list';
import { PublicJobCard } from './public-job-card';
import PublicJobDetailPage from '@/app/jobs/[slug]/page';
import HomePage from '@/app/page';
import { apiClient } from '@/lib/api-client';
import type { PublicJobItem, PublicJobSearchResponse } from '@/types/jobs';

// Mock next/navigation
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  useParams: () => mockParams,
  useSearchParams: () => mockSearchParams,
}));

// Mock auth context
let mockUser: any = null;
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

// Mock apiClient
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    searchPublicJobs: jest.fn(),
    getPublicJobBySlug: jest.fn(),
    getPublicJobById: jest.fn(),
    listJobCategories: jest.fn(),
  },
}));

describe('Public Jobs Listing & Discovery Suite', () => {
  const sampleJob1: PublicJobItem = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    title: 'Senior Software Engineer',
    slug: 'senior-software-engineer',
    company_name: 'Tech Innovators Inc.',
    work_mode: 'hybrid',
    employment_type: 'full_time',
    location_city: 'Bangalore',
    location_state: 'Karnataka',
    location_country: 'India',
    salary_min: 1500000,
    salary_max: 2500000,
    salary_currency: 'INR',
    salary_period: 'yearly',
    salary_visible: true,
    status: 'published',
    published_at: '2026-09-01T10:00:00Z',
  };

  const sampleConfidentialJob: PublicJobItem = {
    id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    title: 'Executive Director of AI',
    slug: 'executive-director-of-ai',
    company_name: 'Confidential Employer',
    is_confidential: true,
    work_mode: 'remote',
    employment_type: 'full_time',
    location_country: 'India',
    salary_min: 5000000,
    salary_max: 8000000,
    salary_currency: 'INR',
    salary_visible: false, // Hidden salary
    status: 'published',
    published_at: '2026-09-02T10:00:00Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockParams = {};
    mockSearchParams = new URLSearchParams();
    (apiClient.listJobCategories as jest.Mock).mockResolvedValue([
      { id: 'cat-1', name: 'Software Development' },
    ]);
  });

  // Scenario 1: GET /api/v1/jobs renders list of published jobs on landing page
  it('1. renders list of published jobs on landing page when apiClient returns items', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1, sampleConfidentialJob],
      next_cursor: null,
    });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('Explore Opportunities')).toBeInTheDocument();
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Executive Director of AI').length).toBeGreaterThanOrEqual(1);
    });

    expect(apiClient.searchPublicJobs).toHaveBeenCalledTimes(1);
  });

  it('selects a card and updates the split-view detail pane with a new-tab link', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1, sampleConfidentialJob],
      next_cursor: null,
    });

    render(<PublicJobList />);
    await waitFor(() => expect(screen.getByTestId('detail-pane')).toBeInTheDocument());
    expect(screen.getByTestId('detail-pane-heading')).toHaveTextContent(sampleJob1.title);

    fireEvent.click(screen.getAllByTestId('public-job-card')[1]);
    expect(screen.getByTestId('detail-pane-heading')).toHaveTextContent(sampleConfidentialJob.title);
    expect(screen.getByTestId('open-in-new-tab-btn')).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('open-in-new-tab-btn')).toHaveAttribute('href', `/jobs/${sampleConfidentialJob.slug}`);
  });

  // Scenario 2: Search by keyword filters the list
  it('2. filters jobs when searching by keyword', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1],
      next_cursor: null,
    });

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
    });

    const searchInput = screen.getByPlaceholderText(/search by job title/i);
    fireEvent.change(searchInput, { target: { value: 'Engineer' } });
    fireEvent.submit(searchInput.closest('form')!);

    await waitFor(() => {
      expect(apiClient.searchPublicJobs).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Engineer' })
      );
    });
  });

  // Scenario 3: Filter by employment type, work mode, country works as expected
  it('3. updates search query when employment type, work mode, or country filters change', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1],
      next_cursor: null,
    });

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
    });

    const workModeSelect = screen.getByDisplayValue('All Work Modes');
    fireEvent.change(workModeSelect, { target: { value: 'remote' } });

    await waitFor(() => {
      expect(apiClient.searchPublicJobs).toHaveBeenCalledWith(
        expect.objectContaining({ work_mode: 'remote' })
      );
    });
  });

  // Scenario 4: Confidential employer shows 'Confidential Employer' and no real company info
  it('4. displays "Confidential Employer" and masks company info for confidential jobs', () => {
    render(<PublicJobCard job={sampleConfidentialJob} />);

    expect(screen.getByText('Confidential Employer')).toBeInTheDocument();
    expect(screen.queryByText('Tech Innovators Inc.')).not.toBeInTheDocument();
  });

  // Scenario 5: Salary is hidden when salary_visible: false or null
  it('5. hides salary details when salary_visible is false or null', () => {
    render(<PublicJobCard job={sampleConfidentialJob} />);
    expect(screen.queryByText(/5,000,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/8,000,000/)).not.toBeInTheDocument();
  });

  // Scenario 6: Salary is formatted correctly when visible
  it('6. formats salary correctly when visible', () => {
    render(<PublicJobCard job={sampleJob1} />);
    const salaryElement = screen.getByTestId('job-salary');
    expect(salaryElement).toBeInTheDocument();
    expect(salaryElement).toHaveTextContent(/INR/i);
    expect(salaryElement).toHaveTextContent(/yearly/i);
  });

  // Scenario 7: Cursor pagination "Load More" fetches next page and appends
  it('7. fetches next cursor page and appends items on "Load More" click', async () => {
    const page1Res: PublicJobSearchResponse = {
      items: [sampleJob1],
      next_cursor: 'cursor-token-page-2',
    };

    const secondJob: PublicJobItem = {
      ...sampleJob1,
      id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      title: 'Data Platform Architect',
      slug: 'data-platform-architect',
    };

    const page2Res: PublicJobSearchResponse = {
      items: [secondJob],
      next_cursor: null,
    };

    (apiClient.searchPublicJobs as jest.Mock)
      .mockResolvedValueOnce(page1Res)
      .mockResolvedValueOnce(page2Res);

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('load-more-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('load-more-button'));

    await waitFor(() => {
      expect(screen.getByText('Data Platform Architect')).toBeInTheDocument();
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
    });

    expect(apiClient.searchPublicJobs).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'cursor-token-page-2' })
    );
  });

  // Scenario 8: Empty state renders when no jobs match filters
  it('8. renders empty state when no jobs match query', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [],
      next_cursor: null,
    });

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getByText(/no published jobs found/i)).toBeInTheDocument();
      expect(screen.getByTestId('empty-clear-filters')).toBeInTheDocument();
    });
  });

  // Scenario 9: Error state renders with retry button when API fails
  it('9. renders error alert with retry button when search fails', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockRejectedValueOnce(
      new Error('Internal network error')
    );

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getByText(/internal network error/i)).toBeInTheDocument();
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    // When clicking retry, call succeeds
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValueOnce({
      items: [sampleJob1],
      next_cursor: null,
    });

    fireEvent.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThanOrEqual(1);
    });
  });

  // Scenario 10: Public job detail view renders full specs and shows 'Sign in to Apply' for unauthenticated visitor
  it('10. renders full job details and "Sign in to Apply" button for guest visitor', async () => {
    const fullDetailJob: PublicJobItem = {
      ...sampleJob1,
      work_shift: 'night',
      min_education_level: 'bachelor',
      max_notice_period_days: 30,
      description: 'We are seeking a high-caliber engineer to architect distributed platforms.',
      responsibilities: 'Build scalable microservices and optimize event pipelines.',
      requirements: '5+ years experience in distributed systems and TypeScript.',
      benefits: 'Health insurance, annual learning stipend, remote equipment allowance.',
      vacancies: 2,
      screening_questions_enabled: true,
      skills: [
        { id: 'sk-1', skill_id: 's-ts', skill_name: 'TypeScript', is_required: true, min_years: 3 },
        { id: 'sk-2', skill_id: 's-node', skill_name: 'Node.js', is_required: false },
      ],
      custom_skills: ['Kafka', 'PostgreSQL'],
    };

    mockParams = { slug: 'senior-software-engineer' };
    (apiClient.getPublicJobBySlug as jest.Mock).mockResolvedValue(fullDetailJob);

    render(<PublicJobDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('detail-job-title')).toHaveTextContent('Senior Software Engineer');
      expect(screen.getByTestId('signin-to-apply-btn')).toBeInTheDocument();
      expect(screen.getByText('Job Overview')).toBeInTheDocument();
      expect(screen.getByText(/We are seeking a high-caliber engineer/i)).toBeInTheDocument();
      expect(screen.getByText('Key Responsibilities')).toBeInTheDocument();
      expect(screen.getByText('Requirements & Qualifications')).toBeInTheDocument();
      expect(screen.getByText('Must Have')).toBeInTheDocument();
      expect(screen.getAllByText(/TypeScript/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/Kafka/i)).toBeInTheDocument();
      expect(screen.getByText('Work Shift')).toBeInTheDocument();
      expect(screen.getByText('night')).toBeInTheDocument();
      expect(screen.getByText('Min Education')).toBeInTheDocument();
      expect(screen.getByText('bachelor')).toBeInTheDocument();
      expect(screen.getByText('Max Notice Period')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
    });

    // Check link on "Sign in to Apply" directs to login with redirect
    const signinLink = screen.getByTestId('signin-to-apply-btn').closest('a');
    expect(signinLink).toHaveAttribute('href', '/login?redirect=/jobs/senior-software-engineer');
  });

  it('10b. renders "Apply Now" button when candidate is authenticated', async () => {
    mockUser = { id: 'usr-1', email: 'candidate@test.com', role: 'candidate' };
    const fullDetailJob: PublicJobItem = {
      ...sampleJob1,
      description: 'Role overview',
    };

    mockParams = { slug: 'senior-software-engineer' };
    (apiClient.getPublicJobBySlug as jest.Mock).mockResolvedValue(fullDetailJob);

    render(<PublicJobDetailPage />);

    await waitFor(() => {
      expect(screen.getByTestId('apply-now-btn')).toBeInTheDocument();
      expect(screen.queryByTestId('signin-to-apply-btn')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('apply-now-btn'));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/candidate?apply=' + encodeURIComponent(fullDetailJob.id));
  });

  // Scenario 11: Clicking a card updates the right detail pane
  it('11. clicking a card selects it and shows its title in the detail pane', async () => {
    const job2: PublicJobItem = {
      ...sampleJob1,
      id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      title: 'Product Designer',
      slug: 'product-designer',
    };

    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1, job2],
      next_cursor: null,
    });

    render(<PublicJobList />);

    // Wait for cards to render
    await waitFor(() => {
      expect(screen.getAllByText('Senior Software Engineer').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Product Designer').length).toBeGreaterThan(0);
    });

    // First card is auto-selected: detail pane header shows its title
    const detailTitles = screen.getAllByTestId('detail-pane-job-title');
    expect(detailTitles[0]).toHaveTextContent('Senior Software Engineer');

    // Click the second card
    const cards = screen.getAllByTestId('public-job-card');
    fireEvent.click(cards[1]);

    // Detail pane should update to show the second job
    await waitFor(() => {
      expect(screen.getAllByTestId('detail-pane-job-title')[0]).toHaveTextContent('Product Designer');
    });
  });

  // Scenario 12: "Open in New Tab" button has correct href
  it('12. "Open in New Tab" button in detail pane links to /jobs/[slug] with target=_blank', async () => {
    (apiClient.searchPublicJobs as jest.Mock).mockResolvedValue({
      items: [sampleJob1],
      next_cursor: null,
    });

    render(<PublicJobList />);

    await waitFor(() => {
      expect(screen.getByTestId('open-in-new-tab-btn')).toBeInTheDocument();
    });

    const openLink = screen.getByTestId('open-in-new-tab-btn');
    expect(openLink).toHaveAttribute('href', `/jobs/${encodeURIComponent(sampleJob1.slug)}`);
    expect(openLink).toHaveAttribute('target', '_blank');
  });
});
