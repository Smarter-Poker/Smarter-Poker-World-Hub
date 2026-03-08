/**
 * Request Deduplication Utility
 * ═══════════════════════════════════════════════════════
 * Prevents duplicate in-flight requests for the same key.
 * If a request for key "alice" is already in-flight, subsequent
 * calls with the same key return the existing Promise instead
 * of firing a new network request.
 *
 * Usage:
 *   import { dedup } from './requestDedup';
 *   const data = await dedup('profile:alice', () => supabase.from('profiles').select('*').eq('username','alice'));
 */

const inflightMap = new Map();

/**
 * Execute an async function with deduplication.
 * @param {string} key — unique identifier for this request
 * @param {Function} fn — async function to execute
 * @returns {Promise} — the result of fn()
 */
export function dedup(key, fn) {
    if (inflightMap.has(key)) {
        return inflightMap.get(key);
    }

    const promise = fn()
        .then(result => {
            inflightMap.delete(key);
            return result;
        })
        .catch(err => {
            inflightMap.delete(key);
            throw err;
        });

    inflightMap.set(key, promise);
    return promise;
}
