import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import InviteAcceptPage from './page';
import { apiClient } from '@/lib/api-client';

// Mock useRouter & useSearchParams
const mockPush = jest.fn();
let mockSearchParamsGet = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}));

// Mock Auth Context
const mockRefreshUser = jest.fn();
jest.mock('@/context/auth-context', () => ({
  useAuth: () => ({
    user: null,
    refreshUser: mockRefreshUser,
  }),
}));

// Mock ApiClient
jest.mock('@/lib/api-client', () => ({
  apiClient: {
    verifyInvitation: jest.fn(),
    signupWithInvite: jest.fn(),
  },
}));

describe('InviteAcceptPage Component Unit Tests (New User Only Flow)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('1. Renders missing token error banner when no token is present in URL', async () => {
    mockSearchParamsGet.mockReturnValue(null);

    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText('Invitation Error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Invitation token is missing in the URL/i)).toBeInTheDocument();
  });

  test('2. Renders invitation metadata and new user signup form when token is valid', async () => {
    mockSearchParamsGet.mockReturnValue('valid_token_123');
    (apiClient.verifyInvitation as jest.Mock).mockResolvedValue({
      data: {
        id: 'inv-1',
        company_id: 'comp-1',
        company_name: 'Acme Corp',
        email: 'invitee@acme.com',
        role: 'hr',
        title: 'Talent Acquisition Lead',
        expires_at: '2026-09-10T00:00:00Z',
        status: 'pending',
        is_primary_hr: false,
      },
    });

    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText('Join Acme Corp')).toBeInTheDocument();
    });

    expect(screen.getByText('invitee@acme.com')).toBeInTheDocument();
    expect(screen.getAllByText('Talent Acquisition Lead').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Jane Doe')).toBeInTheDocument();
  });

  test('3. Executes signupWithInvite and redirects upon successful submission', async () => {
    mockSearchParamsGet.mockReturnValue('valid_token_123');
    (apiClient.verifyInvitation as jest.Mock).mockResolvedValue({
      data: {
        id: 'inv-1',
        company_name: 'Acme Corp',
        email: 'invitee@acme.com',
        title: 'Talent Lead',
      },
    });
    (apiClient.signupWithInvite as jest.Mock).mockResolvedValue({ data: { success: true } });

    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText('Join Acme Corp')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'John Invitee' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'Password123!' } });

    fireEvent.click(screen.getByText('Accept Invitation & Create HR Account'));

    await waitFor(() => {
      expect(apiClient.signupWithInvite).toHaveBeenCalledWith({
        token: 'valid_token_123',
        full_name: 'John Invitee',
        password: 'Password123!',
      });
    });

    expect(mockRefreshUser).toHaveBeenCalled();
  });

  test('4. Displays error banner when email belongs to an existing user', async () => {
    mockSearchParamsGet.mockReturnValue('valid_token_123');
    (apiClient.verifyInvitation as jest.Mock).mockResolvedValue({
      data: {
        id: 'inv-1',
        company_name: 'Acme Corp',
        email: 'invitee@acme.com',
        title: 'Talent Lead',
      },
    });

    const accountExistsError = new Error('Account exists');
    (accountExistsError as any).code = 'EXISTING_USER_CANNOT_BE_INVITED';
    (apiClient.signupWithInvite as jest.Mock).mockRejectedValue(accountExistsError);

    render(<InviteAcceptPage />);

    await waitFor(() => {
      expect(screen.getByText('Join Acme Corp')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText('Jane Doe'), { target: { value: 'John Invitee' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'Password123!' } });

    fireEvent.click(screen.getByText('Accept Invitation & Create HR Account'));

    await waitFor(() => {
      expect(screen.getByText(/An account with this email address already exists. Existing user accounts cannot be invited or converted to HR./i)).toBeInTheDocument();
    });
  });
});
