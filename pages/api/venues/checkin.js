import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { getServerUser } = require('../../../src/lib/serverAuth');
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!applyRateLimit(req, res, LIMITS.write)) return;

    try {
        const localUser = getServerUser(req);
        let userId = localUser?.id;

        if (!userId) {
            const authHeader = req.headers.authorization;
            if (!authHeader?.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Authorization required' });
            }
            const token = authHeader.replace('Bearer ', '');
            const supabase = createClient();
            const { data: { user }, error: authError } = await supabase.auth.getUser(token);
            if (authError || !user) {
                return res.status(401).json({ success: false, error: 'Invalid session' });
            }
            userId = user.id;
        }

        const { venue_id } = req.body;
        if (!venue_id) {
            return res.status(400).json({ success: false, error: 'venue_id required' });
        }

        const supabase = createClient();

        // Optional: Ensure they haven't checked in within the last 12 hours
        const { data: recentCheckin } = await supabase
            .from('user_venue_checkins')
            .select('id, checkin_time')
            .eq('user_id', userId)
            .eq('venue_id', venue_id)
            .gte('checkin_time', new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
            .order('checkin_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recentCheckin) {
            return res.status(200).json({ success: true, message: 'Already checked in recently', checkin_id: recentCheckin.id });
        }

        const { data: newCheckin, error } = await supabase
            .from('user_venue_checkins')
            .insert({
                user_id: userId,
                venue_id: venue_id,
                checkin_time: new Date().toISOString()
            })
            .select()
            .maybeSingle();

        if (error) {
            console.error('[Checkin API] Insert error:', error);
            return res.status(500).json({ success: false, error: 'Failed to record checkin' });
        }

        return res.status(200).json({ success: true, checkin_id: newCheckin.id });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) {}
        console.error('[API Error] checkin:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
