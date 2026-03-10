/**
 * Table Chat API — In-table messaging and dealer announcements
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/table-chat
 *
 * Actions:
 *   - send:          Player sends a chat message to a table
 *   - dealer_msg:    Admin sends a dealer/system message
 *   - history:       Get recent chat history for a table
 *   - mute:          Admin mutes a player at a table
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Rate limit: 1 message per second per user
const rateLimits = new Map();
const RATE_LIMIT_MS = 1000;

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { action, tableId, clubId, message, targetUserId } = req.body;
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    try {
        switch (action) {
            case 'send': {
                if (!message?.trim()) return res.status(400).json({ error: 'Message required' });
                if (message.length > 200) return res.status(400).json({ error: 'Message too long (200 char max)' });

                // Rate limit check
                const lastSent = rateLimits.get(user.id);
                if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
                    return res.status(429).json({ error: 'Slow down! 1 message per second.' });
                }
                rateLimits.set(user.id, Date.now());

                // Check if user is muted
                const { data: muteCheck } = await supabaseAdmin
                    .from('table_chat_mutes')
                    .select('id')
                    .eq('table_id', tableId)
                    .eq('user_id', user.id)
                    .gte('expires_at', new Date().toISOString())
                    .maybeSingle();

                if (muteCheck) return res.status(403).json({ error: 'You are muted at this table' });

                // Get user profile for display
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('display_name, avatar_url')
                    .eq('id', user.id)
                    .maybeSingle();

                const chatMsg = {
                    table_id: tableId,
                    user_id: user.id,
                    message: message.trim().slice(0, 200),
                    message_type: 'player',
                    display_name: profile?.display_name || 'Player',
                    avatar_url: profile?.avatar_url || null,
                };

                const { data, error } = await supabaseAdmin
                    .from('table_chat')
                    .insert(chatMsg)
                    .select()
                    .maybeSingle();

                if (error) throw error;
                return res.status(201).json({ success: true, chat: data });
            }

            case 'dealer_msg': {
                if (!clubId) return res.status(400).json({ error: 'clubId required' });
                if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

                // Verify admin
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
                    .from('table_chat')
                    .insert({
                        table_id: tableId,
                        user_id: user.id,
                        message: message.trim().slice(0, 500),
                        message_type: 'dealer',
                        display_name: '🎰 Dealer',
                    })
                    .select()
                    .maybeSingle();

                if (error) throw error;
                return res.status(201).json({ success: true, chat: data });
            }

            case 'history': {
                const { data, error } = await supabaseAdmin
                    .from('table_chat')
                    .select('*')
                    .eq('table_id', tableId)
                    .order('created_at', { ascending: false })
                    .limit(50);

                if (error) throw error;
                return res.status(200).json({ success: true, messages: (data || []).reverse() });
            }

            case 'mute': {
                if (!clubId || !targetUserId) return res.status(400).json({ error: 'clubId and targetUserId required' });

                const { data: membership } = await supabaseAdmin
                    .from('club_members')
                    .select('role')
                    .eq('club_id', clubId)
                    .eq('user_id', user.id)
                    .maybeSingle();
                if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                    return res.status(403).json({ error: 'Admin access required' });
                }

                // Mute for 30 minutes
                const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
                const { error } = await supabaseAdmin
                    .from('table_chat_mutes')
                    .upsert({
                        table_id: tableId,
                        user_id: targetUserId,
                        muted_by: user.id,
                        expires_at: expiresAt,
                    }, { onConflict: 'table_id,user_id' });

                if (error) throw error;
                return res.status(200).json({ success: true, expiresAt });
            }

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
    } catch (err) {
        console.error('[table-chat]', err);
        return res.status(500).json({ error: err.message || 'Internal error' });
    }
}
