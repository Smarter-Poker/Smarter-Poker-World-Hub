/**
 * Sentry Error Monitoring Service
 * Centralized error tracking and reporting for Smarter.Poker
 *
 * Setup: Add NEXT_PUBLIC_SENTRY_DSN to environment variables
 * Install: npm install @sentry/nextjs
 */

let Sentry = null;
let sentryLoadAttempted = false;

/**
 * Check if running in Edge Runtime
 */
function isEdgeRuntime() {
    return typeof EdgeRuntime !== 'undefined' || (typeof process !== 'undefined' && process.env.NEXT_RUNTIME === 'edge');
}

/**
 * Initialize Sentry on demand (lazy loading)
 * Uses process.mainModule.require to avoid webpack bundling and Edge Runtime static analysis issues.
 * At runtime, if @sentry/nextjs is installed, it will be loaded; otherwise fallback to console.
 */
function getSentry() {
    if (Sentry) return Sentry;
    if (sentryLoadAttempted) return null;
    sentryLoadAttempted = true;

    // Skip loading in Edge Runtime to avoid dynamic code evaluation errors
    if (isEdgeRuntime()) {
        return null;
    }

    // Skip loading in browser environment
    if (typeof window !== 'undefined') {
        return null;
    }

    try {
        // Use process.mainModule.require to avoid webpack bundling.
        // Guarded above so this never executes in Edge Runtime.
        const nodeRequire = (typeof process !== 'undefined' && process.mainModule && process.mainModule.require)
            ? process.mainModule.require.bind(process.mainModule)
            : null;
        if (!nodeRequire) return null;
        Sentry = nodeRequire('@sentry/nextjs');
        return Sentry;
    } catch {
        return null;
    }
}

/**
 * Capture an error with context
 * @param {Error|string} error - Error or message
 * @param {object} context - Additional context (tags, extra data, user)
 */
export async function captureError(error, context = {}) {
    if (isEdgeRuntime()) {
        console.warn('[Sentry Edge Fallback]', error, context);
        return;
    }
    const sentry = getSentry();
    if (!sentry) {
        console.warn('[Sentry Fallback]', error, context);
        return;
    }

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

        if (context.user) {
            scope.setUser(context.user);
        }

        if (context.level) {
            scope.setLevel(context.level);
        }

        if (typeof error === 'string') {
            sentry.captureMessage(error, context.level || 'error');
        } else {
            sentry.captureException(error);
        }
    });
}

/**
 * Capture a message (non-error event)
 * @param {string} message
 * @param {string} level - 'info', 'warning', 'error', 'fatal'
 * @param {object} context
 */
export async function captureMessage(message, level = 'info', context = {}) {
    if (isEdgeRuntime()) {
        console.debug(`[Sentry Edge Fallback] [${level}]`, message);
        return;
    }
    const sentry = getSentry();
    if (!sentry) {
        console.debug(`[Sentry Fallback] [${level}]`, message);
        return;
    }

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
}

/**
 * Set user context for all future error reports
 * @param {object} user - { id, email, username }
 */
export async function setUser(user) {
    if (isEdgeRuntime()) return;
    const sentry = getSentry();
    if (!sentry) return;
    sentry.setUser(user ? {
        id: user.id,
        email: user.email,
        username: user.username || user.user_metadata?.username,
    } : null);
}

/**
 * Add breadcrumb for debugging trail
 * @param {object} breadcrumb - { category, message, data, level }
 */
export async function addBreadcrumb(breadcrumb) {
    if (isEdgeRuntime()) return;
    const sentry = getSentry();
    if (!sentry || typeof sentry.addBreadcrumb !== 'function') return;
    sentry.addBreadcrumb({
        category: breadcrumb.category || 'app',
        message: breadcrumb.message,
        data: breadcrumb.data,
        level: breadcrumb.level || 'info',
    });
}

/**
 * Create a performance transaction
 * @param {string} name - Transaction name
 * @param {string} op - Operation type (e.g., 'pageload', 'http', 'db')
 * @returns {object|null} transaction or null
 */
export async function startTransaction(name, op = 'custom') {
    if (isEdgeRuntime()) return null;
    const sentry = getSentry();
    if (!sentry) return null;
    return sentry.startTransaction({ name, op });
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