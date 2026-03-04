/**
 * Server-side subscription check for Commander login
 * Uses service role key to bypass RLS
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // BUG #260 FIX: Require JWT auth — previously accepted arbitrary userId from body,
    // allowing anyone to look up any user's subscription details and venue info.
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    // Always use the authenticated user's ID, ignore body.userId
    const userId = user.id;

    try {
        const { data: subs, error } = await supabase
            .from('commander_subscriptions')
            .select('*, venue:poker_venues(*)')
            .eq('owner_id', userId)
            .in('status', ['active', 'trialing'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Subscription check error:', error.message);
            return res.status(500).json({ error: 'Failed to check subscription' });
        }

        const subscription = subs?.[0] || null;

        if (!subscription) {
            return res.status(404).json({ error: 'No active subscription found' });
        }

        return res.status(200).json({ subscription });
    } catch (err) {
        console.error('check-subscription error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
