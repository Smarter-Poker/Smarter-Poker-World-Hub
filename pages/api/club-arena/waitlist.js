/**
 * Player Waitlist API — Queue management for full tables
 * ═══════════════════════════════════════════════════════
 * POST /api/club-arena/waitlist
 *
 * Actions:
 *   - join:       Player joins the waitlist for a table
 *   - leave:      Player leaves the waitlist
 *   - list:       Get current waitlist for a table (admin)
 *   - notify:     Mark next player as notified (admin)
 *   - clear:      Clear entire waitlist (admin)
 *   - position:   Get caller's position in the waitlist
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { action, tableId, clubId, targetUserId } = req.body;

    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    try {
        switch (action) {
            case 'join': {
                // Check if already on waitlist
                const { data: existing } = await supabaseAdmin
                    .from('table_waitlist')
                    .select('id')
                    .eq('table_id', tableId)
                    .eq('user_id', user.id)
                    .eq('status', 'waiting')
                    .maybeSingle();

                if (existing) return res.status(409).json({ error: 'Already on waitlist' });

                // Get next position
                const { count } = await supabaseAdmin
                    .from('table_waitlist')
                    .select('id', { count: 'exact', head: true })
                    .eq('table_id', tableId)
                    .eq('status', 'waiting');

                const { data, error } = await supabaseAdmin
                    .from('table_waitlist')
                    .insert({
                        table_id: tableId,
                        user_id: user.id,
                        position: (count || 0) + 1,
                        status: 'waiting',
                    })
                    .select()
                    .maybeSingle();

                if (error) throw error;
                return res.status(201).json({ success: true, entry: data, position: (count || 0) + 1 });
            }

            case 'leave': {
                const { error } = await supabaseAdmin
                    .from('table_waitlist')
                    .update({ status: 'left' })
                    .eq('table_id', tableId)
                    .eq('user_id', user.id)
                    .eq('status', 'waiting');

                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            case 'position': {
                const { data } = await supabaseAdmin
                    .from('table_waitlist')
                    .select('position')
                    .eq('table_id', tableId)
                    .eq('user_id', user.id)
                    .eq('status', 'waiting')
                    .maybeSingle();

                return res.status(200).json({
                    success: true,
                    position: data?.position || null,
                    onWaitlist: !!data,
                });
            }

            case 'list': {
                // Admin only — get full waitlist
                if (!clubId) return res.status(400).json({ error: 'clubId required for list' });
                const { data: membership } = await supabaseAdmin
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                    return res.status(403).json({ error: 'Admin access required' });
                }

                const { data, error } = await supabaseAdmin
                    .from('table_waitlist')
                    .select(`
                        *,
                        profiles:user_id ( display_name, avatar_url )
                    `)
                    .eq('table_id', tableId)
                    .eq('status', 'waiting')
                    .order('position', { ascending: true })
                    .limit(50);

                if (error) throw error;
                return res.status(200).json({ success: true, waitlist: data || [] });
            }

            case 'notify': {
                // Admin notifies next player
                if (!clubId) return res.status(400).json({ error: 'clubId required' });
                const { data: membership } = await supabaseAdmin
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                    return res.status(403).json({ error: 'Admin access required' });
                }

                const userId = targetUserId;
                if (!userId) return res.status(400).json({ error: 'targetUserId required' });

                const { error } = await supabaseAdmin
                    .from('table_waitlist')
                    .update({ status: 'notified', notified_at: new Date().toISOString() })
                    .eq('table_id', tableId)
                    .eq('user_id', userId)
                    .eq('status', 'waiting');

                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            case 'clear': {
                if (!clubId) return res.status(400).json({ error: 'clubId required' });
                const { data: membership } = await supabaseAdmin
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                    return res.status(403).json({ error: 'Admin access required' });
                }

                const { error } = await supabaseAdmin
                    .from('table_waitlist')
                    .update({ status: 'cleared' })
                    .eq('table_id', tableId)
                    .eq('status', 'waiting');

                if (error) throw error;
                return res.status(200).json({ success: true });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error('[waitlist]', err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
