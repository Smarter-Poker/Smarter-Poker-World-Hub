/**
 * Sentry Error Monitoring Service
 * Centralized error tracking and reporting for Smarter.Poker
 *
 * Setup: Add NEXT_PUBLIC_SENTRY_DSN to environment variables
 *
 * IMPORTANT: Uses a static import of @sentry/nextjs.
 * - In Node.js contexts: uses the full server bundle
 * - In Edge Runtime contexts: webpack automatically resolves to @sentry/nextjs/edge
 *   via the package.json "edge" export condition
 * - No dynamic require() — avoids all webpack bundling errors
 */

import * as SentrySDK from '@sentry/nextjs';

/**
 * Check if running in Edge Runtime
 */
function isEdgeRuntime() {
    return typeof EdgeRuntime !== 'undefined' || (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'edge');
}

/**
 * Get the Sentry SDK instance — edge-safe guard.
 * In edge context returns the edge-compatible SDK.
 * In browser context returns null (no server-side Sentry in browser).
 */
function getSentry() {
    if (typeof window !== 'undefined') return null;
    return SentrySDK || null;
}

/**
 * Capture an error with context
 * @param {Error|string} error - Error or message
 * @param {object} context - Additional context (tags, extra data, user)
 */
export async function captureError(error, context = {}) {
    const sentry = getSentry();
    if (!sentry) {
        if (isEdgeRuntime()) {
            console.warn('[Sentry Edge Fallback]', error);
        } else {
            console.warn('[Sentry Fallback]', error, context);
        }
        return;
    }

    try {
        sentry.withScope((scope) => {
            if (context.tags) {
                Object.entries(context.tags || {}).forEach(([key, value]) => {
                    scope.setTag(key, value);
                });
            }
            if (context.extra) {
                Object.entries(context.extra || {}).forEach(([key, value]) => {
                    scope.setExtra(key, value);
                });
            }
            if (context.user) scope.setUser(context.user);
            if (context.level) scope.setLevel(context.level);
            if (typeof error === 'string') {
                sentry.captureMessage(error, context.level || 'error');
            } else {
                sentry.captureException(error);
            }
        });
    } catch {
        console.warn('[Sentry captureError failed]', error);
    }
}

/**
 * Capture a message (non-error event)
 * @param {string} message
 * @param {string} level - 'info', 'warning', 'error', 'fatal'
 * @param {object} context
 */
export async function captureMessage(message, level = 'info', context = {}) {
    const sentry = getSentry();
    if (!sentry) {
        console.debug(`[Sentry Fallback] [${level}]`, message);
        return;
    }

    try {
        sentry.withScope((scope) => {
            if (context.tags) {
                Object.entries(context.tags || {}).forEach(([key, value]) => {
                    scope.setTag(key, value);
                });
            }
            if (context.extra) {
                Object.entries(context.extra || {}).forEach(([key, value]) => {
                    scope.setExtra(key, value);
                });
            }
            sentry.captureMessage(message, level);
        });
    } catch {
        console.debug(`[Sentry captureMessage failed] [${level}]`, message);
    }
}

/**
 * Set user context for all future error reports
 * @param {object} user - { id, email, username }
 */
export async function setUser(user) {
    const sentry = getSentry();
    if (!sentry) return;
    try {
        sentry.setUser(user ? {
            id: user.id,
            email: user.email,
            username: user.username || user.user_metadata?.username,
        } : null);
    } catch { /* no-op */ }
}

/**
 * Add breadcrumb for debugging trail
 * @param {object} breadcrumb - { category, message, data, level }
 */
export async function addBreadcrumb(breadcrumb) {
    const sentry = getSentry();
    if (!sentry || typeof sentry.addBreadcrumb !== 'function') return;
    try {
        sentry.addBreadcrumb({
            category: breadcrumb.category || 'app',
            message: breadcrumb.message,
            data: breadcrumb.data,
            level: breadcrumb.level || 'info',
        });
    } catch { /* no-op */ }
}

/**
 * Create a performance transaction
 * @param {string} name - Transaction name
 * @param {string} op - Operation type (e.g., 'pageload', 'http', 'db')
 * @returns {object|null} transaction or null
 */
export async function startTransaction(name, op = 'custom') {
    const sentry = getSentry();
    if (!sentry || typeof sentry.startTransaction !== 'function') return null;
    try {
        return sentry.startTransaction({ name, op });
    } catch {
        return null;
    }
}

/**
 * Wrap an API route handler with Sentry error catching
 * @param {Function} handler - API route handler
 * @returns {Function} Wrapped handler
 */
export function withSentry(handler) {
    return async (req, res) => {
        try {
            return await handler(req, res);
        } catch (error) {
            await captureError(error, {
                tags: {
                    api_route: req.url,
                    method: req.method,
                },
                extra: {
                    query: req.query,
                    body: req.method === 'POST' ? '[REDACTED]' : undefined,
                },
            });

            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Internal server error',
                    ...(process.env.NODE_ENV === 'development' ? { message: error.message } : {}),
                });
            }
        }
    };
}

/**
 * Get Sentry configuration status
 */
export function getSentryStatus() {
    return {
        configured: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ? '[CONFIGURED]' : '[NOT SET]',
    };
}