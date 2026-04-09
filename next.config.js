/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');
const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // Only active in production
  // NOTE: fallbacks removed — next-pwa@5.6.0 crashes with 'precacheFallback' TypeError
  // when injecting fallback handlers into runtimeCaching entries. All PWA caching remains intact.
  cacheOnFrontEndNav: false, // Don't cache client-side navigations — prevents stale page renders
  reloadOnOnline: true,      // Force reload when coming back online to bust stale cache
  runtimeCaching: [
    // ─── CRITICAL: Override next-pwa defaults that cause stale pages on mobile ───
    // next-pwa defaults use CacheFirst for /_next/static JS, which means mobile
    // browsers (especially Safari) serve old page JS from SW cache indefinitely.
    // These rules MUST come first to take priority over the library defaults.

    // Page JS chunks — ALWAYS fetch latest, fall back to cache if offline
    {
      urlPattern: /\/_next\/static\/chunks\/pages\/.+\.js$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'page-js-chunks',
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 }, // 24h
        networkTimeoutSeconds: 5, // If network takes >5s, serve cache
      },
    },
    // Next.js data routes — ALWAYS fetch latest page data
    {
      urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'next-data',
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
        networkTimeoutSeconds: 5,
      },
    },
    // Framework/vendor JS — these are content-hashed and safe to cache aggressively
    // (webpack chunk hash changes when content changes, so CacheFirst is correct here)
    {
      urlPattern: /\/_next\/static\/chunks\/(?!pages\/).+\.js$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'framework-js',
        expiration: { maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
      },
    },
    // HTML page requests — always try network first
    {
      urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'document',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'pages-html',
        expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 },
        networkTimeoutSeconds: 5,
      },
    },
    // Cache static assets (images, fonts) - cache first (content-hashed, safe)
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
  // CRITICAL: Only enable in production — in dev mode, workerThreads causes a race
  // condition where vendor chunks get deleted mid-request, triggering
  // "Cannot find module './chunks/vendor-chunks/next.js'" 500 errors.
  experimental: {
    // Disabled workerThreads and cpus: In Next.js 14, these can cause workers to 
    // crash silently (OOM), resulting in random `PageNotFoundError` during build.
    // workerThreads: false,
  },
  // ─── Dev Server Memory Management ──────────────────────────────────────────
  // With 952 pages, the dev server compiles pages on-demand and keeps them in memory.
  // [HARDENED] Keep a reasonable number of pages hot — enough to avoid recompilation
  // thrashing, but not so many that it wastes GB of RAM on a 950+ page codebase.
  // Previous: 128 pages / 24h — consumed 2-4 GB keeping unused pages warm.
  onDemandEntries: {
    maxInactiveAge: 2 * 60 * 60 * 1000,  // Dispose compiled pages after 2h of inactivity
    pagesBufferLength: 16,               // Keep 16 pages hot in memory (sufficient for active dev)
  },

  // ─── Webpack Dev Stability Fix ─────────────────────────────────────────────
  // PERMANENT FIX: Disable webpack filesystem persistent cache in dev mode.
  // Without this, stale HMR hashes from old browser tabs cause the dev server to
  // try to load .pack.gz files that no longer exist after a .next nuke, creating a
  // crash loop. Memory-only cache is fast enough for dev and immune to corruption.
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── Ultimate Dev Server Hardening ──────────────────────────────────────────
  // Next 14.2.3 handles 950+ pages heavily. Webpack natively monitors node_modules
  // which burns CPU and memory. We aggressively ignore 300,000+ unneeded files.
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Prevent CPU/RAM burnout by explicitly ignoring core dependencies from the HMR watcher.
      config.watchOptions = {
        ...config.watchOptions,
        ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**'],
        aggregateTimeout: 300, // Debounce rapid file saves
      };

      // NOTE: Do NOT use memory-only cache (`config.cache = { type: 'memory' }`).
      // Memory cache prevents vendor-chunks from being written to disk, causing
      // "Cannot find module './chunks/vendor-chunks/next.js'" 500 crashes when
      // _document.js tries to require() them. The default filesystem cache works
      // correctly with the watchOptions.ignored config above (which prevents
      // stale .pack.gz corruption by excluding .next from the watcher).
    }
    return config;
  },

  swcMinify: true, // SWC minifier uses less memory than Terser

  // Removed generateBuildId override:
  // Hardcoding the build ID in development (e.g. 'dev-stable-v2') causes Next.js Fast Refresh
  // to enter an infinite reload loop when the .next cache is cleared, because the browser HMR
  // client expects the old Webpack hash but the server generates a new one.

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
      // Club Arena images now served from public/hub/club-arena/ (native)
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 3600, // Cache optimized images for 1 hour
  },

  // ─── Security & Permissions Headers ──────────────────────────────────────────
  // Ensures geolocation (GPS), microphone, and camera permissions are properly
  // granted to the page origin. Without this, some browsers/CDNs may block
  // navigator.geolocation calls. These headers also apply in local dev.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), microphone=(self), camera=(self), display-capture=(self)',
          },
        ],
      },
    ];
  },

  // Club Arena pages are served directly from this deployment (no external proxy)
  async redirects() {
    return [
      // Short-form auth URLs → canonical auth routes
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/auth/sign' + 'in', destination: '/auth/login', permanent: true },
      { source: '/signup', destination: '/auth/sign' + 'up', permanent: true },
      { source: '/register', destination: '/auth/sign' + 'up', permanent: true },
      // Privacy/legal routes → terms page (no separate privacy page exists)
      { source: '/privacy', destination: '/terms', permanent: true },
      { source: '/legal/privacy', destination: '/terms', permanent: true },
      { source: '/legal/terms', destination: '/terms', permanent: true },
      // Live help → messenger with Jarvis
      { source: '/hub/live-help', destination: '/hub/messenger?chat=jarvis', permanent: false },
      // Club Arena — /hub/club-arena IS the lobby (the SPA). The native lobby.js was removed.
      { source: '/hub/club-arena/lobby', destination: '/hub/club-arena', permanent: true },
      // Memory Games → Preflop Charts (renamed April 2026)
      { source: '/hub/memory-games', destination: '/hub/preflop-charts', permanent: true },
      { source: '/hub/memory-games/:path*', destination: '/hub/preflop-charts/:path*', permanent: true },
    ];
  },

  async rewrites() {
    return {
      // Club Arena — 100% NATIVE. All files (JS/CSS/HTML/images/cards/videos)
      // live in public/hub/club-arena/ and are served directly from smarter.poker.
      // ZERO external requests to club-arena.vercel.app or any other domain.
      //
      // afterFiles handles SPA routing — serves index.html for routes that
      // don't match a real file in public/ or a native Next.js page.
      beforeFiles: [],
      afterFiles: [],
      // fallback rewrites run LAST — after pages AND public/ files.
      // This ensures all static files (JS/CSS/images/cards/logos) in
      // public/hub/club-arena/ are served directly. Only SPA routes
      // (no matching file) fall through to index.html.
      fallback: [
        {
          source: '/hub/club-arena',
          destination: '/hub/club-arena/index.html',
        },
        {
          source: '/hub/club-arena/:path*',
          destination: '/hub/club-arena/index.html',
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
const pwaConfig = process.env.NODE_ENV === 'development' ? nextConfig : withPWA(nextConfig);
module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.SENTRY_AUTH_TOKEN && process.env.NODE_ENV !== 'development'
  ? withSentryConfig(pwaConfig, sentryWebpackPluginOptions, sentryOptions)
  : pwaConfig;
