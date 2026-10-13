import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { loadVideoLibraryChannels } from '../../../src/lib/server/videoLibraryChannels';
const one = value => Array.isArray(value) ? value[0] : value;
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    try {
        const channelId = one(req.query.channelId);
        const payload = await loadVideoLibraryChannels({ channelId, offset: one(req.query.offset), limit: one(req.query.limit) });
        if (channelId && !payload.channel) return res.status(404).json({ success: false, error: 'Channel not found' });
        return res.status(200).json({ success: true, ...payload });
    } catch (error) {
        console.warn('[video-library/channels] read failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Channels Are Temporarily Unavailable' });
    }
}
