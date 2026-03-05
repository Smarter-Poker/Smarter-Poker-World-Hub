/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Only active in production
  // NOTE: fallbacks removed — next-pwa@5.6.0 crashes with 'precacheFallback' TypeError
  // when injecting fallback handlers into runtimeCaching entries. All PWA caching remains intact.
  runtimeCaching: [
    // Cache static assets (images, fonts) - cache first
    {
      urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp|avif|ico|woff|woff2|ttf|eot)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
      },
    },
    // Cache public API data - stale while revalidate
    {
      urlPattern: /\/api\/(public|poker\/venues|poker\/daily-tournaments|training\/leaderboard|arcade\/leaderboard)/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'public-api',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 }, // 5 min
      },
    },
    // Never cache auth, financial, or realtime routes
    {
      urlPattern: /\/api\/(auth|club-arena\/(?:cashout|mint|distribute|clawback)|poker\/engine)\//,
      handler: 'NetworkOnly',
      options: {
        cacheName: 'no-cache-auth',
      },
    },
  ],
  buildExcludes: [/middleware-manifest\.json$/],
});

const nextConfig = {
  reactStrictMode: false, // Kept false — Supabase auth triggers double-invoke side effects in strict mode
  eslint: { ignoreDuringBuilds: true },
  compress: true, // Enable gzip compression for all responses

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    return 'build-v20-perf-sprint-' + Date.now();
  },

  // ─── next/image Optimization ──────────────────────────────────────────────
  // Allows next/image to serve optimized WebP/AVIF from these external domains.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kuklfnapbkmacvwxktbh.supabase.co' }, // Supabase storage (avatars, uploads)
      { protocol: 'https', hostname: '*.supabase.co' },                    // Any Supabase project
      { protocol: 'https', hostname: 'images.unsplash.com' },              // Fallback stock photos
      { protocol: 'https', hostname: 'smarter.poker' },                    // Platform CDN
      { protocol: 'https', hostname: 'diamond.smarter.poker' },            // Diamond assets
      { protocol: 'https', hostname: 'api.qrserver.com' },                 // QR code generation
      { protocol: 'https', hostname: 'img.youtube.com' },                  // YouTube thumbnails
      { protocol: 'https', hostname: 'club-arena.vercel.app' },            // Club Arena tile images
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 3600, // Cache optimized images for 1 hour
  },

  // Club Arena static assets are proxied from the Club Arena Vercel deployment
  // The pages/hub/club-arena.js pages render the UI, but images/videos come from club-arena.vercel.app
  async rewrites() {
    return {
      // Rewrites that run BEFORE pages — these take priority over Next.js file routes
      beforeFiles: [
        // Club Arena table page — proxy the full React SPA from same domain
        // This ensures Supabase auth (localStorage) is shared between lobby and table
        {
          source: '/hub/club-arena/table/:path*',
          destination: 'https://club-arena.vercel.app/hub/club-arena/table/:path*',
        },
      ],
      // Rewrites that run AFTER pages (fallback)
      afterFiles: [
        // Club Arena JS/CSS/font assets
        {
          source: '/hub/club-arena/assets/:path*',
          destination: 'https://club-arena.vercel.app/hub/club-arena/assets/:path*',
        },
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
      ],
    };
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

// Only wrap with Sentry if DSN is configured AND auth token is present
// TEMP FIX: Bypass Sentry wrapping to diagnose Vercel deployment Internal Error
const pwaConfig = withPWA(nextConfig);
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(pwaConfig, sentryWebpackPluginOptions, sentryOptions)
  : pwaConfig;
