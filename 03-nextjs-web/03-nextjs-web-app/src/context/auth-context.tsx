'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../lib/api-client';
import type { UserSummary, LoginRequest, SignupRequest } from '../types/auth';
import { AppApiError } from '../lib/errors';

interface AuthContextType {
  user: UserSummary | null;
  loading: boolean;
  error: string | null;
  login: (data: LoginRequest) => Promise<void>;
  signup: (data: SignupRequest) => Promise<{ pendingVerification: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<UserSummary | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshUser = useCallback(async (): Promise<UserSummary | null> => {
    try {
      const u = await apiClient.getMe();
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const handleSignoutSync = useCallback(() => {
    setUser(null);
    setError(null);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
      window.location.href = '/login?message=Session+expired.+Please+sign+in+again.';
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const u = await apiClient.getMe();
        if (mounted) {
          setUser(u);
        }
      } catch {
        if (mounted) {
          setUser(null);
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
            handleSignoutSync();
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    // Multi-tab logout broadcast & 401 unauthorized listener
    let bc: BroadcastChannel | null = null;
    if (typeof window !== 'undefined') {
      const handleUnauthorized = () => {
        handleSignoutSync();
      };
      window.addEventListener('auth:unauthorized', handleUnauthorized);

      try {
        bc = new BroadcastChannel('collabfor_auth_channel');
        bc.onmessage = (event) => {
          if (event.data?.type === 'LOGOUT') {
            handleSignoutSync();
          }
        };
      } catch {}

      return () => {
        mounted = false;
        window.removeEventListener('auth:unauthorized', handleUnauthorized);
        if (bc) bc.close();
      };
    }

    return () => {
      mounted = false;
    };
  }, [handleSignoutSync]);

  const login = async (data: LoginRequest): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.login(data);
      const u = await apiClient.getMe();
      setUser(u);
      if (typeof window !== 'undefined') {
        try {
          const bc = new BroadcastChannel('collabfor_auth_channel');
          bc.postMessage({ type: 'LOGIN' });
          bc.close();
        } catch {}
      }
    } catch (err: any) {
      setUser(null);
      const msg = err instanceof AppApiError ? err.message : 'Login failed. Please check your credentials.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signup = async (data: SignupRequest): Promise<{ pendingVerification: boolean }> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.signup(data);
      const pendingVerification = res.status === 'pending_verification';
      if (!pendingVerification) {
        const u = await apiClient.getMe();
        setUser(u);
      }
      return { pendingVerification };
    } catch (err: any) {
      const msg = err instanceof AppApiError ? err.message : 'Signup failed. Please try again.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      await apiClient.logout();
    } catch {
      // Ignore logout API failures and clear client state
    } finally {
      setUser(null);
      setError(null);
      setLoading(false);

      if (typeof window !== 'undefined') {
        try {
          const bc = new BroadcastChannel('collabfor_auth_channel');
          bc.postMessage({ type: 'LOGOUT' });
          bc.close();
        } catch {}
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        signup,
        logout,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
