/**
 * SupabaseResilience — Query Wrapper with Exponential Backoff Retry
 * ═══════════════════════════════════════════════════════════════════
 * Provides resilient Supabase query execution for the horse brain engine.
 * Retries transient network/503 errors up to 3 times with exponential back-off.
 * 
 * Usage:
 *   const { resilientQuery: rq } = require('./SupabaseResilience');
 *   const { data, error } = await rq(sb, () => sb.from('table').select('*'));
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 150;

/**
 * Execute a Supabase query with automatic retry on transient errors.
 * 
 * @param {Object} _sb - Supabase client (kept for API parity — not used directly)
 * @param {Function} queryFn - Zero-argument function that returns a Supabase query promise
 * @param {Object} [opts] - Options
 * @param {number} [opts.maxRetries=3] - Max retry attempts
 * @param {number} [opts.baseDelayMs=150] - Base delay for exponential back-off
 * @returns {Promise<{data: any, error: any}>} - Resolves with Supabase response shape
 */
async function resilientQuery(_sb, queryFn, opts = {}) {
    const maxRetries = opts.maxRetries ?? MAX_RETRIES;
    const baseDelayMs = opts.baseDelayMs ?? BASE_DELAY_MS;

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await queryFn();
            // If error is a transient network/server error, retry
            if (result?.error) {
                const status = result.error?.status || result.error?.statusCode || 0;
                const isTransient = status === 503 || status === 429 || status === 0 || !status;
                if (isTransient && attempt < maxRetries) {
                    lastError = result.error;
                    const delay = baseDelayMs * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
            return result ?? { data: null, error: null };
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries exhausted — return graceful failure
    console.warn('[SupabaseResilience] All retries exhausted:', lastError?.message || lastError);
    return { data: null, error: lastError || new Error('All retries exhausted') };
}

module.exports = { resilientQuery };
