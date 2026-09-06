/**
 * Supabase Retry Utility
 * ═══════════════════════════════════════════════════════════════════════════
 * Generic retry wrapper for Supabase operations.
 * - 1 retry with exponential backoff (500ms → 1000ms)
 * - Only retries on connection/timeout errors
 * - Does NOT retry on auth, validation, or constraint violations
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Error codes that indicate transient failures worth retrying
const RETRYABLE_CODES = new Set([
    'PGRST301',  // Connection error
    'ETIMEDOUT', // Network timeout
    'ECONNRESET', // Connection reset
    'ECONNREFUSED', // Connection refused
    'FETCH_ERROR', // Generic fetch failure
    'ERR_HTTP2_INVALID_SESSION', // Undici reused a closed HTTP/2 session
    'ABORT_ERR',   // Per-attempt deadline elapsed
    '08000',     // Postgres connection exception
    '08006',     // Postgres connection failure
    '57P01',     // Admin shutdown
    '53300',     // Too many connections
]);

// HTTP status codes worth retrying
const RETRYABLE_HTTP = new Set([502, 503, 504, 408, 429]);

/**
 * Determine if an error is retryable (transient network/connection issue).
 * Returns false for auth, validation, constraint, and logic errors.
 */
export function isRetryable(error) {
    if (!error) return false;

    // Supabase error object with code
    const code = error.code || error.cause?.code;
    if (code && RETRYABLE_CODES.has(code)) return true;

    // HTTP status-based retry
    if (error.status && RETRYABLE_HTTP.has(error.status)) return true;

    // Network error messages
    const msg = `${error.message || ''} ${error.cause?.message || ''}`.toLowerCase();
    if (msg.includes('fetch') && msg.includes('failed')) return true;
    if (msg.includes('network') || msg.includes('timeout')) return true;
    if (msg.includes('econnreset') || msg.includes('econnrefused')) return true;
    if (msg.includes('socket hang up')) return true;
    if (msg.includes('invalid session') || msg.includes('session has been destroyed')) return true;
    if (error.name === 'AbortError' || error.cause?.name === 'AbortError') return true;

    return false;
}

/**
 * Execute a Supabase operation with retry logic.
 *
 * @param {Function} operation - Async function that returns { data, error }
 * @param {Object} options
 * @param {number} options.maxRetries - Max retry attempts (default: 1)
 * @param {number} options.baseDelay - Base delay in ms (default: 500)
 * @param {string} options.label - Label for logging (default: 'Supabase')
 * @returns {Promise<{data: any, error: any}>}
 *
 * @example
 *   const { data, error } = await withRetry(
 *       () => supabase.from('table').upsert(row).select().maybeSingle(),
 *       { label: 'SaveProgress' }
 *   );
 */
export async function withRetry(operation, options = {}) {
    const { maxRetries = 1, baseDelay = 500, label = 'Supabase' } = options;

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await operation();

            // If this is a Supabase response object with { data, error }
            if (result && typeof result === 'object' && 'error' in result) {
                if (result.error && isRetryable(result.error) && attempt < maxRetries) {
                    lastError = result.error;
                    const delay = baseDelay * Math.pow(2, attempt);
                    console.warn(`[${label}] Transient error (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, result.error.message || result.error.code);
                    await sleep(delay);
                    continue;
                }
                return result; // Return as-is (success or non-retryable error)
            }

            return result; // Non-Supabase return value — pass through
        } catch (err) {
            lastError = err;

            if (isRetryable(err) && attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`[${label}] Exception (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, err.message);
                await sleep(delay);
                continue;
            }

            throw err; // Non-retryable exception — rethrow
        }
    }

    // Should not reach here, but safety net
    return { data: null, error: lastError };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
