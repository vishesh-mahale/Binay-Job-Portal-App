import type { NextConfig } from 'next';

const isProduction = (process.env.NODE_ENV as string) === 'production' || (process.env.NODE_ENV as string) === 'preprod';
// Enforce fail-closed configuration validation:
// In production/preprod, NEXT_PUBLIC_API_URL must be explicitly provided. Localhost fallback is forbidden.
if (isProduction && !process.env.NEXT_PUBLIC_API_URL) {
  throw new Error(
    '[next.config.ts] Configuration Error: NEXT_PUBLIC_API_URL must be explicitly set in preprod and production environments. Localhost fallback is strictly forbidden.'
  );
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
