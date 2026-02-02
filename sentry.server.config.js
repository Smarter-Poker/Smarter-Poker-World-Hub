/**
 * Sentry Server Configuration
 * Reference: IMPLEMENTATION_PHASES.md - Phase 6
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Only enable in production
    enabled: process.env.NODE_ENV === 'production',

    // Before sending, scrub sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      return event;
    },

    // Tag all Club Commander errors
    initialScope: {
      tags: {
        app: 'club-commander',
        runtime: 'server',
      },
    },
  });

  console.log('Sentry initialized (server)');
}
