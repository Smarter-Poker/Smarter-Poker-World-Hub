import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { loadVideoLibraryChannels } from '../../../src/lib/server/videoLibraryChannels';
import { checkLiveChannels, LIVE_CACHE_MS } from '../../../src/lib/videoLibraryLive.mjs';

export const config = { maxDuration: 45 };
const cache = new Map();

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ success: false, error: 'Method Not Allowed' }); }
    if (!applyRateLimit(req, res, LIMITS.read)) return;
    const channelId = Array.isArray(req.query.channelId) ? req.query.channelId[0] : req.query.channelId;
    const key = channelId || 'featured';
    if (channelId && !/^[A-Za-z0-9_-]{1,80}$/.test(channelId)) return res.status(400).json({ success: false, error: 'Invalid Channel' });
    try {
        const prior = cache.get(key);
        if (prior && prior.expires > Date.now()) return res.status(200).json({ success: true, ...await prior.result });
        const result = (async () => {
            const payload = await loadVideoLibraryChannels({ channelId, limit: 1 });
            if (channelId && !payload.channel) { const error = new Error('Channel Not Found'); error.status = 404; throw error; }
            const channels = channelId ? [payload.channel] : payload.channels.filter(channel => channel.legacyIds.length > 0 && channel.topic === 'poker');
            return checkLiveChannels(channels);
        })();
        // Request-owned coalescing only. No timer, background poll or scheduled check.
        if (cache.size >= 100) { for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey); }
        if (cache.size >= 100) cache.delete(cache.keys().next().value);
        const entry = { expires: Date.now() + LIVE_CACHE_MS, result };
        cache.set(key, entry);
        try { return res.status(200).json({ success: true, ...await result }); }
        catch (error) { if (cache.get(key) === entry) cache.delete(key); throw error; }
    } catch (error) {
        if (error.status === 404) return res.status(404).json({ success: false, error: 'Channel Not Found' });
        console.warn('[video-library/live] status unavailable:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Live Status Is Temporarily Unavailable' });
    }
}
