import React from 'react';
import { render, screen } from '@testing-library/react';
import { RoleGuard } from './role-guard';
import { useAuth } from '@/context/auth-context';
import { useRouter } from 'next/navigation';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/context/auth-context', () => ({
  useAuth: jest.fn(),
}));

describe('RoleGuard Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading spinner when auth state is loading', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, loading: true });

    render(
      <RoleGuard allowedRoles={['candidate']}>
        <div>Protected Content</div>
      </RoleGuard>
    );

    expect(screen.getByTestId('role-guard-loading')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is unauthenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({ user: null, loading: false });

    render(
      <RoleGuard allowedRoles={['candidate']}>
        <div>Protected Content</div>
      </RoleGuard>
    );

    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });

  it('redirects to /forbidden when user role is not allowed', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'test@example.com', role: 'candidate', status: 'active' },
      loading: false,
    });

    render(
      <RoleGuard allowedRoles={['admin']}>
        <div>Admin Content</div>
      </RoleGuard>
    );

    expect(mockPush).toHaveBeenCalledWith('/forbidden');
    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('renders children when user role is in allowedRoles', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'test@example.com', role: 'candidate', status: 'active' },
      loading: false,
    });

    render(
      <RoleGuard allowedRoles={['candidate', 'admin']}>
        <div>Candidate Content</div>
      </RoleGuard>
    );

    expect(screen.getByText('Candidate Content')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles re-renders with fresh array references without unstable effect loops', () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: { id: 'u1', email: 'employer@example.com', role: 'employer', status: 'active' },
      loading: false,
    });

    const { rerender } = render(
      <RoleGuard allowedRoles={['employer', 'hr']}>
        <div>Employer Portal</div>
      </RoleGuard>
    );

    expect(screen.getByText('Employer Portal')).toBeInTheDocument();

    // Re-render with new array reference
    rerender(
      <RoleGuard allowedRoles={['employer', 'hr']}>
        <div>Employer Portal</div>
      </RoleGuard>
    );

    expect(screen.getByText('Employer Portal')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
