/**
 * Player Notes API - CRUD for player-on-player intelligence
 * GET /api/poker/player-notes?targetPlayerId=xxx
 * POST /api/poker/player-notes 
 */

import { createClient as supabaseServerClient } from '../../../src/lib/supabaseServerClient';
import { rateLimit as apiRateLimit } from '../../../src/lib/apiRateLimit';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';

export default async function handler(req, res) {
    // Rate limit
    const rateLimitResult = await apiRateLimit(req, { maxRequests: 50, windowMs: 60000 });
    if (rateLimitResult) return res.status(429).json({ error: 'Too many requests' });

    const supabase = supabaseServerClient(req);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // VIP/Pro gate check (Infrastructure ready)
    // We enforce read/write access via premiumFeatureGate
    const access = await checkFeatureAccess(user.id, 'bankroll_pro');
    if (!access.hasAccess) {
        return res.status(403).json({ error: 'Bankroll Pro or VIP required to use Player Notes' });
    }

    // ─── GET: Fetch note for a specific player ──────────────────────────────
    if (req.method === 'GET') {
        const { targetPlayerId } = req.query;
        if (!targetPlayerId) return res.status(400).json({ error: 'targetPlayerId is required' });

        try {
            const { data, error } = await supabase
                .from('player_notes')
                .select('*')
                .eq('user_id', user.id)
                .eq('target_player_id', targetPlayerId)
                .maybeSingle();

            if (error) throw error;
            return res.status(200).json({ note: data || null });
        } catch (err) {
            console.error('[PlayerNotes API] GET error:', err);
            return res.status(500).json({ error: 'Failed to fetch player note' });
        }
    }

    // ─── POST: Upsert note ──────────────────────────────────────────────────
    if (req.method === 'POST') {
        const { targetPlayerId, targetPlayerName, noteContent, colorTag } = req.body;
        
        if (!targetPlayerId) return res.status(400).json({ error: 'targetPlayerId is required' });

        try {
            // Delete if content is completely empty
            if (!noteContent || noteContent.trim() === '') {
                await supabase
                    .from('player_notes')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('target_player_id', targetPlayerId);
                    
                return res.status(200).json({ success: true, note: null, deleted: true });
            }

            // Upsert
            const { data, error } = await supabase
                .from('player_notes')
                .upsert({
                    user_id: user.id,
                    target_player_id: targetPlayerId,
                    target_player_name: targetPlayerName || null,
                    note_content: noteContent.trim(),
                    color_tag: colorTag || '#B0B3B8',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id, target_player_id' })
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json({ success: true, note: data });
        } catch (err) {
            console.error('[PlayerNotes API] POST error:', err);
            return res.status(500).json({ error: 'Failed to save player note' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
