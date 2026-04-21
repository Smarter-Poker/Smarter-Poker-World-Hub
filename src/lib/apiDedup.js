/**
 * apiDedup.js — Request Deduplication Middleware
 * ═══════════════════════════════════════════════════════════════════════════
 * Prevents rapid duplicate requests (double-click, network retry) by
 * rejecting identical requests within a 2-second window.
 * 
 * Usage:
 *   import { checkDuplicate } from '../../src/lib/apiDedup';
 *   
 *   export default async function handler(req, res) {
 *     if (checkDuplicate(req, res)) return; // Returns 429 if duplicate
 *     ...
 *   }
 */

const recentRequests = new Map();
const DEDUP_WINDOW_MS = 2000; // 2 seconds

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
    const interval = setInterval(() => {
        const now = Date.now();
        for (const [key, ts] of recentRequests.entries()) {
            if (now - ts > DEDUP_WINDOW_MS * 2) recentRequests.delete(key);
        }
    }, 5 * 60 * 1000);
    if (interval.unref) interval.unref();
}

/**
 * Generate a fingerprint for the request
 */
function fingerprint(req) {
    const auth = req.headers?.authorization || '';
    const userId = auth.startsWith('Bearer ') ? auth.slice(7, 39) : '';
    const method = req.method || '';
    const url = (req.url || '').split('?')[0];
    
    // For POST, include a hash of the body
    let bodyKey = '';
    if (req.body && typeof req.body === 'object') {
        // Use key fields, not entire body (performance)
        const { gameId, game_id, level, milestoneDays, challengeId } = req.body;
        bodyKey = [gameId, game_id, level, milestoneDays, challengeId]
            .filter(Boolean)
            .join('_');
    }
    
    return `${userId}::${method}::${url}::${bodyKey}`;
}

/**
 * Check if this request is a duplicate of a recent one.
 * If duplicate, sends 429 response and returns true.
 * If not duplicate, records the request and returns false.
 * 
 * @param {object} req - Next.js request
 * @param {object} res - Next.js response
 * @returns {boolean} true if duplicate (response already sent), false if allowed
 */
export function checkDuplicate(req, res) {
    // Only dedup write operations
    if (req.method === 'GET') return false;
    
    const key = fingerprint(req);
    const now = Date.now();
    const lastSeen = recentRequests.get(key);
    
    if (lastSeen && (now - lastSeen) < DEDUP_WINDOW_MS) {
        res.status(429).json({
            success: false,
            error: 'Duplicate request detected',
            message: 'This action was already submitted. Please wait a moment.',
            retryAfter: Math.ceil((DEDUP_WINDOW_MS - (now - lastSeen)) / 1000)
        });
        return true;
    }
    
    recentRequests.set(key, now);
    return false;
}
