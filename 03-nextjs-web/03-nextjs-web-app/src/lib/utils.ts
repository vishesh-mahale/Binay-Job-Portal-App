import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getSafeRedirectUrl(target: string | null, fallback: string): string {
  if (!target) return fallback;
  const trimmed = target.trim();
  // Allow only same-origin relative paths starting with a single '/'
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.includes('\\') &&
    !trimmed.includes(':')
  ) {
    return trimmed;
  }
  return fallback;
}
