/* ═══════════════════════════════════════════════════════════════════════════
   AUTH-CRITICAL FILES — BUILD-TIME EXISTENCE GUARD
   ─────────────────────────────────────────────────────────────────────────
   This block runs every time Next.js parses next.config.js (build, dev, lint).
   If any of the listed auth-flow files is missing or empty, the build dies
   IMMEDIATELY with a clear error — before Vercel can compile and ship a
   broken auth tree to production.

   Background: on 2026-05-02 every signup (Google + email) was 404'ing in
   prod because pages/auth/callback.js had been silently deleted from the
   repo. Vercel happily built and deployed the missing-file tree because
   nothing in the build pipeline checked. The npm `prebuild` hook does NOT
   run on Vercel (Vercel invokes `next build` directly, not `npm run build`).
   This guard runs unconditionally as part of next.config.js evaluation, so
   it catches the same regression class regardless of how the build is
   triggered.

   ANY change to this list MUST also update:
     - __tests__/auth-routes-exist.test.mjs       (CI/local node --test guard)
     - pages/api/deploy-autofix.js  PROTECTED_FILES + SENSITIVE_PATHS
     - .github/workflows/build-safety-gate.yml CHECK 8
     - scripts/pre-push-hook.sh CHECK 6 (canonical route validation)
   See docs/AUTH_FLOW.md.
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
  const fs = require('fs');
  const path = require('path');

  const AUTH_CRITICAL_FILES = [
    'pages/auth/callback.js',
    'pages/auth/login.js',
    'pages/auth/signup.js',
    'pages/auth/forgot-password.js',
    'pages/auth/reset-password.js',
    'pages/api/auth/ensure-profile.js',
  ];

  const missing = [];
  const tooSmall = [];
  for (const rel of AUTH_CRITICAL_FILES) {
    const abs = path.resolve(__dirname, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const size = fs.statSync(abs).size;
    if (size < 200) tooSmall.push(`${rel} (${size}B)`);
  }

  if (missing.length || tooSmall.length) {
    const lines = [
      '',
      '╔══════════════════════════════════════════════════════════════════╗',
      '║  BUILD ABORTED — AUTH-CRITICAL FILES ARE MISSING OR TRUNCATED    ║',
      '╠══════════════════════════════════════════════════════════════════╣',
      '║  Without these files the live signup flow 404s. Restore from    ║',
      '║  git history before continuing. See docs/AUTH_FLOW.md.          ║',
      '╚══════════════════════════════════════════════════════════════════╝',
      '',
    ];
    if (missing.length) {
      lines.push('  MISSING:');
      for (const f of missing) lines.push(`    - ${f}`);
      lines.push('');
    }
    if (tooSmall.length) {
      lines.push('  SUSPICIOUSLY SMALL (likely truncated):');
      for (const f of tooSmall) lines.push(`    - ${f}`);
      lines.push('');
    }
    // Throw — this aborts `next build` / `next dev` immediately.
    throw new Error(lines.join('\n'));
  }
})();

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
  reloadOnOnline: false,     // DISABLED — mobile devices constantly toggle online/offline causing unwanted auto-refresh loops
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
    // Cache public API data - NetworkFirst for venues (must always be fresh, stale causes 0-venue blank page)
    {
      urlPattern: /\/api\/(public|poker\/daily-tournaments|training\/leaderboard|arcade\/leaderboard)/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'public-api',
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 5 }, // 5 min
      },
    },
    // Venues API — ALWAYS fetch from network (location-sensitive, must never serve stale 0-venue cache)
    {
      urlPattern: /\/api\/poker\/venues/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'venues-api',
        networkTimeoutSeconds: 8,
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 2 }, // 2 min fallback only
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
  // NOTE: `eslint` top-level key removed — deprecated in Next.js 16. ESLint is
  // ignored at build time via the `ignoreDuringBuilds` flag which is now controlled
  // per the Next.js 16 docs. TypeScript errors are silenced in `typescript` below.
  compress: true, // Enable gzip compression for all responses

  // ─── Next.js 16 Turbopack — Forced webpack via build script flag ───────────
  // Next.js 16 enables Turbopack by default. Our codebase uses a custom webpack
  // config (supabase.js alias + dev watchOptions) and was built against webpack
  // semantics. The `build` script in package.json passes `--webpack` to force
  // webpack explicitly. This `turbopack: {}` is an additional config-level
  // declaration kept as belt-and-braces — if anything passes --turbopack, this
  // empty config ensures the "webpack config without turbopack config" hard error
  // does not surface. Both guards together guarantee webpack is used.
  // See: https://nextjs.org/docs/app/api-reference/next-config-js/turbopack
  turbopack: {},

  // ─── Serverless Bundle Slimming ────────────────────────────────────────────
  // 'standalone' output makes Next trace actual require()s and copies ONLY
  // what each API route / page needs into .next/standalone. On Vercel this
  // cuts the serverless function zipped bundle ~40% and drops cold-start p50
  // from ~1.8s to ~1.1s on a 950-page repo. Safe for Pages Router. Don't set
  // this in dev — dev uses the default server.
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  // ─── R3F Package Transpilation ──────────────────────────────────────────────
  // ESM-only packages need transpilation for proper Next.js compatibility.
  //
  // [Phase 1.2, 2026-04-21] Removed 'three' from this list. Three.js ships
  // native ESM (package.json exports map points to ./build/three.module.js).
  // Running it through SWC on every build just burns CPU/RAM with no benefit —
  // Next.js 14 loads ESM packages without transpilation. Keeping the three
  // R3F wrappers because they DO need transpilation (CJS consumers otherwise
  // hit "Cannot use import statement outside a module").
  //
  // ⚠️  CRITICAL — @smarter-poker/commander-shared ships raw JSX source (no
  // pre-compilation). Without it here, the build crashes:
  //   "Module parse failed: Unexpected token" on any .jsx in node_modules.
  // See failed deploys 4xJcGVy2N / DWyP5RYRT (April 2026). DO NOT REMOVE.
  transpilePackages: ['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', '@smarter-poker/commander-shared'],

  // ─── Build Memory Optimization ──────────────────────────────────────────────
  // With 950+ pages, the build needs memory-efficient compilation.
  // workerThreads offloads page compilation to separate workers (lower per-worker memory).
  // cpus limits parallel compilation to prevent 8-core machines from OOMing.
  // CRITICAL: Only enable in production — in dev mode, workerThreads causes a race
  // condition where vendor chunks get deleted mid-request, triggering
  // "Cannot find module './chunks/vendor-chunks/next.js'" 500 errors.
  // ─── Server External Packages (OOM FIX) — moved from experimental in Next 16 ──
  // `experimental.serverComponentsExternalPackages` was promoted to a stable top-level
  // key `serverExternalPackages` in Next.js 15+. Using the old path causes a build warning
  // and the setting is silently ignored. Moved here so it actually takes effect.
  serverExternalPackages: [
    'puppeteer', 'puppeteer-extra', 'puppeteer-extra-plugin-stealth',
    'canvas', 'phaser',
    'pg', 'pg-protocol',
    'sharp',
    'pdf-parse',
    'twilio',
    'jspdf', 'jspdf-autotable',
    'docx',
    'livekit-server-sdk',
    'posthog-node',
    '@sentry/node',
    // ffmpeg/ffprobe ship native binaries — must NOT be webpacked.
    // Used by /api/cron/transcode-videos to convert HEVC → H.264 MP4.
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
  ],

  // ─── Output File Tracing — INCLUDE binary deps for the transcode cron ─────
  // ffmpeg-installer + ffprobe-installer ship platform-specific binaries.
  // Vercel builds on linux-x64; we need that subdir + the wrapper module's
  // index.js + the package.json. Explicit globs are safer than `**/*`
  // because the tracer sometimes silently drops executable bits.
  // Moved from experimental.outputFileTracingIncludes (promoted in Next.js 15+).
  outputFileTracingIncludes: {
    'pages/api/cron/transcode-videos': [
      'node_modules/@ffmpeg-installer/ffmpeg/**/*',
      'node_modules/@ffmpeg-installer/linux-x64/**/*',
      'node_modules/@ffprobe-installer/ffprobe/**/*',
      'node_modules/@ffprobe-installer/linux-x64/**/*',
    ],
  },

  // ─── Output File Tracing — Serverless Bundle Exclusions ───────────────────
  // Moved from experimental.outputFileTracingExcludes (promoted in Next.js 15+).
  outputFileTracingExcludes: {
    '*': [
      'node_modules/puppeteer/**',
      'node_modules/puppeteer-core/**',
      'node_modules/puppeteer-extra/**',
      'node_modules/puppeteer-extra-plugin-stealth/**',
      'node_modules/@puppeteer/**',
      'node_modules/canvas/**',
      'node_modules/phaser/**',
      'node_modules/pdf-parse/**',
      'node_modules/three/examples/**',
    ],
  },

  experimental: {
    // [Phase 1.4, 2026-04-21] cpus: 1→2. Phases 1.1–1.3 removed ~49MB of
    // unused deps, excluded puppeteer/phaser/canvas/pdf-parse from the
    // file tracer, moved puppeteer+canvas to devDeps (Vercel skips them
    // on npm ci), and de-transpiled three. Serial compilation is no
    // longer the memory bottleneck. Two parallel workers splits the 950
    // pages in half and roughly halves wall-clock compile time while
    // keeping total webpack RAM inside the 8GB container (observed per-
    // worker heap ~3.5–4GB at cpus:1 — two workers at ~half the pages
    // each should stay near the same aggregate).
    //
    // If this deploy OOMs, revert to cpus: 1. The autofix bot is tagged
    // off this commit via [DO NOT AUTOFIX] so it won't race heap bumps.
    cpus: process.env.NODE_ENV === 'production' ? 2 : undefined,
    // [OOM FIX] Disable worker threads — with cpus:1 they add spawn overhead for no gain.
    workerThreads: false,
    // instrumentationHook removed — no longer an experimental key in Next.js 16.
    // instrumentation.js is loaded by default; the old flag is ignored (causes
    // "Unrecognized key" build warning). No replacement needed.
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

  // ─── TypeScript Build Config ───────────────────────────────────────────────
  // ignoreDuringBuilds (eslint) is already set above. Redeclaring it silently
  // overrode the compress flag's ordering in pre-Next-14.1. Keep just typescript
  // here since the eslint one was a duplicate.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── Ultimate Dev Server Hardening ──────────────────────────────────────────
  // Next 14.2.3 handles 950+ pages heavily. Webpack natively monitors node_modules
  // which burns CPU and memory. We aggressively ignore 300,000+ unneeded files.
  webpack: (config, { dev, isServer }) => {
    // ─── Supabase Client Resolution Fix ───────────────────────────────────────
    // Both supabase.ts (real client) and supabase.js (Node ESM test mock) exist
    // in src/lib/. Without this alias, imports with explicit .js extension
    // (e.g. from decision-bridge.js) resolve to the mock and crash the app.
    // This forces ALL imports of supabase.js to use the real .ts client instead.
    const path = require('path');
    config.resolve.alias = Object.assign(config.resolve.alias || {}, {
      [path.resolve(__dirname, 'src/lib/supabase.js')]:
        path.resolve(__dirname, 'src/lib/supabase.ts'),
    });

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

  // swcMinify removed — deprecated in Next.js 15+ (SWC is the only minifier;
  // the flag is no longer recognized and causes an "Unrecognized key" build warning).

  // Removed generateBuildId override:
  // Hardcoding the build ID in development (e.g. 'dev-stable-v2') causes Next.js Fast Refresh
  // to enter an infinite reload loop when the .next cache is cleared, because the browser HMR
  // client expects the old Webpack hash but the server generates a new one.

  // ─── next/image Optimization ──────────────────────────────────────────────
  // Allows next/image to serve optimized WebP/AVIF from these external domains.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kuklfnapbkmacvwxktbh.supabase.co' }, // Supabase storage (avatars, uploads) — kept for legacy URLs already in DB
      { protocol: 'https', hostname: 'auth.smarter.poker' },               // Supabase Custom Domain — primary going forward
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
    // Cache optimized /_next/image responses at the edge for 30 days. Avatars,
    // venue photos, and club art are requested on nearly every page view —
    // prior 1h TTL forced the origin to re-optimize on every cold edge. 30d
    // cuts Image Optimization egress ~95% and works safely because next/image
    // keys the cache on (src, width, quality).
    minimumCacheTTL: 2592000, // 30 days
  },

  // ─── HTTP Security Headers ────────────────────────────────────────────────
  // Applied to all routes. CSP is in Report-Only mode: violations are logged
  // to the browser console without breaking any functionality. Once violations
  // have been monitored and confirmed zero, switch to Content-Security-Policy.
  //
  // External resources catalogued:
  //   fonts.googleapis.com, fonts.gstatic.com  — Google Fonts
  //   storage.googleapis.com                   — Supabase storage CDN
  //   maps.googleapis.com                      — Google Maps
  //   *.supabase.co                            — Supabase DB + auth + storage
  //   cdn.onesignal.com, onesignal.com         — Push notifications
  //   cdn.jsdelivr.net, unpkg.com              — jsQR, tessaract.js, Leaflet
  //   api.giphy.com, media.giphy.com           — GIF search
  //   livekit.smarter.poker, *.livekit.cloud  — LiveKit voice/video
  //   *.smarter.poker                          — Platform sub-domains
  async headers() {
    const csp = [
      "default-src 'self'",
      // Scripts: self + OneSignal SDK + Google Maps + jsDelivr + unpkg (Leaflet/jsQR)
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.onesignal.com https://onesignal.com https://maps.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
      // Styles: self + inline + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdn.jsdelivr.net",
      // Fonts: Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: self + Supabase + Google Storage + Maps static + QR + YouTube thumbs + Giphy + data URIs
      "img-src 'self' data: blob: https://*.supabase.co https://storage.googleapis.com https://maps.googleapis.com https://maps.gstatic.com https://api.qrserver.com https://img.youtube.com https://media.giphy.com https://*.giphy.com https://images.unsplash.com",
      // Connections: API calls to Supabase, OneSignal, Google Maps (geocode), Giphy, LiveKit
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.onesignal.com https://onesignal.com https://maps.googleapis.com https://api.giphy.com https://*.livekit.cloud wss://*.livekit.cloud https://smarter.poker https://*.smarter.poker",
      // Media: self + blob (audio/video playback)
      "media-src 'self' blob: https://*.supabase.co",
      // Workers: self + blob (service worker, workbox)
      "worker-src 'self' blob:",
      // Frames: self (needed for our own iframe modals)
      "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com",
      // [Phase 6.1.14] frame-ancestors 'self' — CSP equivalent of X-Frame-Options: SAMEORIGIN.
      // Blocks external origins from embedding smarter.poker in an
      // iframe, while allowing our own site to use iframes for internal modals.
      // Prevents clickjacking of the login + check-in + diamond-transfer UIs.
      "frame-ancestors 'self'",
      // Object (Flash etc): none
      "object-src 'none'",
      // Base URI: self only (prevent base tag injection)
      "base-uri 'self'",
      // Form submissions: self only
      "form-action 'self'",
      // [Phase 6.1.14] Auto-upgrade any lingering http:// sub-resource requests
      // (e.g. inline <img src="http://..."> in user-generated content) to https.
      "upgrade-insecure-requests",
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          // [Phase 6.1.14] HSTS — force HTTPS for 2 years + subdomains + preload
          // list eligibility. Vercel already redirects http→https at the edge, but
          // this header tells the browser to refuse http:// entirely for subsequent
          // visits and propagate the policy to every *.smarter.poker host. The
          // `preload` directive lets us submit to hstspreload.org so fresh browsers
          // never make a plaintext request to us in their entire lifetime.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // [Phase 6.1.14] X-Frame-Options: belt-and-braces clickjacking defense.
          // CSP `frame-ancestors 'self'` is the modern equivalent (see csp below)
          // but XFO is still honored by legacy browsers and some embedded webviews.
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // [Phase 6.1.14] Block MIME sniffing — stops browsers from interpreting
          // a user-uploaded text file as HTML/JS. Critical because we accept avatars,
          // chat attachments, and venue photos to Supabase storage.
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // [Phase 6.1.14] Referrer-Policy — don't leak full URLs (which may
          // include query params like ?session_token=...) to third parties.
          // strict-origin-when-cross-origin sends full path to same-origin,
          // origin-only to cross-origin, nothing on HTTPS→HTTP downgrade.
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // [Phase 6.1.14] Optional perf/privacy headers.
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          // [Phase 6.1.14] Expanded Permissions-Policy — explicitly deny features
          // we never use. Stops ad-tech fingerprinting vectors (browsing-topics,
          // interest-cohort) and prevents a compromised third-party script from
          // silently tapping into sensors, USB, serial, Bluetooth, etc.
          {
            key: 'Permissions-Policy',
            value: [
              'geolocation=(self)',
              'microphone=(self)',
              'camera=(self)',
              'display-capture=(self)',
              'payment=()',
              'usb=()',
              'serial=()',
              'bluetooth=()',
              'midi=()',
              'magnetometer=()',
              'gyroscope=()',
              'accelerometer=()',
              'ambient-light-sensor=()',
              // YouTube embeds require autoplay, fullscreen, and PiP to function.
              // Without these origin allowances, Reels/Video Library won't play.
              'autoplay=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
              'fullscreen=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
              'picture-in-picture=(self "https://www.youtube-nocookie.com" "https://www.youtube.com")',
              'browsing-topics=()',
              'interest-cohort=()',
            ].join(', '),
          },
          {
            // Report-Only: logs violations without blocking — safe to enable immediately.
            // Monitor browser console and Sentry for violations, then graduate to
            // Content-Security-Policy once the violation list is clean.
            key: 'Content-Security-Policy-Report-Only',
            value: csp,
          },
        ],
      },
      // [In-App Article Reader] The proxy API serves external pages inside an
      // iframe on smarter.poker. We must allow same-origin framing for this
      // route only — overrides the global X-Frame-Options: DENY to SAMEORIGIN.
      {
        source: '/api/proxy',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
      // [Phase 6.1.14] Extra-strict headers for the jurisdiction-blocked inert
      // page — no scripts needed, no framing, no referrer leakage. This is the
      // only page served to geo-blocked users, so it pays to harden it further
      // than the app-wide baseline.
      {
        source: '/jurisdiction-blocked',
        headers: [
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
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
      // ── Poker Near Me URL Migration (April 2026) ──────────────────────────
      // Old lobby URL → new canonical lobby sub-route (301 permanent redirect)
      { source: '/hub/poker-near-me-lobby', destination: '/hub/poker-near-me/lobby', permanent: true },
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
      beforeFiles: [
        // Phase 3-deploy: commander.smarter.poker proxy.
        // beforeFiles runs BEFORE Next.js pages/, so this beats the legacy
        // pages/commander/* monolith routes that still exist during the
        // migration window. Phase 3.7 monolith cleanup will delete those.
        //
        // Note: must list /commander BARE in addition to /commander/:path*.
        // The :path* matcher with empty path captures '' and produces
        // destination '.../commander/' (trailing slash) which next.js then
        // 308-redirects back to '/commander', creating a loop. Listing the
        // bare path explicitly ensures no trailing slash is appended.
        {
          source: '/commander',
          destination: 'https://commander.smarter.poker/commander',
        },
        {
          source: '/commander/:path*',
          destination: 'https://commander.smarter.poker/commander/:path*',
        },
        {
          source: '/api/commander/:path*',
          destination: 'https://commander.smarter.poker/api/:path*',
        },
        // Commander-specific /api/admin paths only — explicit per-route to
        // avoid hijacking the 28 monolith /api/admin/* routes (check-*, etc).
        {
          source: '/api/admin/api-keys/:path*',
          destination: 'https://commander.smarter.poker/api/admin/api-keys/:path*',
        },
        {
          source: '/api/admin/api-keys',
          destination: 'https://commander.smarter.poker/api/admin/api-keys',
        },
        {
          source: '/api/admin/audit-logs',
          destination: 'https://commander.smarter.poker/api/admin/audit-logs',
        },
        {
          source: '/api/admin/leads',
          destination: 'https://commander.smarter.poker/api/admin/leads',
        },
        {
          source: '/api/admin/pilots',
          destination: 'https://commander.smarter.poker/api/admin/pilots',
        },
        {
          source: '/api/admin/pin-logout',
          destination: 'https://commander.smarter.poker/api/admin/pin-logout',
        },
        {
          source: '/api/admin/pin-setup',
          destination: 'https://commander.smarter.poker/api/admin/pin-setup',
        },
        {
          source: '/api/admin/pin-verify',
          destination: 'https://commander.smarter.poker/api/admin/pin-verify',
        },
        {
          source: '/api/admin/venues/:path*',
          destination: 'https://commander.smarter.poker/api/admin/venues/:path*',
        },
        {
          source: '/api/admin/venues',
          destination: 'https://commander.smarter.poker/api/admin/venues',
        },
      ],
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
          // Match all SPA paths but EXCLUDE files with extensions (.js, .css, etc)
          // so missing assets naturally 404 instead of serving index.html (MIME error)
          source: '/hub/club-arena/:path((?!.*\\.[\\w]+$).*)',
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
  org: process.env.SENTRY_ORG || 'smarter-software-inc',
  project: process.env.SENTRY_PROJECT || 'javascript-nextjsmarter-poker-world-hubs',

  // Auth token for source map uploads (optional)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only upload source maps in production
  dryRun: process.env.NODE_ENV !== 'production',
};

// Sentry SDK options
const sentryOptions = {
  // [Phase 5.2.1e] Disabled widenClientFileUpload to cut build memory.
  // With 952 pages + standalone output, widening the source-map upload set
  // plus autoInstrumentServerFunctions pushed the Vercel 8GB build container
  // into the kernel OOM killer (SIGKILL) after every mass-file commit.
  // Narrow upload scope only; errors still symbolicate on the files Sentry
  // cares about (pages + app routes).
  widenClientFileUpload: false,

  // Hide source maps from client bundles
  hideSourceMaps: true,

  // [Phase 5.2.1e] Disabled autoInstrumentServerFunctions — it wraps every
  // API route with Sentry tracing at build time, allocating a huge closure
  // map. Runtime Sentry.init() still captures all thrown errors; only the
  // automatic performance-tracing wrapping is skipped.
  autoInstrumentServerFunctions: false,

  // Disable verbose logging
  disableLogger: true,

  // Disable automatic transaction wrapping for middleware
  // (can cause issues with some Next.js features)
  autoInstrumentMiddleware: false,
};

// [OOM FIX] Bypass Sentry webpack plugin entirely.
// withSentryConfig instruments every route + uploads source maps at build time.
// On a 950+ page repo this consumes 1-2GB of build RAM and tips us over the
// Vercel 8GB container limit. Runtime Sentry.init() in sentry.client.config.js
// still captures all thrown errors — only build-time auto-instrumentation is skipped.
const pwaConfig = process.env.NODE_ENV === 'development' ? nextConfig : withPWA(nextConfig);
module.exports = pwaConfig;
