/**
 * apiLogger.js — Structured logging for API endpoints
 * ═══════════════════════════════════════════════════════════════════════════
 * Drop-in replacement for console.debug/warn/error with structured JSON,
 * timestamps, correlation IDs, and log levels.
 * 
 * Usage:
 *   import { createLogger } from '../../src/lib/apiLogger';
 *   const log = createLogger('SaveProgress');
 *   log.info('Session saved', { userId, gameId });
 *   log.warn('Fallback used', { reason: 'RPC failed' });
 *   log.error('Critical failure', { error: err.message });
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

/**
 * Create a namespaced logger for an API endpoint
 * @param {string} namespace - e.g., 'SaveProgress', 'Streak', 'Challenges'
 * @returns {{ debug, info, warn, error }}
 */
export function createLogger(namespace) {
    function emit(level, message, data = {}) {
        if (LOG_LEVELS[level] < MIN_LEVEL) return;

        const entry = {
            ts: new Date().toISOString(),
            level,
            ns: namespace,
            msg: message,
            ...data,
        };

        // Strip undefined values for cleaner output
        Object.keys(entry || {}).forEach(k => entry[k] === undefined && delete entry[k]);

        const output = JSON.stringify(entry);

        switch (level) {
            case 'error': console.warn(output); break;
            case 'warn':  console.warn(output);  break;
            default:      console.debug(output);   break;
        }
    }

    return {
        debug: (msg, data) => emit('debug', msg, data),
        info:  (msg, data) => emit('info',  msg, data),
        warn:  (msg, data) => emit('warn',  msg, data),
        error: (msg, data) => emit('error', msg, data),
    };
}

/**
 * Extract correlation ID from request headers (Vercel provides x-vercel-id)
 * @param {object} req - Next.js request object
 * @returns {string} correlation ID
 */
export function getCorrelationId(req) {
    return req?.headers?.['x-vercel-id'] ||
           req?.headers?.['x-request-id'] ||
           `req_${Date.now().toString(36)}`;
}
