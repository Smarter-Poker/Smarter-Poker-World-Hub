/**
 * GET /api/notifications/list — Fetch user's social notifications (service role, bypasses RLS)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth
    const localUser = getServerUser(req);
    let userId;
    if (localUser) {
        userId = localUser.id;
    } else {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Auth required' });
        const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });
        userId = user.id;
    }

    try {
        const limit = parseInt(req.query.limit || '50');
        const blockedTypes = (req.query.blocked || 'like,comment,share,mention,tag,hand_reaction').split(',');

        // Fetch notifications
        let query = supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (blockedTypes.length > 0) {
            query = query.not('type', 'in', `(${blockedTypes.join(',')})`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Notifications List] Error:', error);
            return res.status(200).json({ success: true, notifications: [] });
        }

        return res.status(200).json({
            success: true,
            notifications: data || [],
            count: (data || []).length
        });

    } catch (err) {
        console.error('[Notifications List] Error:', err);
        return res.status(200).json({ success: true, notifications: [] });
    }
}
