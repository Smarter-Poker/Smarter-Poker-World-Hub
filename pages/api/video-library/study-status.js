import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { channelServerClient } from '../../../src/lib/server/videoLibraryChannels';
import { summarizeVideoStudy } from '../../../src/lib/videoLibraryStudy.mjs';
const one = value => Array.isArray(value) ? value[0] : value;
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ success: false, error: 'Method Not Allowed' }); }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    try {
        const db = channelServerClient();
        const { user, error } = await getServerUserWithFallback(req, db);
        if (error || !user?.id) return res.status(401).json({ success: false, error: 'Sign In To See Your Study Streak' });
        const expected = String(one(req.query.ownerId) || '').trim();
        if (expected && expected !== user.id) return res.status(409).json({ success: false, error: 'Account Changed. Retry The Request' });
        const now = new Date();
        const result = await db.from('diamond_transactions').select('amount,created_at').eq('user_id', user.id).eq('transaction_type', 'video_watch').gt('amount', 0).gte('created_at', new Date(now.getTime() - 400 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(2000);
        if (result.error || !Array.isArray(result.data) || result.data.length >= 2000) throw result.error || new Error('Study Ledger Is Incomplete');
        return res.status(200).json({ success: true, ownerId: user.id, data: summarizeVideoStudy(result.data, now) });
    } catch (error) {
        console.warn('[video-library/study-status] request failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Study Status Is Temporarily Unavailable' });
    }
}
