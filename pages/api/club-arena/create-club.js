/**
 * POST /api/club-arena/create-club
 * Creates a new club and the owner's membership record.
 * Auth: Bearer token (any authenticated user)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Club name required' });

    try {
        // Generate unique 5-digit code
        const clubCode = Math.floor(10000 + Math.random() * 90000);

        // Create club
        const { data: club, error: clubErr } = await supabaseAdmin
            .from('clubs')
            .insert({
                name: name.trim(),
                owner_id: user.id,
                club_id: clubCode,
                member_count: 1,
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (clubErr) throw clubErr;

        // Create owner membership
        const { error: memErr } = await supabaseAdmin
            .from('club_members')
            .insert({
                club_id: club.id,
                user_id: user.id,
                role: 'owner',
                status: 'active',
                chip_balance: 0,
                joined_at: new Date().toISOString(),
            });

        if (memErr) {
            // Rollback club creation
            await supabaseAdmin.from('clubs').delete().eq('id', club.id);
            throw memErr;
        }

        return res.status(200).json({ success: true, club });
    } catch (err) {
        console.error('[create-club]', err);
        return res.status(500).json({ error: err.message || 'Failed to create club' });
    }
}
