export type ApplicationRole = 'candidate' | 'employer' | 'hr' | 'admin';

export type UserStatus = 'active' | 'pending_verification' | 'suspended' | 'banned';

export interface UserSummary {
  id: string;
  email: string;
  role: ApplicationRole;
  status: UserStatus;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  phone?: string | null;
  avatar_path?: string | null;
}

export function getUserDisplayName(user: UserSummary): string {
  if (user.display_name && user.display_name.trim()) {
    return user.display_name.trim();
  }
  const parts = [user.first_name, user.middle_name, user.last_name].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(' ');
  }
  return user.email;
}

export interface AuthSessionResponse {
  status: 'authenticated' | 'pending_verification' | 'refreshed' | 'logged_out';
  user_id?: string | null;
}

export interface UserSessionInfo {
  id: string;
  user_id: string;
  device_type?: string | null;
  user_agent?: string | null;
  ip_address?: string | null;
  is_online: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  register_as?: 'candidate' | 'employer';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RevokeSessionRequest {
  session_id: string;
}
