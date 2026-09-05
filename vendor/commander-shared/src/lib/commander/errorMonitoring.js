/**
 * Error Monitoring Utilities (Club Commander)
 * ═══════════════════════════════════════════════════════════════════════════
 * 2026-09-04: this file used to carry its own optional Sentry.init()
 * (initErrorMonitoring). Nothing ever called it, so the `Sentry` handle below
 * was always null and every function here was already a console logger plus,
 * for venue-scoped errors, a record_health_metric RPC. The dead Sentry branch
 * and initErrorMonitoring are gone (docs/SENTRY-FREE-TIER-POLICY.md, section
 * 5). Sentry on the World Hub is server-only and reached through
 * lib/sentryWrap.js reportApiError(), never from here.
 *
 * CommanderErrorBoundary requires captureException() from this module; keep
 * that export.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Capture an exception
 */
export function captureException(error, context = {}) {
  console.warn('Error captured:', error.message, context);


  // Also log to system health if venue context is available
  if (context.venue_id) {
    recordErrorMetric(context.venue_id, error, context);
  }

  return error;
}

/**
 * Capture a message
 */
export function captureMessage(message, level = 'info', context = {}) {
  console.debug(`[${level.toUpperCase()}] ${message}`, context);

}

/**
 * Set user context for error tracking
 */
export function setUserContext(_user) {
  // No-op since 2026-09-04: there is no client Sentry to attach a user to.
}

/**
 * Clear user context
 */
export function clearUserContext() {
  // No-op since 2026-09-04: there is no client Sentry to clear.
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message, category = 'default', data = {}) {
  // Kept for callers; there is no Sentry here to receive it.
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[breadcrumb:${category}] ${message}`, data);
  }
}

/**
 * Record error metric to system health
 */
async function recordErrorMetric(venueId, error, context = {}) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase.rpc('record_health_metric', {
      p_venue_id: parseInt(venueId),
      p_metric_type: 'error_rate',
      p_metric_value: 1,
      p_metric_unit: 'count',
      p_endpoint: context.endpoint || null,
      p_details: {
        error_message: error.message,
        error_name: error.name,
        action: context.action
      }
    });
  } catch (err) { console.warn('[App] Handled exception:', err?.message || err); }
}

/**
 * Performance monitoring wrapper
 */
export function withPerformanceMonitoring(handler, operationName) {
  return async (req, res) => {
    const startTime = Date.now();

    try {
      const result = await handler(req, res);

      // Record latency
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        captureMessage(`Slow operation: ${operationName}`, 'warning', {
          extra: { duration, url: req.url }
        });
      }

      return result;
    } catch (error) {
      captureException(error, {
        action: operationName,
        extra: { url: req.url, method: req.method }
      });
      throw error;
    }
  };
}

/**
 * API error handler wrapper
 */
export function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      captureException(error, {
        extra: {
          url: req.url,
          method: req.method,
          query: req.query,
          body: req.body ? JSON.stringify(req.body).substring(0, 500) : null
        }
      });

      // Don't expose internal errors to clients
      const statusCode = error.statusCode || 500;
      const message = statusCode === 500
        ? 'An unexpected error occurred'
        : error.message;

      return res.status(statusCode).json({
        error: message,
        code: error.code || 'INTERNAL_ERROR'
      });
    }
  };
}
