import type { NextConfig } from 'next';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).origin : '';
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy. Google Maps requires maps.googleapis.com / gstatic / googleusercontent.
 * 'unsafe-inline' for scripts is required by Next without a per-request nonce setup; tightening this to
 * nonces is listed in docs/SECURITY.md as a hardening follow-up.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://maps.googleapis.com https://maps.gstatic.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: ${supabaseHost} https://*.googleapis.com https://*.gstatic.com https://*.googleusercontent.com https://*.ggpht.com`,
  `connect-src 'self' ${supabaseHost} ${supabaseHost.replace('https://', 'wss://')} https://maps.googleapis.com ${isDev ? 'ws://localhost:*' : ''}`,
  `media-src 'self' blob: ${supabaseHost}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@solotrav/api-client', '@solotrav/business-logic', '@solotrav/shared-types', '@solotrav/ui-tokens', '@solotrav/validation'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
