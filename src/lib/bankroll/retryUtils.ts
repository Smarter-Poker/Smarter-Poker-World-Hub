/**
 * RETRY UTILITIES — Shared exponential backoff for resilient Supabase reads
 * ═══════════════════════════════════════════════════════════════════
 * Used by tokeSelectors.ts, bankrollSelectors.ts, calculations.ts
 * ═══════════════════════════════════════════════════════════════════
 */

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 200): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            lastError = err;
            if (attempt < retries) {
                // AbortErrors (session refresh) get a longer delay to let auth settle
                const isAbort = err?.name === 'AbortError' || (err?.message || '').toLowerCase().includes('aborted');
                const delay = isAbort ? 1000 : baseDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    throw lastError;
}
