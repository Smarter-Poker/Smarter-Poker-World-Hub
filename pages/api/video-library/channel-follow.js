import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { loadVideoLibraryChannels, channelServerClient } from '../../../src/lib/server/videoLibraryChannels';
const one = value => Array.isArray(value) ? value[0] : value;
export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ success: false, error: 'Method not allowed' }); }
    if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
    try {
        const { user } = await getServerUserWithFallback(req, channelServerClient());
        if (!user?.id) return res.status(401).json({ success: false, error: 'Sign In To Follow Channels' });
        const input = req.method === 'GET' ? req.query : req.body || {};
        const expected = String(one(input.expectedOwnerId) || '').trim();
        if (expected && expected !== user.id) return res.status(409).json({ success: false, error: 'Account Changed. Retry The Request' });
        const key = String(one(input.channelId) || '').trim();
        if (!key) return res.status(400).json({ success: false, error: 'Channel Is Required' });
        const payload = await loadVideoLibraryChannels({ channelId: key, limit: 1 });
        if (!payload.channel) return res.status(404).json({ success: false, error: 'Channel Not Found' });
        const token = String(one(req.headers.authorization) || '').match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) return res.status(401).json({ success: false, error: 'Sign In To Follow Channels' });
        const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
        });
        let state;
        if (req.method === 'POST') {
            if (typeof input.following !== 'boolean' || typeof input.notificationsEnabled !== 'boolean') return res.status(400).json({ success: false, error: 'Follow And Notification Choices Must Be Boolean' });
            const result = await db.rpc('set_video_library_channel_follow', { p_expected_user_id: user.id, p_source_id: payload.channel.id, p_following: input.following, p_notifications_enabled: input.notificationsEnabled });
            if (result.error) throw result.error;
            state = result.data;
        } else {
            const result = await db.from('video_library_channel_follows').select('source_id,notifications_enabled').eq('user_id', user.id).eq('source_id', payload.channel.id).maybeSingle();
            if (result.error) throw result.error;
            state = { following: Boolean(result.data), notificationsEnabled: result.data?.notifications_enabled === true };
        }
        return res.status(200).json({ success: true, ownerId: user.id, channelId: payload.channel.id, following: state?.following === true, notificationsEnabled: state?.notificationsEnabled === true });
    } catch (error) {
        console.warn('[video-library/channel-follow] request failed:', error?.message || error);
        return res.status(503).json({ success: false, error: 'Channel Following Is Temporarily Unavailable' });
    }
}
