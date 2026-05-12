/**
 * GET /api/notifications/unread-count
 *
 * Returns the authenticated user's unread notification count.
 * Used by the header bell badge. Cheap query — count only, no joins.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { createClient } from '../../../src/lib/supabaseServerClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// In-memory TTL cache to prevent hammering the DB on every page render
const _cache = new Map(); // userId → { count, ts }
const CACHE_TTL_MS = 30_000; // 30 seconds

// Called by mark-read / delete APIs to bust the cache
export function invalidateUnreadCache(userId) {
    _cache.delete(userId);
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
        if (!applyRateLimit(req, res, LIMITS.read)) return;

        const { user } = await getServerUserWithFallback(req, getSupabase());
        if (!user) return res.status(401).json({ error: 'Auth required' });

        const uid = user.id;
        const now = Date.now();

        // Serve from cache if fresh
        const cached = _cache.get(uid);
        if (cached && (now - cached.ts) < CACHE_TTL_MS) {
            return res.status(200).json({ count: cached.count, cached: true });
        }

        const { count, error } = await getSupabase()
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', uid)
            .or('read.eq.false,read.is.null,is_read.eq.false,is_read.is.null');

        if (error) {
            console.warn('[unread-count] DB error:', error.message);
            return res.status(500).json({ error: 'Failed to fetch count' });
        }

        const unread = count || 0;
        _cache.set(uid, { count: unread, ts: now });

        return res.status(200).json({ count: unread, cached: false });
    } catch (err) {
        console.warn('[unread-count] Error:', err.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Internal server error' });
    }
}
