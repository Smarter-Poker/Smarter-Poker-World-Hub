/* ═══════════════════════════════════════════════════════════════════════════
   AUTH-CRITICAL FILES — BUILD-TIME EXISTENCE GUARD
   ───────────────────────────────────────────────────────────────────────────
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
const os = require('os');
const { withSentryConfig } = require('@sentry/nextjs');

// --- How many cores the build is allowed to use -----------------------------
// Read the machine instead of hard-coding a number, because this same config
// runs on three very different machines and a constant is wrong on two of them.
//
// Measured 2026-09-08 from the Vercel build log of PR #1601:
//
//   Build machine configuration: 8 cores, 16 GB   (Enhanced Build Machine)
//   - Experiments (use with caution):
//     - cpus: 2
//   Compiled with warnings in 106s
//   Collecting page data using 2 workers ...
//   Generating static pages using 2 workers (0/397) ...
//   Build Completed in /vercel/output [4m]
//
// 106s of compile and 98s of prerendering 397 pages, both pinned to two of the
// eight cores we are paying for. The cap was raised 1 -> 2 on 2026-05-18 "to
// prevent 8-core machines from OOMing" - on a machine that now has 16 GB and a
// 7 GB max-old-space. The cap outlived the hardware that justified it.
//
// The other half is the 2026-07-21 note: a 2-core sandbox hits an export-worker
// race in the /_not-found prerender under parallel export, and needed a MANUAL
// `BUILD_CPUS=1` to avoid it. Deriving from the core count applies that
// workaround automatically on exactly the machines that need it (2 cores -> 1)
// instead of asking a person to remember.
//
// Capped at 4, not at the core count: memory, not cores, is the limit that bit
// before, and 4 is the largest step supported by a measurement. Raise it when
// the p50 says it is safe. BUILD_CPUS still overrides everything.
function resolveBuildCpus() {
  const override = Number(process.env.BUILD_CPUS);
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  const cores =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : (os.cpus() || []).length;
  if (!Number.isFinite(cores) || cores < 1) return 2; // unreadable: old default
  return Math.max(1, Math.min(4, cores - 1));
}
const { publicShellManifestEntries } = require('./scripts/pwa/public-shell-precache');
const { execFileSync } = require('child_process');

// Vercel normally supplies VERCEL_GIT_COMMIT_SHA, but CLI-created deployments
// can omit the System Environment Variables while still replacing production.
// Stamp the checked-out revision into the build so health checks always expose
// the source that actually produced the running bundle.
const buildCommitSha = (() => {
  const suppliedSha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (/^[a-f0-9]{7,40}$/i.test(suppliedSha || '')) return suppliedSha;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'local';
  }
})();

const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  // Registration is owned by ServiceWorkerUpdater. Workbox Window assumes
  // register() always returns a ServiceWorkerRegistration, but Safari privacy
  // modes (and embedded WebKit with workers disabled) may resolve without one,
  // causing an unhandled `registration.waiting` rejection on every page. The
  // app-owned path below uses the native API, validates the result, and keeps
  // the same root worker/update lifecycle without allowing that rejection to
  // escape into the page.
  register: false,
  skipWaiting: true,
  disable: !process.env.VERCEL, // Only active in production Vercel builds
  // NOTE: fallbacks removed — next-pwa@5.6.0 crashes with 'precacheFallback' TypeError
  // when injecting fallback handlers into runtimeCaching entries. All PWA caching remains intact.
  cacheOnFrontEndNav: false, // Don't cache client-side navigations — prevents stale page renders
  reloadOnOnline: false, // DISABLED — mobile devices constantly toggle online/offline causing unwanted auto-refresh loops
  // Dan-fix/pwa-v10-workbox (2026-05-12): @ducanh2912/next-pwa@10+ requires custom
  // rules to live under workboxOptions.runtimeCaching, with extendDefaultRuntimeCaching=false
  // to prevent library defaults from overriding our NetworkOnly rules. The top-level
  // `runtimeCaching` parameter is silently ignored in v10 — that's why the mobile
  // white-screen fix from PR #503 was not taking effect.
  extendDefaultRuntimeCaching: false,
  // NOTE: `publicExcludes` further down this object is next-pwa's own
  // build-cost denylist and is NOT what keeps public/ out of the precache.
  // See the additionalManifestEntries comment below for what actually does.
  workboxOptions: {
    // ─── THE ROOT SERVICE WORKER MUST BE ABLE TO INSTALL ───────────────────
    // Dan, 2026-08-29, from an iPhone: "ENABLE NOTIFICATIONS ISN'T WORKING",
    // with Club Arena's prompt showing "The notification service worker did
    // not start. Reload and try again."
    //
    // Measured against production the same day: `navigator.serviceWorker
    // .register('/sw.js')` resolved, the worker went `redundant` ~170ms later,
    // and `getRegistration('/')` then returned undefined. Probing all 827
    // precache entries found exactly ONE bad URL:
    //
    //     /_next/dynamic-css-manifest.json  ->  404
    //
    // Next emits `dynamic-css-manifest.json` as a BUILD artifact and does not
    // serve it under /_next/. next-pwa put it in the precache manifest anyway,
    // workbox's install precaches the whole manifest atomically, and ONE 404
    // rejects install — so the root worker never activated. That worker is the
    // only one on this origin with a `push` handler (worker/index.js,
    // sp-push-v3), which means web push was dead for EVERY user of the hub AND
    // of Club Arena, not just the person who saw the error.
    //
    // Filtering it here, rather than via `exclude`, is deliberate:
    //   * next-pwa spreads OUR manifestTransforms BEFORE its own, so this runs
    //     while entries may still be raw asset names — the regex is anchored on
    //     the basename so it matches whether the url is
    //     `dynamic-css-manifest.json` or `/_next/dynamic-css-manifest.json`.
    //   * supplying `exclude` REPLACES next-pwa's default exclude array
    //     (woff2 / .map / manifest*.js), which is a silent regression waiting
    //     to happen. manifestTransforms is additive.
    //
    // If a future Next release adds another unserved `_next/*.json` build
    // artifact, the symptom is identical and silent. `scripts/ci/check-sw-precache.mjs`
    // exists to catch that: it probes every precache entry against production.
    //
    // ─── AND IT MUST BE ABLE TO INSTALL ON A PHONE, ON CELLULAR ────────────
    //
    // Measured on production 2026-08-29, once the worker could install at all:
    // 826 entries, and a first-ever install took about 55 SECONDS on a fast
    // desktop connection. The weight was not the app:
    //
    //     public/ assets      200 files   34.7 MB
    //       icons/             33          13.2 MB
    //       usrobots/          12          10.2 MB   (a marketing slideshow)
    //       root files         66           8.0 MB   (31 *-review.html dev pages,
    //                                                 OneSignalSDKWorker.js,
    //                                                 message-icon.png at 1 MB)
    //     page JS chunks      295 files    (see below)
    //     framework/vendor    291 files    the actual app shell
    //
    // Two separate problems, both fixed by the filter below.
    //
    // 1. THE ASSET LIBRARY WAS BEING TREATED AS THE APP SHELL. Nothing in
    //    public/ has to be in the precache: images and fonts are CacheFirst at
    //    runtime, so they land in the cache the first time they are used, and
    //    the app cannot work offline anyway (it is a live poker client on a
    //    Supabase realtime socket). Precaching 34.7 MB bought no offline
    //    capability anybody uses and charged it to the one moment that must not
    //    be slow — the tap on Enable Notifications, which is what registers
    //    this worker for a Club Arena player.
    //
    // 2. PRECACHING PAGE CHUNKS QUIETLY DEFEATED THE NetworkOnly RULE BELOW.
    //    `precacheAndRoute` registers its route FIRST, and workbox matches
    //    routes in registration order — so a precached
    //    /_next/static/chunks/pages/*.js was served from the precache and the
    //    NetworkOnly rule underneath it never got a look in. That rule is the
    //    Dan-fix/mobile-white-screen mitigation from PR #503: stale page chunks
    //    after a deploy are exactly what produces a blank page on signup and
    //    login. Dropping these entries is what makes that fix real.
    //
    // The rule is now an ALLOWLIST, not a growing denylist: precache the app
    // shell under /_next/ (minus page chunks), plus the handful of public/
    // files that genuinely belong to the shell. Anything else added to public/
    // in future is excluded by default instead of silently joining the install.
    //
    // `scripts/ci/check-sw-precache.mjs` enforces both halves against the
    // deployed worker: every entry must resolve, and the total must stay under
    // PRECACHE_BUDGET_MB. A 30 MB folder dropped into public/ now fails there
    // instead of quietly adding a minute to every first enrolment.
    // ─── THIS LINE IS WHAT KEEPS public/ OUT OF THE PRECACHE ───────────────
    //
    // next-pwa feeds the files it globs out of public/ into workbox as
    // `additionalManifestEntries`. Setting the option REPLACES that list — so
    // public/ becomes opt-in, and these are the only files from it that get
    // precached. Verified by building locally and reading the generated
    // public/sw.js: 200 public entries before, 6 after (five shell files plus
    // next-pwa's own custom worker, which it adds itself).
    //
    // Two things this is NOT, both learned the expensive way:
    //
    //   * It is not a `manifestTransform`. Workbox applies
    //     `additionalManifestEntriesTransform` LAST, after every user
    //     transform (workbox-build/build/lib/transform-manifest.js), so
    //     entries arriving this way are invisible to filtering. The first cut
    //     of this change filtered the page chunks correctly and left all 199
    //     public files in place for exactly that reason.
    //   * It is not `publicExcludes`. That option already exists further down
    //     this object as a build-cost denylist; adding a second one here was a
    //     duplicate key that JS silently resolved in favour of the other, and
    //     it did nothing either way.
    //
    // See scripts/pwa/public-shell-precache.js for why each file is on the
    // list — every one is bytes a person waits for before they can turn on
    // notifications, and one 404 among them takes web push down origin-wide.
    additionalManifestEntries: publicShellManifestEntries(__dirname),

    manifestTransforms: [
      async (manifest) => {
        const keep = (entry) => {
          const url = String(entry.url || '').split('?')[0];

          // Next emits this as a BUILD artifact and never serves it. One 404
          // is all it takes: workbox precaches atomically, so this single
          // entry is what killed install() and with it every web push on the
          // origin until 2026-08-29.
          if (/(^|\/)dynamic-css-manifest\.json$/.test(url)) return false;

          // NetworkOnly by policy — see (2) above.
          if (/\/chunks\/pages\//.test(url)) return false;

          return true;
        };

        return { manifest: manifest.filter(keep), warnings: [] };
      },
    ],
    runtimeCaching: [
      // ─── CRITICAL: Override next-pwa defaults that cause stale pages on mobile ───
      // next-pwa defaults use CacheFirst for /_next/static JS, which means mobile
      // browsers (especially Safari) serve old page JS from SW cache indefinitely.
      // These rules MUST come first to take priority over the library defaults.

      // Dan-fix/mobile-white-screen (2026-05-12): page JS chunks are now
      // NetworkOnly. The previous NetworkFirst+5s+24h-cache combo caused mobile
      // Safari/Chrome to serve stale chunks after deploys whose hashes no longer
      // matched the current HTML — producing a blank page on signup, login, and
      // other navigations. NetworkOnly means slightly slower offline mode but
      // zero post-deploy mismatches.
      {
        urlPattern: /\/_next\/static\/chunks\/pages\/.+\.js$/i,
        handler: 'NetworkOnly',
        options: {
          cacheName: 'page-js-chunks',
        },
      },
      // Next.js data routes — NetworkOnly (same reasoning as page JS above)
      {
        urlPattern: /\/_next\/data\/.+\/.+\.json$/i,
        handler: 'NetworkOnly',
        options: {
          cacheName: 'next-data',
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
      // Dan-fix/mobile-white-screen: HTML → NetworkOnly. Cached HTML can
      // reference page-JS chunks that no longer exist after a deploy → blank page.
      {
        urlPattern: ({ request, sameOrigin }) => sameOrigin && request.destination === 'document',
        handler: 'NetworkOnly',
        options: {
          cacheName: 'pages-html',
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
        urlPattern:
          /\/api\/(public|poker\/daily-tournaments|training\/leaderboard|arcade\/leaderboard)/,
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
        urlPattern:
          /\/api\/(auth|club-arena\/(?:cashout|mint|distribute|clawback)|poker\/engine)\//,
        handler: 'NetworkOnly',
        options: {
          cacheName: 'no-cache-auth',
        },
      },
    ],
  },
  buildExcludes: [/middleware-manifest\.json$/],
  // ─── Workbox precache scope (build-time cost + PWA correctness) ──────────────
  // The PWA plugin is active ONLY on Vercel (`disable: !process.env.VERCEL`
  // above), which is why local `next build` is fast and the Vercel build is not:
  // workbox globs and MD5-hashes every file under public/ to build the precache
  // manifest. public/ is currently ~682 MB across ~2,141 files, and none of it
  // needs to be precached — these are large media and a vendored club-arena
  // bundle that are fetched on demand.
  //
  // Precaching that volume is also wrong at runtime: browsers cap per-origin
  // storage well below 682 MB, so the service worker would evict or fail rather
  // than serve it. Excluding these directories keeps the precache to the small
  // set of shell assets that actually benefit from it.
  publicExcludes: [
    '!images/**/*',
    '!avatars/**/*',
    '!videos/**/*',
    '!cards/**/*',
    '!hub/club-arena/**/*',
    '!gto-panels/**/*',
    '!assets/**/*',
  ],
});

