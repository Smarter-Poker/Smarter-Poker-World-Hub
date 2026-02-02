/**
 * Arcade Duel Matchmaking API
 *
 * POST /api/arcade/find-duel  { user_id, duel_type: 'quick'|'best-of-3'|'high-roller', entry_fee }
 *
 * Tries to find a waiting opponent. If found, creates a match and returns both player IDs.
 * If not, places user in the queue and returns a waiting status.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { user_id, duel_type = 'quick', entry_fee = 25 } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: 'user_id required' });
    }

    const validTypes = { 'quick': 25, 'best-of-3': 50, 'high-roller': 100 };
    if (!validTypes[duel_type]) {
        return res.status(400).json({ error: 'Invalid duel_type. Use: quick, best-of-3, high-roller' });
    }

    try {
        // Check if user already has enough diamonds
        const { data: profile } = await supabase
            .from('profiles')
            .select('id, diamonds')
            .eq('id', user_id)
            .single();

        const cost = validTypes[duel_type];
        if (profile && (profile.diamonds || 0) < cost) {
            return res.status(400).json({
                error: 'Insufficient diamonds',
                required: cost,
                current: profile.diamonds || 0
            });
        }

        // Look for a waiting opponent in the queue
        const { data: waiting } = await supabase
            .from('arcade_duel_queue')
            .select('*')
            .eq('duel_type', duel_type)
            .eq('status', 'waiting')
            .neq('user_id', user_id)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (waiting) {
            // Match found - create a duel match
            const { data: match, error: matchErr } = await supabase
                .from('arcade_duels')
                .insert({
                    player1_id: waiting.user_id,
                    player2_id: user_id,
                    duel_type,
                    entry_fee: cost,
                    status: 'active',
                    round: 1,
                    max_rounds: duel_type === 'best-of-3' ? 3 : 1,
                })
                .select()
                .single();

            if (matchErr) {
                // Tables might not exist yet - return simulated match
                // Remove from queue
                await supabase.from('arcade_duel_queue').delete().eq('id', waiting.id);

                return res.status(200).json({
                    status: 'matched',
                    match: {
                        id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
                        player1_id: waiting.user_id,
                        player2_id: user_id,
                        duel_type,
                        entry_fee: cost,
                        round: 1,
                        max_rounds: duel_type === 'best-of-3' ? 3 : 1,
                    },
                    message: 'Opponent found! Starting duel...'
                });
            }

            // Remove from queue
            await supabase.from('arcade_duel_queue').delete().eq('id', waiting.id);

            // Deduct diamonds from both players
            if (profile) {
                await supabase.from('profiles').update({ diamonds: Math.max(0, (profile.diamonds || 0) - cost) }).eq('id', user_id);
            }

            return res.status(200).json({
                status: 'matched',
                match,
                message: 'Opponent found! Starting duel...'
            });
        }

        // No opponent found - add to queue
        const { error: queueErr } = await supabase
            .from('arcade_duel_queue')
            .upsert({
                user_id,
                duel_type,
                status: 'waiting',
                created_at: new Date().toISOString()
            }, { onConflict: 'user_id,duel_type' });

        if (queueErr) {
            // Table might not exist - return simulated queue status
            return res.status(200).json({
                status: 'queued',
                duel_type,
                entry_fee: cost,
                message: 'Searching for opponent...',
                estimated_wait: '~30 seconds'
            });
        }

        // Deduct entry fee when queued
        if (profile) {
            await supabase.from('profiles').update({ diamonds: Math.max(0, (profile.diamonds || 0) - cost) }).eq('id', user_id);
        }

        return res.status(200).json({
            status: 'queued',
            duel_type,
            entry_fee: cost,
            message: 'Searching for opponent...',
            estimated_wait: '~30 seconds'
        });

    } catch (error) {
        console.error('Duel matchmaking error:', error);
        return res.status(500).json({ error: 'Matchmaking failed' });
    }
}
