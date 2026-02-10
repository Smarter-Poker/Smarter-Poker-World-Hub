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

    const { userId } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

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