const nextConfig = {
  env: {
    BUILD_COMMIT_SHA: buildCommitSha,
  },

  // outputFileTracingRoot: require('path').join(__dirname),
  // StrictMode doubles renders/effects in dev, which doubles memory pressure on 952 pages.
  // Keep it ON for production builds where it helps catch bugs; OFF for dev stability.
  reactStrictMode: process.env.NODE_ENV === 'production',
  // Next.js 16 removed the top-level `eslint` build option; linting is run as
  // an independent CI/test concern. TypeScript handling remains below.
  compress: true, // Enable gzip compression for all responses

  // ─── Serverless Bundle Slimming ──────────────────────────────────────────────
  // 'standalone' output makes Next trace actual require()s and copies ONLY
  // what each API route / page needs into .next/standalone. On Vercel this
  // cuts the serverless function zipped bundle ~40% and drops cold-start p50
  // from ~1.8s to ~1.1s on a 950-page repo. Safe for Pages Router. Don't set
  // this in dev — dev uses the default server.
  // MEASURED AND PUT BACK 2026-09-09. The hypothesis was that Vercel's own Next
  // builder traces output and does not consume .next/standalone, so setting it
  // here might be a second trace over 1,324 packages for an artifact nothing
  // reads. The experiment reached production by accident (see below) and
  // answered the question anyway:
  //
  //   standalone OFF  dpl_C6VAk6  build 259.3s, READY, no failure
  //   standalone ON   dpl_EzRgt7  build 190.1s
  //
  // Not a controlled A/B - different trees, different cache states - but there
  // is no sign of a win, and it is not free to find out: turning it off is a
  // change to how production is packaged. It stays as it was.
  output: process.env.VERCEL ? 'standalone' : undefined,

  // ─── R3F Package Transpilation ───────────────────────────────────────────────
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
  transpilePackages: [
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/postprocessing',
    '@smarter-poker/commander-shared',
  ],

  // ─── Build Memory Optimization ───────────────────────────────────────────────
  // With 950+ pages, the build needs memory-efficient compilation.
  //
  // CORRECTED 2026-09-08. This comment used to describe `workerThreads` as if it
  // were configured here. It is not, and never was - grep the file: the word
  // appears only in this paragraph. So the warning it carried ("CRITICAL: only
  // enable in production - in dev mode it deletes vendor chunks mid-request")
  // was guarding a setting that does not exist, while reading like a decision
  // somebody had made. It is left recorded, as a reason NOT to add the flag, not
  // as a description of the config.
  //
  // What is actually set is `experimental.cpus`, below.
  // ─── Server External Packages (OOM FIX) — moved from experimental in Next 16 ──
  // `experimental.serverComponentsExternalPackages` was promoted to a stable top-level
  // key `serverExternalPackages` in Next.js 15+. Using the old path causes a build warning
  // and the setting is silently ignored. Moved here so it actually takes effect.
  serverExternalPackages: [
    'puppeteer',
    'puppeteer-extra',
    'puppeteer-extra-plugin-stealth',
    'canvas',
    'phaser',
    'pg',
    'pg-protocol',
    'sharp',
    'pdf-parse',
    'twilio',
    'jspdf',
    'jspdf-autotable',
    'docx',
    'livekit-server-sdk',
    'posthog-node',
    '@sentry/node',
    // ffmpeg/ffprobe ship native binaries — must NOT be webpacked.
    // Used by /api/cron/transcode-videos to convert HEVC → H.264 MP4.
    '@ffmpeg-installer/ffmpeg',
    '@ffprobe-installer/ffprobe',
    // Platform-specific packages imported directly by transcode-videos.js.
    // Importing linux-x64 directly (instead of the parent wrapper) limits
    // nft tracing to one binary (~50MB) instead of all 8 platforms (~670MB).
    '@ffmpeg-installer/linux-x64',
    '@ffprobe-installer/linux-x64',
  ],

  // ─── Output File Tracing — Serverless Bundle Exclusions ─────────────────
  // Excludes heavy packages AND all non-linux ffmpeg/ffprobe platform binaries
  // from every serverless function bundle.
  //
  // CRITICAL — ffmpeg/ffprobe size fix (2026-05-19):
  // @ffmpeg-installer and @ffprobe-installer ship binaries for darwin-arm64,
  // darwin-x64, win32-ia32, win32-x64, linux-arm, linux-arm64, AND linux-x64.
  // Vercel ONLY builds on linux-x64 — all other platform directories are dead
  // weight. Without these exclusions, Next.js file tracing pulls ALL platform
  // binaries into the api/cron/transcode-videos function → 670MB → exceeds the
  // 300MB Vercel serverless function limit.
  // Excluding non-linux platforms brings the function down to ~160MB.
  //
  // Works in concert with experimental.outputFileTracingIncludes (below) which
  // positively selects the linux-x64 binaries for the transcode-videos route.
  //
  // NOTE: These options are webpack/nft-specific and are ignored by Turbopack.
  // The prune script (scripts/prune-platform-bins.sh) physically deletes non-linux
  // binaries before the build runs, ensuring Turbopack also cannot bundle them.
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
      // Exclude ALL non-linux platform ffmpeg/ffprobe binaries.
      // Vercel builds exclusively on linux-x64 — darwin and win32 binaries
      // are pure dead weight that inflate every serverless function bundle.
      'node_modules/@ffmpeg-installer/darwin-arm64/**',
      'node_modules/@ffmpeg-installer/darwin-x64/**',
      'node_modules/@ffmpeg-installer/win32-ia32/**',
      'node_modules/@ffmpeg-installer/win32-x64/**',
      'node_modules/@ffmpeg-installer/linux-arm/**',
      'node_modules/@ffmpeg-installer/linux-arm64/**',
      'node_modules/@ffprobe-installer/darwin-arm64/**',
      'node_modules/@ffprobe-installer/darwin-x64/**',
      'node_modules/@ffprobe-installer/win32-ia32/**',
      'node_modules/@ffprobe-installer/win32-x64/**',
      'node_modules/@ffprobe-installer/linux-arm/**',
      'node_modules/@ffprobe-installer/linux-arm64/**',
    ],

    // ─── API routes: never trace client-only UI libraries ────────────────────
    // "Collecting build traces" walks the dependency closure of EVERY function.
    // With 582 API routes against a 1.5 GB node_modules that phase dominates the
    // build. None of these packages is imported by anything under pages/api
    // (verified by grep before adding — `three` IS imported by 2 API routes and
    // is deliberately NOT listed here). Excluding them cuts both trace time and
    // the size of every serverless function bundle.
    //
    // Scoped to 'pages/api/**' on purpose: these libraries ARE needed by SSR'd
    // pages, so excluding them under '*' would break page rendering at runtime.
    'pages/api/**': [
      'node_modules/posthog-js/**',
      'node_modules/lucide-react/**',
      'node_modules/framer-motion/**',
      'node_modules/@react-three/**',
      'node_modules/recharts/**',
    ],
  },

  // ─── Output File Tracing — INCLUDE linux-x64 binaries for transcode cron ──
  // transcode-videos.js imports @ffmpeg-installer/linux-x64 and
  // @ffprobe-installer/linux-x64 DIRECTLY. nft traces only those packages
  // (~50 MB each) instead of the parent wrapper that pulls all 8 platform
  // binaries (~670 MB total).
  outputFileTracingIncludes: {
    'pages/api/cron/transcode-videos': [
      'node_modules/@ffmpeg-installer/linux-x64/**/*',
      'node_modules/@ffprobe-installer/linux-x64/**/*',
    ],
  },
  experimental: {
    // NOTE: cpus is a webpack-specific option; Turbopack ignores it harmlessly.
    // Retained so that any webpack fallback invocation still benefits from it.
    // Derivation, and the two incidents behind it, are at resolveBuildCpus().
    // BUILD_CPUS=<n> still overrides, and BUILD_CPUS=1 remains the escape hatch.
    cpus: resolveBuildCpus(),
    // instrumentationHook removed — no longer an experimental key in Next.js 16.
    // instrumentation.js is loaded by default; the old flag is ignored (causes
    // "Unrecognized key" build warning). No replacement needed.
  },
  // ─── Dev Server Memory Management ──────────────────────────────────────────────
  // With 952 pages, the dev server compiles pages on-demand and keeps them in memory.
  // [HARDENED] Keep a reasonable number of pages hot — enough to avoid recompilation
  // thrashing, but not so many that it wastes GB of RAM on a 950+ page codebase.
  // Previous: 128 pages / 24h — consumed 2-4 GB keeping unused pages warm.
  onDemandEntries: {
    maxInactiveAge: 2 * 60 * 60 * 1000, // Dispose compiled pages after 2h of inactivity
    pagesBufferLength: 16, // Keep 16 pages hot in memory (sufficient for active dev)
  },

  // ─── TypeScript Build Config ──────────────────────────────────────────────────
  // Next.js 16 no longer accepts an eslint build option. Keep TypeScript's
  // independently supported build-error setting here.
  typescript: {
    ignoreBuildErrors: true,
  },

  // ─── Ultimate Dev Server Hardening ──────────────────────────────────────────────
  // Next 14.2.3 handles 950+ pages heavily. Webpack natively monitors node_modules
  // which burns CPU and memory. We aggressively ignore 300,000+ unneeded files.
  // NOTE: `--webpack` flag in vercel.json buildCommand forces webpack bundler on
  // Vercel (bypasses any Turbopack project setting). This webpack() callback
  // applies to both Vercel production builds AND local dev builds.
  // It sets HMR watchOptions and resolve aliases needed for local development.
  turbopack: {},
  webpack: (config, { dev, isServer }) => {
    // ─── Supabase Client Resolution Fix ─────────────────────────────────────────
    // Both supabase.ts (real client) and supabase.js (Node ESM test mock) exist
    // in src/lib/. Without this alias, imports with explicit .js extension
    // (e.g. from decision-bridge.js) resolve to the mock and crash the app.
    // This forces ALL imports of supabase.js to use the real .ts client instead.
    const path = require('path');
    config.resolve.alias = Object.assign(config.resolve.alias || {}, {
      [path.resolve(__dirname, 'src/lib/supabase.js')]: path.resolve(
        __dirname,
        'src/lib/supabase.ts'
      ),
      // ─── authUtils.js → authUtils.ts ───────────────────────────────────────
      // CORRECTED 2026-08-12: the note below described src/lib/authUtils.js as
      // "a 136-byte stub". That has not been true for some time — it is now a
      // ~31KB file carrying its own full implementations. The alias is still
      // correct (getFreshAccessToken lives only in the .ts file), but the
      // consequence was missed: aliasing means the .ts version of EVERY shared
      // export wins, including ones the .js file implemented properly.
      //
      // That silently swapped ensureAuthReady for a `Promise<void>` stub and
      // broke six auth-gated flows (audit C-8). authUtils.ts:ensureAuthReady
      // now implements the real contract. Before adding an export to the .js
      // file, implement it in the .ts file instead — the .js version is not
      // what ships.
      //
      // Original note follows:
      // src/lib/authUtils.js re-exports from
      // @smarter-poker/commander-shared, which does NOT export
      // getFreshAccessToken (introduced 2026-04-30 locally in authUtils.ts).
      // Without this alias, webpack resolves the import path
      // '../../lib/authUtils' to the .js stub (.js takes precedence over
      // .ts in module resolution), so consumer components — LiveDiamondGift,
      // EndStreamModal, LiveActivityFeed — get an empty namespace and
      // (0,s.getFreshAccessToken) is undefined at runtime. Force resolution
      // to the .ts file where the function actually lives.
      [path.resolve(__dirname, 'src/lib/authUtils.js')]: path.resolve(
        __dirname,
        'src/lib/authUtils.ts'
      ),
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
      // stale .next corruption by excluding .next from the watcher).
    }
    return config;
  },

  // swcMinify removed — deprecated in Next.js 15+ (SWC is the only minifier;
  // the flag is no longer recognized and causes an "Unrecognized key" build warning)

  // Removed generateBuildId override:
  // Hardcoding the build ID in development (e.g. 'dev-stable-v2') causes Next.js Fast Refresh
  // to enter an infinite reload loop when the .next cache is cleared, because the browser HMR
  // client expects the old Webpack hash but the server generates a new one.

  // ─── next/image Optimization ───────────────────────────────────────────────
  // Allows next/image to serve optimized WebP/AVIF from these external domains.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'kuklfnapbkmacvwxktbh.supabase.co' }, // Supabase storage (avatars, uploads)
      { protocol: 'https', hostname: '*.supabase.co' }, // Any Supabase project
      { protocol: 'https', hostname: 'images.unsplash.com' }, // Fallback stock photos
      { protocol: 'https', hostname: 'smarter.poker' }, // Platform CDN
      { protocol: 'https', hostname: 'diamond.smarter.poker' }, // Diamond assets
      { protocol: 'https', hostname: 'auth.smarter.poker' }, // Supabase auth + storage proxy (avatars, logos)
      { protocol: 'https', hostname: '*.smarter.poker' }, // Catch-all for platform sub-domains
      { protocol: 'https', hostname: 'api.qrserver.com' }, // QR code generation
      { protocol: 'https', hostname: 'img.youtube.com' }, // YouTube thumbnails
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

  // ─── HTTP Security Headers ──────────────────────────────────────────────────
  // Applied to all routes. CSP is in Report-Only mode: violations are logged
  // to the browser console without breaking any functionality. Once violations
  // have been monitored and confirmed zero, switch to Content-Security-Policy.
  //
  // External resources catalogued:
  //   fonts.googleapis.com, fonts.gstatic.com  — Google Fonts
  //   storage.googleapis.com                   — Supabase storage CDN
  //   maps.googleapis.com                      — Google Maps
  //   server.arcgisonline.com                  — Poker Near Me dark basemap tiles
  //   *.supabase.co                            — Supabase DB + auth + storage
  //   (onesignal.com removed 2026-08-29 — vendor retired 2026-08-19)
  //   cdn.jsdelivr.net, unpkg.com              — jsQR, tessaract.js, Leaflet
  //   api.giphy.com, media.giphy.com           — GIF search
  //   livekit.smarter.poker, *.livekit.cloud  — LiveKit voice/video
  //   *.smarter.poker                          — Platform sub-domains
  async headers() {
    const csp = [
      "default-src 'self'",
      // Scripts: self + OneSignal SDK + Google Maps + jsDelivr + unpkg (Leaflet/jsQR)
      // OneSignal removed from this policy 2026-08-29, with the last loader
      // that needed it (Club Arena's index.html injected the v16 SDK on every
      // session until that day, ten days after the vendor was retired). Three
      // allowances that would otherwise have been carried into an enforced
      // policy for a script nothing loads.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://maps.googleapis.com https://cdn.jsdelivr.net https://unpkg.com",
      // Styles: self + inline + Google Fonts
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com https://cdn.jsdelivr.net",
      // Fonts: Google Fonts CDN
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: self + Supabase + Google Storage + Maps static + QR + YouTube thumbs + Giphy + data URIs
      "img-src 'self' data: blob: https://*.supabase.co https://*.smarter.poker https://storage.googleapis.com https://maps.googleapis.com https://maps.gstatic.com https://server.arcgisonline.com https://api.qrserver.com https://img.youtube.com https://media.giphy.com https://*.giphy.com https://images.unsplash.com",
      // Connections: API calls to Supabase, OneSignal, Google Maps (geocode), Giphy, LiveKit
      //
      // Sentry added 2026-08-29. It was MISSING, and this policy is Report-Only,
      // so the only symptom was a line in the console that nobody reads:
      //
      //   Connecting to 'https://o4510810580779008.ingest.us.sentry.io/api/.../envelope/'
      //   violates the following Content Security Policy directive: "connect-src ..."
      //   The policy is report-only, so the violation has been logged but no
      //   further action has been taken.
      //
      // That is a loaded gun. The comment above this block says the plan is to
      // "switch to Content-Security-Policy" once violations are zero — and the
      // moment anybody does that, every Sentry envelope on the platform is
      // blocked and error reporting goes silently dark, which is the single
      // worst thing to lose at exactly the moment you have just changed a
      // security header. Wildcarded across both ingest domains because the
      // region prefix moves with the project.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://maps.googleapis.com https://api.giphy.com https://*.livekit.cloud wss://*.livekit.cloud https://smarter.poker https://*.smarter.poker wss://*.smarter.poker https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
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
      // NOTE: upgrade-insecure-requests deliberately does NOT live here. See
      // the enforced header below — inside a Report-Only policy the browser
      // ignores it and says so, on every single page load.
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
          ...(process.env.VERCEL
            ? [
                {
                  /**
                   * Dan 2026-08-20: upgrade-insecure-requests used to sit inside the
                   * Report-Only policy above, where it did NOTHING. The spec says the
                   * directive is ignored in report-only mode, and Chrome announces
                   * that on every page load:
                   *
                   *   "The Content Security Policy directive
                   *    'upgrade-insecure-requests' is ignored when delivered in a
                   *    report-only policy."
                   *
                   * So the one directive in that policy meant to CHANGE behaviour was
                   * the one directive guaranteed not to, while adding a console error
                   * to every route (it was also tripping the E2E console-error specs).
                   *
                   * Delivered on its own enforced header it actually applies, and the
                   * rest of the policy stays report-only as the staged rollout above
                   * intends. Enforcing this alone is safe here: it only rewrites
                   * http:// SUB-RESOURCE requests to https://, the site is already
                   * HSTS-preloaded with includeSubDomains, and Vercel redirects
                   * http->https at the edge — so in practice it catches stray http
                   * URLs in user-generated content and nothing else.
                   *
                   * Vercel-only is intentional. `next start` serves HTTP locally;
                   * WebKit correctly applies this directive there and upgrades every
                   * same-origin chunk to HTTPS, leaving the page blank and making a
                   * real Safari CI pass impossible. Vercel always serves HTTPS, so
                   * production retains the enforced policy while localhost remains
                   * a faithful runnable test target.
                   */
                  key: 'Content-Security-Policy',
                  value: 'upgrade-insecure-requests',
                },
              ]
            : []),
        ],
      },
      // ─── CLUB ARENA CACHE POLICY (perf pass 2026-08-22) ─────────────────────
      //
      // ⚠ READ BEFORE EDITING ANYTHING BELOW: for `/hub/**`, THESE RULES DO
      // NOT DECIDE WHAT PRODUCTION SENDS. vercel.json carries its own
      // overlapping `/hub/...` header rules and wins. Measured live on
      // 2026-08-23:
      //
      //   /hub/club-arena/images/tiles/cashier-v8.jpg
      //       served  stale-while-revalidate=86400   (vercel.json)
      //       here we ask for                 604800  ← ignored
      //   /hub/club-arena/sw-bus.js
      //       served  no-cache, no-store, must-revalidate  (vercel.json's
      //               blanket /hub/ rule)
      //       here we ask for  no-cache, must-revalidate   ← ignored
      //
      // This cost a whole change: PR #662 added an immutable rule here for
      // the content-hashed fonts stylesheet, merged green, and production
      // kept serving no-store — because vercel.json's blanket `/hub/(...)`
      // rule excludes assets|images|videos|cards|sounds|club-logos but not
      // fonts/. The working fix (#670) had to go in vercel.json instead.
      //
      // So: edit the matching rule in **vercel.json**, and always confirm
      // with `curl -sI` against production rather than trusting a green
      // deploy. These entries are kept because they are correct in intent
      // and are the fallback if the vercel.json rules are ever removed.
      //
      // Vercel serves public/ files with `max-age=0, must-revalidate` by
      // default, so every Club Arena page load was re-validating ~500 hashed
      // bundle files + 60MB of media — dozens of round-trips per visit, the
      // single biggest cause of the slow loads. The bundle filenames carry a
      // content hash (assets/[name]-[hash]-v6.*), so they are immutable by
      // construction: cache them for a year. A new deploy changes the hashes
      // in index.html (which stays must-revalidate), so users always pick up
      // new code on the next navigation.
      // Next.js content-hashes ALL files under /_next/static/ at build time
      // (the build ID is part of the path), so they are safe to cache for 1 year.
      // Without this, Vercel serves them with max-age=0, must-revalidate, forcing
      // a round-trip revalidation on EVERY page navigation — the root cause of
      // slow /hub/news, /hub/friends, /hub/leaderboards etc. clicks.
      // NOTE: The matching rule in vercel.json takes precedence. This entry is a
      // fallback in case vercel.json rules are ever removed.
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/hub/club-arena/assets/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Club Arena media (cards, tiles, icons, logos, videos): stable URLs,
      // art changes rarely. 30 days fresh + a week of stale-while-revalidate
      // means repeat visits render cards and the lobby from disk instantly.
      {
        source: '/hub/club-arena/:dir(cards|images|game-card-icons|club-logos|videos)/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=604800',
          },
        ],
      },
      // Apex /cards/ (hub game-card art + the legacy replay card set) gets the
      // same media policy.
      {
        source: '/cards/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=604800',
          },
        ],
      },
      // Club Arena self-hosted fonts stylesheet. The build content-hashes it
      // (fonts-<hash>.css, club-arena scripts/self-host-fonts.mjs), so it is
      // immutable like the hashed assets above. Scoped to the fonts-* name
      // ON PURPOSE: the legacy un-hashed fonts.css must keep revalidating,
      // because shells the service worker cached before the hash change
      // still reference it and its content changes per deploy. The woff2
      // files themselves are already immutable via vercel.json.
      {
        source: '/hub/club-arena/fonts/:file(fonts\\-.*\\.css)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // The Club Arena service worker script must ALWAYS revalidate — a stale
      // SW script would pin an old cache policy on players' devices.
      {
        source: '/hub/club-arena/sw-bus.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, must-revalidate',
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
      // /privacy is a real, server-rendered page since 2026-09-08 (the app
      // stores read the privacy policy URL with a crawler, and the tab inside
      // /terms is client-rendered). Only the legacy alias redirects now.
      { source: '/legal/privacy', destination: '/privacy', permanent: true },
      { source: '/legal/terms', destination: '/terms', permanent: true },
      // Live help → messenger with Jarvis
      { source: '/hub/live-help', destination: '/hub/messenger?chat=jarvis', permanent: false },
      // Club Arena — /hub/club-arena IS the lobby (the SPA). The native lobby.js was removed.
      { source: '/hub/club-arena/lobby', destination: '/hub/club-arena', permanent: true },
      // Redirect legacy/broken Club Arena share links to the correct SPA mount point
      { source: '/clubs/:slug*', destination: '/hub/club-arena/clubs/:slug*', permanent: true },
      { source: '/tournaments/:id*', destination: '/hub/club-arena/tournaments/:id*', permanent: true },
      { source: '/invite/:id*', destination: '/hub/club-arena/invite/:id*', permanent: true },
      { source: '/profile/:id*', destination: '/hub/club-arena/profile/:id*', permanent: true },
      { source: '/replay/:id*', destination: '/hub/club-arena/replay/:id*', permanent: true },
      { source: '/share/hand/:id*', destination: '/hub/club-arena/share/hand/:id*', permanent: true },
      // Legacy avatar page names (Club Arena's ProfilePage/AvatarService still
      // link to /hub/avatars-complete, which no longer exists as a page)
      { source: '/hub/avatars-complete', destination: '/hub/avatars', permanent: true },
      { source: '/hub/avatars-standalone', destination: '/hub/avatars', permanent: true },
      // Memory Games → Preflop Charts (renamed April 2026)
      { source: '/hub/memory-games', destination: '/hub/preflop-charts', permanent: true },
      {
        source: '/hub/memory-games/:path*',
        destination: '/hub/preflop-charts/:path*',
        permanent: true,
      },
      // ── Marketplace → Diamond Store (edge-level 308, replaces client-side JS redirect) ──
      // /hub/marketplace previously used a React component with router.replace() costing
      // 2-3 round-trips (HTML download + JS parse + client navigate). A build-time permanent
      // redirect serves a 308 from the edge with zero JS overhead.
      { source: '/hub/marketplace', destination: '/hub/diamond-store', permanent: true },
      {
        source: '/hub/marketplace/:path*',
        destination: '/hub/diamond-store/:path*',
        permanent: true,
      },
      // ── Poker Near Me URL Migration (April 2026) ────────────────────────────────────────
      // Old lobby URL → new canonical lobby sub-route (301 permanent redirect)
      {
        source: '/hub/poker-near-me-lobby',
        destination: '/hub/poker-near-me/lobby',
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return {
      // Club Arena (rewritten 2026-09-03). The Vite SPA no longer lives in this
      // repo's public/ tree. It is published by its own repo to a static
      // origin (Caddy on estate-ci-1, ca-static.smarter.poker), and this ONE
      // rewrite proxies it: the player is still on smarter.poker - the browser
      // never sees the origin's hostname, so the shared Supabase session
      // (localStorage key smarter-poker-auth) is untouched - but Vercel fetches
      // the bytes from the origin instead of from a 1,383-file copy that had
      // to be committed here and rebuilt (4-5 minutes) on every Club Arena
      // merge. The origin does SPA fallback itself (an extension-less path
      // gets index.html; a missing asset is a real 404), and sets the same
      // Cache-Control the headers() block above sets, so caching is preserved
      // at both Vercel's edge and the browser.
      //
      // afterFiles, not beforeFiles: a native Next.js page or public/ file
      // under /hub/club-arena/ would still win, and none is meant to exist -
      // tests/club-arena-is-a-rewrite.test.mjs pins that the tree is gone.
      beforeFiles: [],
      afterFiles: [
        /* THE CLUB ARENA APP (2026-09-08). iOS and Android verify that this
           origin wants the app to open /hub/club-arena/* by fetching these two
           files. They are API routes, not files in public/, because their
           contents are Dan's credentials (Apple Team ID, Android release cert
           SHA-256) read from the environment at request time: a 404 until
           they exist, live the moment they are set. src/lib/app-links.js. */
        { source: '/.well-known/apple-app-site-association', destination: '/api/app-links/aasa' },
        { source: '/.well-known/assetlinks.json', destination: '/api/app-links/assetlinks' },
        { source: '/hub/club-arena', destination: 'https://ca-static.smarter.poker/index.html' },
        { source: '/hub/club-arena/:path*', destination: 'https://ca-static.smarter.poker/:path*' },
        /* AD CREATIVES ARE SAME-ORIGIN (2026-09-03). A club owner's advert
           picture is uploaded to the `ad-creatives` storage bucket and stored
           on the campaign as `/ad-creatives/club/<club id>/<file>` - a rooted
           path on smarter.poker, never the bucket's own hostname. That is what
           lets the three same-origin locks on ad images (the ad_catalog CHECK,
           this repo's house-ads readSitePath, and isSafeAdImage at render)
           keep refusing anything that would hand a player's IP to another
           host. This rewrite is where the path actually resolves. The bucket
           is public-read; writes are storage-RLS'd to the club's own staff.
           Pinned by __tests__/house-ads-hub-promotions.test.mjs. */
        {
          source: '/ad-creatives/:path*',
          destination:
            'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/ad-creatives/:path*',
        },
        /* THE AD CLICK REDIRECT (2026-09-09). A sponsor's advert points at
           /c/<code> - a rooted, same-origin path, so every same-origin check
           on ad destinations still sees what it has always seen. The handler
           takes the opaque code, asks the database for the address approved
           against it, records the click server-side and 302s. It accepts no
           URL, which is what makes an open redirect structurally impossible.
           Short path rather than /api/c/ because it is what a player's browser
           shows for a moment on the way out. */
        {
          source: '/c/:code',
          destination: '/api/c/:code',
        },
      ],
      fallback: [],
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
// [2026-07-25] APPLY the PWA wrapper. It was constructed above with the
// carefully-tuned NetworkOnly runtimeCaching rules (the "Dan-fix mobile
// white-screen" mitigations), but the export line read `module.exports =
// nextConfig`, so withPWA was never applied and NONE of the service-worker /
// caching config took effect in production. Wrapping here activates it.
// withPWA already self-disables when not on Vercel (`disable: !process.env.VERCEL`),
// so local `next dev` is unaffected. withSentryConfig stays intentionally
// bypassed (build-time OOM); runtime Sentry is wired via src/instrumentation*.js.
const pwaConfig = withPWA(nextConfig);
module.exports = pwaConfig;
