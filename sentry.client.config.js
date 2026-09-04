/**
 * Sentry Client Configuration
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 *
 * SETUP REQUIRED (Antigravity):
 * 1. Create Sentry account at https://sentry.io
 * 2. Create a new project (Next.js)
 * 3. Get DSN from project settings
 * 4. Add to environment variables:
 *    - NEXT_PUBLIC_SENTRY_DSN (for client)
 *    - SENTRY_DSN (for server)
 *    - SENTRY_AUTH_TOKEN (for source maps, optional)
 * 5. Run: npm install @sentry/nextjs
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN || '').trim();

if (SENTRY_DSN) {
  // 2026-09-04: GlobalErrorCatcher.jsx:82/118, _app.js reportWebVitals and
  // useYouTubeErrorManager.js:63 all guard on `window.Sentry`. The npm SDK does
  // not self-attach that global (only the CDN loader does), so all three have
  // been silently no-op since they were written: the entire uncaught-error and
  // unhandled-rejection net reached nothing. Assign it so they work.
  if (typeof window !== 'undefined') {
    window.Sentry = Sentry;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Attribute every event to a deploy. withSentryConfig is bypassed for the
    // 8GB Vercel OOM, so nothing sets this automatically.
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || undefined,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session Replay (optional)
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Filter out non-actionable errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Network errors
      'Network Error',
      'Failed to fetch',
      'Load failed',
      // User-caused
      'Non-Error promise rejection',
      // AbortError — benign fetch/signal cancellation (navigation, unmount)
      'AbortError',
      'signal is aborted without reason',
      'signal is aborted',
      'The operation was aborted',
      'The user aborted a request',
      // Opaque internal errors (browser internals / IndexedDB)
      'UnknownError: Internal error',
      'Internal error',
      // Minified Supabase/library internal errors (not actionable)
      'r.error is not a function',
      // Next.js router invariant — same-URL push (Commander login redirects)
      'Invariant: attempted to hard navigate to the same URL',
      // SWC/Terser minifier mangling — TDZ errors from variable name collisions
      // Covers: "D is not defined", "user is not defined", "isPoker is not defined"
      /^ReferenceError: \w+ is not defined$/,
      /Cannot access '\w+' before initialization/,
      // Stale chunk errors — users with cached old JS bundles referencing
      // functions that no longer exist after a deploy
      'setEntries is not defined',
      'setCustomMinutes is not defined',
      'selectedGameMode is not defined',
      'user is not defined',
      'isPoker is not defined',
      'D is not defined',
      // Next.js static props prefetch failures (transient network issues)
      'Failed to load static props',
      // Screen wake lock permission errors (non-critical)
      'not granted',
    ],

    // Before sending, scrub sensitive data and filter noise
    beforeSend(event, hint) {
      const error = hint?.originalException;

      // ── Vercel Live Feedback instrument.js errors ──
      // These come from Vercel's injected feedback overlay, not our code
      const frames = event?.exception?.values?.[0]?.stacktrace?.frames;
      if (frames?.some(f => typeof f.filename === 'string' && f.filename.includes('_next-live/feedback/instrument'))) return null;

      // Filter AbortError by name (catches all abort variants)
      if (error && typeof error === 'object') {
        if ('name' in error && String(error.name) === 'AbortError') return null;
        if ('message' in error) {
          const msg = String(error.message);
          if (
            msg.includes('signal is aborted') ||
            msg.includes('The operation was aborted') ||
            msg.includes('The user aborted a request')
          )
            return null;
          if (msg.includes('Internal error')) return null;
          if (msg.includes('Invariant: attempted to hard navigate')) return null;
          // SWC/Terser TDZ: "Cannot access 'X' before initialization"
          if (/Cannot access '\w+' before initialization/.test(msg)) return null;
          // 2026-09-04: this was an unanchored substring test, so it deleted every
          // "X is not defined" - which is precisely the shape a minified bundle
          // produces, and source maps are not uploaded (next.config.js:1100).
          // The anchored form and the known stale-chunk symbols are already in
          // ignoreErrors above; this blanket drop only removed real bugs.
          // Next.js static props prefetch failures
          if (msg.includes('Failed to load static props')) return null;
        }
        // Filter extension errors
        if ('stack' in error) {
          const stack = String(error.stack);
          if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return null;
          // Vercel Live feedback overlay errors
          if (stack.includes('_next-live/feedback/instrument')) return null;
        }
      }

      // Remove PII from URLs
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/token=[^&]+/g, 'token=REDACTED');
      }

      // Remove cookies
      if (event.request?.cookies) {
        delete event.request.cookies;
      }

      // Remove authorization headers
      if (event.request?.headers?.authorization) {
        event.request.headers.authorization = '[REDACTED]';
      }

      return event;
    },

    // Tag all WH client errors.
    // Club Commander gets its own sub-tag via withSentry per-page where
    // finer-grained scoping is needed.
    initialScope: {
      tags: {
        app: 'world-hub',
        runtime: 'client',
      },
    },
  });

  console.log('Sentry initialized (client)');
} else {
  console.log('Sentry DSN not configured - error tracking disabled');
}
