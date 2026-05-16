/**
 * POST /api/live/leave-stream
 * Keepalive endpoint to cleanly remove a viewer from a live stream
 * even when the user forcefully closes the tab.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { stream_id } = req.body;
    if (!stream_id) return res.status(400).json({ error: 'stream_id required' });

    try {
        const { error: delErr } = await supabase.from('live_viewers')
            .delete()
            .eq('stream_id', stream_id)
            .eq('viewer_id', user.id);
        if (delErr) throw new Error(delErr.message);
            
        return res.json({ success: true });
    } catch (err) {
        console.warn('[leave-stream] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
}
