/**
 * Sentry Error Monitoring Service
 * Centralized error tracking and reporting for Smarter.Poker
 *
 * Setup: Add NEXT_PUBLIC_SENTRY_DSN to environment variables
 * Install: npm install @sentry/nextjs
 */

let Sentry = null;

/**
 * Initialize Sentry on demand (lazy loading)
 * Uses eval-based dynamic import to prevent webpack from resolving the module at build time.
 * At runtime, if @sentry/nextjs is installed, it will be loaded; otherwise fallback to console.
 */
async function getSentry() {
    if (Sentry) return Sentry;
    try {
        // Webpack-safe dynamic import: prevents static analysis from requiring the package
        const moduleName = '@sentry/nextjs';
        Sentry = await new Function('m', 'return import(m)')(moduleName);
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
    const sentry = await getSentry();
    if (!sentry) {
        console.error('[Sentry Fallback]', error, context);
        return;
    }

    sentry.withScope((scope) => {
        if (context.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }

        if (context.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
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
    const sentry = await getSentry();
    if (!sentry) {
        console.log(`[Sentry Fallback] [${level}]`, message);
        return;
    }

    sentry.withScope((scope) => {
        if (context.tags) {
            Object.entries(context.tags).forEach(([key, value]) => {
                scope.setTag(key, value);
            });
        }
        if (context.extra) {
            Object.entries(context.extra).forEach(([key, value]) => {
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
    const sentry = await getSentry();
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
    const sentry = await getSentry();
    if (!sentry) return;
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
    const sentry = await getSentry();
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
