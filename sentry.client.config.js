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

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

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
      // Terser minifier mangling — pre-fixed but belt-and-suspenders
      'D is not defined',
    ],

    // Before sending, scrub sensitive data and filter noise
    beforeSend(event, hint) {
      const error = hint?.originalException;

      // Filter AbortError by name (catches all abort variants)
      if (error && typeof error === 'object') {
        if ('name' in error && String(error.name) === 'AbortError') return null;
        if ('message' in error) {
          const msg = String(error.message);
          if (msg.includes('signal is aborted') || msg.includes('aborted')) return null;
          if (msg.includes('Internal error')) return null;
        }
        // Filter extension errors
        if ('stack' in error) {
          const stack = String(error.stack);
          if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return null;
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

    // Tag all Club Commander errors
    initialScope: {
      tags: {
        app: 'club-commander',
      },
    },
  });

  console.log('Sentry initialized (client)');
} else {
  console.log('Sentry DSN not configured - error tracking disabled');
}
