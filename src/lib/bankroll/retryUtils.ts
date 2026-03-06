/**
 * RETRY UTILITIES — Shared exponential backoff for resilient Supabase reads
 * ═══════════════════════════════════════════════════════════════════
 * Used by tokeSelectors.ts, bankrollSelectors.ts, calculations.ts
 * ═══════════════════════════════════════════════════════════════════
 */

export async function withRetry<T>(fn: () => Promise<T>, retries = 2, baseDelay = 200): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
            }
        }
    }
    throw lastError;
}
