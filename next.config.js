/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  reactStrictMode: false, // Disabled - was causing AbortError on Supabase queries
  eslint: { ignoreDuringBuilds: true },

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v19-2-baked-assets-' + Date.now();
  },

  // Club Arena static assets are proxied from the Club Arena Vercel deployment
  // The pages/hub/club-arena.js pages render the UI, but images/videos come from club-arena.vercel.app
  async rewrites() {
    return [
      // Club Arena images (action bar, tiles, cards, etc.)
      {
        source: '/hub/club-arena/images/:path*',
        destination: 'https://club-arena.vercel.app/images/:path*',
      },
      // Club Arena videos
      {
        source: '/hub/club-arena/videos/:path*',
        destination: 'https://club-arena.vercel.app/videos/:path*',
      },
      // Club Arena manifest and other static files
      {
        source: '/hub/club-arena/manifest.json',
        destination: 'https://club-arena.vercel.app/manifest.json',
      },
    ];
  },
};

// Sentry configuration options
const sentryWebpackPluginOptions = {
  // Suppresses source map uploading logs during build
  silent: true,

  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  org: process.env.SENTRY_ORG || 'smarter-poker',
  project: process.env.SENTRY_PROJECT || 'world-hub',

  // Auth token for source map uploads (optional)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only upload source maps in production
  dryRun: process.env.NODE_ENV !== 'production',
};

// Sentry SDK options
const sentryOptions = {
  // Upload source maps for better error tracking
  widenClientFileUpload: true,

  // Hide source maps from client bundles
  hideSourceMaps: true,

  // Automatically instrument API routes
  autoInstrumentServerFunctions: true,

  // Disable verbose logging
  disableLogger: true,

  // Disable automatic transaction wrapping for middleware
  // (can cause issues with some Next.js features)
  autoInstrumentMiddleware: false,
};

// Only wrap with Sentry if DSN is configured
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions, sentryOptions)
  : nextConfig;
