import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Live Session API — "I'm At The Table" Broadcasting
 * ═══════════════════════════════════════════════════════════════════════════
 * POST /api/social/live-session
 *   action=start  — Start a live session
 *   action=update — Update profit/status/notes
 *   action=end    — End the session
 * GET /api/social/live-session
 *   ?type=friends — Active sessions from friends
 *   ?type=public  — All public active sessions
 *   ?type=mine    — Current user's active session
 *   ?session_id=  — Specific session details
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    try {
        const sb = getSupabase();
        
        // Auth
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ error: 'Auth required' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

        if (req.method === 'POST') {
            const { action } = req.body;

            if (action === 'start') {
                const { venue_id, venue_name, game_type, stakes, privacy, notes } = req.body;

                // Enforce: only one active session per user
                const { data: existing } = await sb.from('live_sessions')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .limit(1);
                if (existing && existing.length > 0) {
                    return res.status(400).json({ error: 'You already have an active session. End it first.' });
                }

                // Generate LiveKit room name
                const roomName = `session-${user.id.slice(0, 8)}-${Date.now()}`;

                const { data: session, error: insertErr } = await sb.from('live_sessions').insert({
                    user_id: user.id,
                    venue_id: venue_id || null,
                    venue_name: venue_name || 'Live Poker',
                    game_type: game_type || 'NLH',
                    stakes: stakes || '$1/$2',
                    privacy: privacy || 'friends',
                    notes: notes || null,
                    livekit_room: roomName,
                    status: 'active',
                }).select().maybeSingle();

                if (insertErr) {
                    console.warn('[Live Session API] Start session error:', insertErr);
                    return res.status(500).json({ error: 'Failed to start session' });
                }
                return res.status(200).json({ session });
            }

            if (action === 'update') {
                const { session_id, current_profit, status, notes } = req.body;
                if (!session_id) return res.status(400).json({ error: 'session_id required' });

                const updates = {};
                if (current_profit !== undefined) updates.current_profit = parseInt(current_profit, 10) || 0;
                if (status && ['active', 'break'].includes(status)) updates.status = status;
                if (notes !== undefined) updates.notes = notes;

                const { data, error: updErr } = await sb.from('live_sessions')
                    .update(updates)
                    .eq('id', session_id)
                    .eq('user_id', user.id)
                    .select()
                    .maybeSingle();

                if (updErr) {
                    console.warn('[Live Session API] Update error:', updErr);
                    return res.status(500).json({ error: 'Failed to update session' });
                }
                return res.status(200).json({ session: data });
            }

            if (action === 'end') {
                const { session_id } = req.body;
                if (!session_id) return res.status(400).json({ error: 'session_id required' });

                const { data, error: endErr } = await sb.from('live_sessions')
                    .update({ status: 'ended', ended_at: new Date().toISOString() })
                    .eq('id', session_id)
                    .eq('user_id', user.id)
                    .select()
                    .maybeSingle();

                if (endErr) {
                    console.warn('[Live Session API] End session error:', endErr);
                    return res.status(500).json({ error: 'Failed to end session' });
                }
                return res.status(200).json({ session: data });
            }

            // Chat message
            if (action === 'chat') {
                const { session_id, message } = req.body;
                if (!session_id || !message) return res.status(400).json({ error: 'session_id and message required' });
                if (message.length > 500) return res.status(400).json({ error: 'Message too long (max 500 chars)' });

                const { data: msg, error: chatErr } = await sb.from('session_chat_messages').insert({
                    session_id, user_id: user.id, message: message.trim(),
                }).select('*, profiles:user_id(username, avatar_url)').maybeSingle();

                if (chatErr) {
                    console.warn('[Live Session API] Chat error:', chatErr);
                    return res.status(500).json({ error: 'Failed to send chat message' });
                }
                return res.status(200).json({ message: msg });
            }

            return res.status(400).json({ error: 'Invalid action' });
        }

        if (req.method === 'GET') {
            // Live session data is auth-protected and real-time — no CDN caching
            res.setHeader('Cache-Control', 'private, no-store');
            const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
            const type = safeQ(req.query.type);
            const session_id = safeQ(req.query.session_id);

            // Get specific session
            if (session_id) {
                const { data } = await sb.from('live_sessions')
                    .select('*, profiles:user_id(username, avatar_url, full_name)')
                    .eq('id', session_id)
                    .maybeSingle();
                return res.status(200).json({ session: data });
            }

            // Get current user's active session
            if (type === 'mine') {
                const { data } = await sb.from('live_sessions')
                    .select('*')
                    .eq('user_id', user.id)
                    .eq('status', 'active')
                    .limit(1)
                    .maybeSingle();
                return res.status(200).json({ session: data || null });
            }

            // Get friend sessions
            if (type === 'friends') {
                // Get friend IDs
                const { data: friendRows } = await sb.from('friendships')
                    .select('user_id, friend_id')
                    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
                    .eq('status', 'accepted');

                const friendIds = (friendRows || []).map(f =>
                    f.user_id === user.id ? f.friend_id : f.user_id
                );

                if (friendIds.length === 0) return res.status(200).json({ sessions: [] });

                const { data: sessions } = await sb.from('live_sessions')
                    .select('*, profiles:user_id(username, avatar_url, full_name)')
                    .in('user_id', friendIds)
                    .in('status', ['active', 'break'])
                    .in('privacy', ['public', 'friends'])
                    .order('started_at', { ascending: false });

                return res.status(200).json({ sessions: sessions || [] });
            }

            // Public sessions
            const { data: sessions } = await sb.from('live_sessions')
                .select('*, profiles:user_id(username, avatar_url, full_name)')
                .eq('privacy', 'public')
                .in('status', ['active', 'break'])
                .order('started_at', { ascending: false })
                .limit(50);

            return res.status(200).json({ sessions: sessions || [] });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[Live Session API] Error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
