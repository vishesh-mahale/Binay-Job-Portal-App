import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EmployerDashboardPage from './page';
import { apiClient } from '@/lib/api-client';

// Mock Auth Context
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: { id: 'emp-user-1', email: 'employer@acme.com', role: 'employer' },
    logout: jest.fn(),
  }),
}));

// Mock Role Guard component to render children directly
jest.mock('@/components/role-guard', () => ({
  RoleGuard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock ApiClient methods
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    getMyCompany: jest.fn(),
    getCompany: jest.fn(),
    createCompany: jest.fn(),
    updateCompany: jest.fn(),
    getBranches: jest.fn(),
    getDepartments: jest.fn(),
    getTeams: jest.fn(),
    createBranch: jest.fn(),
    createDepartment: jest.fn(),
    createTeam: jest.fn(),
    inviteMember: jest.fn(),
    transferOwnership: jest.fn(),
  },
}));

describe('EmployerDashboardPage Component Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. Renders step 1 create company form when no company exists', async () => {
    (apiClient.getMyCompany as jest.Mock).mockResolvedValue(null);

    render(<EmployerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('Step 1: Create Company Profile')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('e.g. Acme Tech Corp')).toBeInTheDocument();
  });

  test('2. Renders UNVERIFIED status banner & restricts organization forms when company is unverified', async () => {
    const mockCompany = {
      id: 'comp-1',
      name: 'Unverified Acme Ltd',
      slug: 'unverified-acme',
      industry: 'Technology',
      verification_status: 'unverified',
    };
    (apiClient.getMyCompany as jest.Mock).mockResolvedValue(mockCompany);

    render(<EmployerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
      expect(screen.getByText(/Verification Pending with Platform Admin/i)).toBeInTheDocument();
    });

    // Verify Organization modules are hidden/locked when company is unverified
    expect(screen.queryByText('Branch Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Invite Registered Team Member')).not.toBeInTheDocument();
  });

  test('3. Refreshes status when "Refresh Status" button is clicked', async () => {
    const mockUnverified = {
      id: 'comp-1',
      name: 'Unverified Acme Ltd',
      slug: 'unverified-acme',
      industry: 'Technology',
      verification_status: 'unverified',
    };
    const mockVerified = {
      ...mockUnverified,
      verification_status: 'verified',
    };

    (apiClient.getMyCompany as jest.Mock).mockResolvedValue(mockUnverified);
    (apiClient.getCompany as jest.Mock).mockResolvedValue(mockVerified);
    (apiClient.getBranches as jest.Mock).mockResolvedValue([]);
    (apiClient.getDepartments as jest.Mock).mockResolvedValue([]);
    (apiClient.getTeams as jest.Mock).mockResolvedValue([]);

    render(<EmployerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByText('Refresh Status');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(apiClient.getCompany).toHaveBeenCalledWith('comp-1');
      expect(screen.getByText('VERIFIED')).toBeInTheDocument();
      expect(screen.getByText('Branch Management')).toBeInTheDocument();
    });
  });

  test('4. Renders unlocked organization modules & email member invite form when status is VERIFIED', async () => {
    const mockVerified = {
      id: 'comp-1',
      name: 'Verified Acme Ltd',
      slug: 'verified-acme',
      industry: 'Technology',
      verification_status: 'verified',
    };
    (apiClient.getMyCompany as jest.Mock).mockResolvedValue(mockVerified);
    (apiClient.getBranches as jest.Mock).mockResolvedValue([{ id: 'b1', name: 'Delhi HQ', city: 'Delhi', country: 'India', is_headquarters: true }]);
    (apiClient.getDepartments as jest.Mock).mockResolvedValue([{ id: 'd1', name: 'Engineering' }]);
    (apiClient.getTeams as jest.Mock).mockResolvedValue([]);

    render(<EmployerDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('VERIFIED')).toBeInTheDocument();
      expect(screen.getByText('Branch Management')).toBeInTheDocument();
      expect(screen.getByText('Invite Registered Team Member')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Invitee Account Email (e.g. hr@acme.com)')).toBeInTheDocument();
    });
  });
});
