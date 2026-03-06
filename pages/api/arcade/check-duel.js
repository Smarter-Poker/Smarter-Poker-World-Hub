/**
 * Check Duel Queue Status API
 * Polls the duel matchmaking queue for match updates
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { queue_id } = req.query;

    if (!queue_id) {
        return res.status(400).json({ error: 'queue_id is required' });
    }

    try {
        // Check our queue entry status
        const { data: entry, error } = await supabase
            .from('arcade_duel_queue')
            .select('id')
            .eq('id', queue_id)
            .single();

        if (error || !entry) {
            return res.status(404).json({ error: 'Queue entry not found' });
        }

        // If already matched, return match info
        if (entry.status === 'matched') {
            return res.status(200).json({
                status: 'matched',
                matched_with: entry.matched_with,
                matched_at: entry.matched_at,
            });
        }

        // If expired, return expired
        if (new Date(entry.expires_at) < new Date()) {
            await supabase
                .from('arcade_duel_queue')
                .update({ status: 'expired' })
                .eq('id', queue_id);

            return res.status(200).json({ status: 'expired' });
        }

        // Try to find a match
        const { data: opponent } = await supabase
            .from('arcade_duel_queue')
            .select('*')
            .eq('duel_type', entry.duel_type)
            .eq('status', 'waiting')
            .neq('user_id', entry.user_id)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (opponent) {
            const now = new Date().toISOString();

            // Match both entries
            await supabase
                .from('arcade_duel_queue')
                .update({ status: 'matched', matched_with: opponent.user_id, matched_at: now })
                .eq('id', queue_id);

            await supabase
                .from('arcade_duel_queue')
                .update({ status: 'matched', matched_with: entry.user_id, matched_at: now })
                .eq('id', opponent.id);

            return res.status(200).json({
                status: 'matched',
                matched_with: opponent.user_id,
                matched_at: now,
            });
        }

        // Still waiting
        return res.status(200).json({ status: 'waiting' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}
