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
  // StrictMode doubles renders/effects in dev, which doubles memory pressure on 952 pages.
  // Keep it ON for production builds where it helps catch bugs; OFF for dev stability.
  reactStrictMode: process.env.NODE_ENV === 'production',
  eslint: { ignoreDuringBuilds: true },
  compress: true, // Enable gzip compression for all responses

  // ─── Three.js / R3F Package Transpilation ──────────────────────────────────
  // ESM-only packages need transpilation for proper Next.js compatibility.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing'],

  // ─── Build Memory Optimization ──────────────────────────────────────────────
  // With 950+ pages, the build needs memory-efficient compilation.
  // workerThreads offloads page compilation to separate workers (lower per-worker memory).
  // cpus limits parallel compilation to prevent 8-core machines from OOMing.
  experimental: {
    workerThreads: true,
    cpus: 4,
  },
  // ─── Dev Server Memory Management ──────────────────────────────────────────
  // With 952 pages, the dev server compiles pages on-demand and keeps them in memory.
  // Reduce buffer and disposal time to aggressively free memory as developer navigates.
  onDemandEntries: {
    maxInactiveAge: 30 * 1000,    // Dispose compiled pages after 30s of inactivity (default: 60s)
    pagesBufferLength: 3,         // Only keep 3 pages hot in memory (default: 5)
  },

  // ─── Webpack Dev Stability Fix ─────────────────────────────────────────────
  // PERMANENT FIX: Disable webpack filesystem persistent cache in dev mode.
  // Without this, stale HMR hashes from old browser tabs cause the dev server to
  // try to load .pack.gz files that no longer exist after a .next nuke, creating a
  // crash loop. Memory-only cache is fast enough for dev and immune to corruption.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = {
        type: 'memory',
      };
    }
    return config;
  },
  swcMinify: true, // SWC minifier uses less memory than Terser

  // Force complete cache invalidation - v20 Diamond Arcade Deploy
  // Build timestamp: 2026-01-24T10:00:00Z
  generateBuildId: async () => {
    // In dev mode, use a stable ID so the .next cache persists across restarts.
    // Without this, Date.now() forces webpack to recompile ALL 952 pages from scratch.
    // In production (Vercel), the Git SHA is used automatically.
    if (process.env.NODE_ENV === 'development') {
      return 'dev-stable';
    }
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

  // Club Arena pages are served directly from this deployment (no external proxy)
  async redirects() {
    return [
      // Short-form auth URLs → canonical auth routes
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/signup', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      // Privacy/legal routes → terms page (no separate privacy page exists)
      { source: '/privacy', destination: '/terms', permanent: true },
      { source: '/legal/privacy', destination: '/terms', permanent: true },
      { source: '/legal/terms', destination: '/terms', permanent: true },
      // Live help → messenger with Jarvis
      { source: '/hub/live-help', destination: '/hub/messenger?chat=jarvis', permanent: false },
      // Poker Near Me — redirect old flat page to new 3D lobby
      { source: '/hub/poker-near-me', destination: '/hub/poker-near-me-lobby', permanent: false },
    ];
  },

  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
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
