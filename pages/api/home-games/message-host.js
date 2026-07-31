import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * Message Host API — Send an initial outreach to a home game host
 * POST /api/home-games/message-host
 *
 * Body: { host_id, game_id, game_name, message }
 * Auth: Bearer token required
 *
 * Anti-spam: 1 initial outreach per game per user per 24h.
 * After first contact, users chat freely in Messenger.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * Resolve the existing 1:1 DM thread shared by two users, if any.
 *
 * The previous implementation matched ANY conversation both users belong to.
 * If the pair also shared a club or event group chat, the private
 * "I want to join your home game" inquiry was posted into that group thread
 * where every other participant could read it. social_conversations marks 1:1
 * threads with is_group=false (there is no `type` column), so the candidate
 * set is verified against that before reuse.
 *
 * Returns the earliest-created matching DM (id as tie-break) so concurrent
 * callers deterministically converge on the same thread.
 */
async function findSharedDmConversationId(userId, hostId) {
    const { data: myConvos } = await getSupabase()
        .from('social_conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .limit(1000);

    if (!myConvos || myConvos.length === 0) return null;

    const myConvoIds = Array.from(new Set(myConvos.map((c) => c.conversation_id).filter(Boolean)));
    if (myConvoIds.length === 0) return null;

    const { data: hostMatch } = await getSupabase()
        .from('social_conversation_participants')
        .select('conversation_id')
        .eq('user_id', hostId)
        .in('conversation_id', myConvoIds)
        .limit(1000);

    if (!hostMatch || hostMatch.length === 0) return null;

    const sharedIds = Array.from(new Set(hostMatch.map((c) => c.conversation_id).filter(Boolean)));
    if (sharedIds.length === 0) return null;

    const { data: dmRows } = await getSupabase()
        .from('social_conversations')
        .select('id, created_at')
        .in('id', sharedIds)
        .eq('is_group', false)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(1);

    return dmRows && dmRows.length > 0 ? dmRows[0].id : null;
}

export default async function handler(req, res) {
    try {
        if (!applyRateLimit(req, res, LIMITS.write)) return;

        if (req.method !== 'POST') {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return res.status(500).json({ success: false, error: 'Service key not configured' });
        }

        // Auth verification
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        const user = authData?.user;
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const userId = user.id;
        const { host_id, game_id, game_name, message } = req.body;

        // Validate required fields as UUIDs — the prior code trusted raw
        // strings, which meant two failure modes:
        //   (a) malformed IDs produced opaque PostgREST errors later, and
        //   (b) an attacker could supply any UUID as host_id + an
        //       attacker-invented game_id and trigger an outbound DM to
        //       ANY platform user. The rate-limit check is keyed on the
        //       game_id tag, so any fresh random UUID bypasses it.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!host_id || typeof host_id !== 'string' || !UUID_RE.test(host_id)) {
            return res.status(400).json({ success: false, error: 'host_id must be a UUID' });
        }
        if (!game_id || typeof game_id !== 'string' || !UUID_RE.test(game_id)) {
            return res.status(400).json({ success: false, error: 'game_id must be a UUID' });
        }

        // Can't message yourself
        if (host_id === userId) {
            return res.status(400).json({ success: false, error: "You can't message yourself" });
        }

        // CRITICAL: verify host_id actually hosts game_id. Without this check
        // the endpoint is a "DM any user, rate-limited per made-up game_id"
        // backchannel — an attacker who knows a victim's UUID can spam them
        // indefinitely by rotating fake game_ids.
        const { data: gameRow, error: gameErr } = await getSupabase()
            .from('commander_home_games')
            .select('id, host_id, group_id, title')
            .eq('id', game_id)
            .maybeSingle();
        if (gameErr) {
            console.warn('[MessageHost] Game lookup failed:', gameErr?.message);
            return res.status(500).json({ success: false, error: 'Game lookup failed' });
        }
        if (!gameRow) {
            return res.status(404).json({ success: false, error: 'Game not found' });
        }
        if (String(gameRow.host_id) !== String(host_id)) {
            // Don't leak whether the game exists with a different host —
            // just reject with the same message. Prevents host enumeration.
            return res.status(400).json({ success: false, error: 'host_id does not match game' });
        }

        // Sanitize the user-supplied message here. 2000 char cap mirrors the
        // broadcast endpoint and is above fn_send_message's own ceiling.
        if (message != null && (typeof message !== 'string' || message.length > 2000)) {
            return res.status(400).json({ success: false, error: 'message too long (max 2000 chars)' });
        }

        // Anti-spam: Check if user already messaged this host about this game in last 24h
        const contextTag = `[HOME_GAME_INQUIRY:${game_id}]`;
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: recentMessages } = await getSupabase()
            .from('social_messages')
            .select('id')
            .eq('sender_id', userId)
            .ilike('content', `%${contextTag}%`)
            .gte('created_at', twentyFourHoursAgo)
            .limit(1);

        if (recentMessages && recentMessages.length > 0) {
            return res.status(429).json({
                success: false,
                error: "You've already messaged this host today. Check your Messenger for their reply.",
                alreadyMessaged: true,
            });
        }

        // Find or create a DM conversation between user and host
        // Step 1: Check for an existing 1:1 DM.
        let conversationId = await findSharedDmConversationId(userId, host_id);

        // Step 2: Create new conversation if none exists
        if (!conversationId) {
            // social_conversations discriminates 1:1 threads with is_group=false
            // (there is no `type` column) — same shape the messenger RPC uses.
            const { data: newConvo, error: convoErr } = await getSupabase()
                .from('social_conversations')
                .insert({ is_group: false })
                .select('id')
                .maybeSingle();

            if (convoErr || !newConvo) {
                console.warn('[MessageHost] Failed to create conversation:', convoErr?.message);
                return res.status(500).json({ success: false, error: 'Failed to create conversation' });
            }

            conversationId = newConvo.id;

            // Add both participants
            const { error: err_social_conversation_participants_7zo80 } = await getSupabase()
              .from('social_conversation_participants')
              .insert([
                    { conversation_id: conversationId, user_id: userId },
                    { conversation_id: conversationId, user_id: host_id },
                ]);
            if (err_social_conversation_participants_7zo80) console.warn('[Supabase] Silent mutation failed in social_conversation_participants:', err_social_conversation_participants_7zo80.message);

            // Step 2b: Check-then-insert above is not atomic — two concurrent
            // first-contact requests both see "no DM" and both create one.
            // Re-resolve and take the deterministic winner (earliest created,
            // id as tie-break). Both racers converge on the SAME thread, so the
            // messages land together instead of in two split conversations.
            const settledId = await findSharedDmConversationId(userId, host_id);
            if (settledId) conversationId = settledId;
        }

        // Step 3: Send the message with context tag.
        // Use the authoritative title from the game row. body.game_name is
        // caller-controlled and unbounded — it must never be interpolated raw,
        // or it bypasses the 2000-char cap enforced on `message`.
        const safeGameName = (typeof game_name === 'string' && game_name.trim())
            ? game_name.trim().slice(0, 120)
            : null;
        const gameName = (typeof gameRow.title === 'string' && gameRow.title.trim())
            ? gameRow.title.trim().slice(0, 120)
            : (safeGameName || 'a home game');
        const userMessage = message?.trim()
            ? `${message.trim()}\n\n${contextTag}`
            : `Hey! I'm interested in joining ${gameName}. Is there room for a new player? ${contextTag}`;

        const { data: msgId, error: msgErr } = await getSupabase().rpc('fn_send_message', {
            p_conversation_id: conversationId,
            p_sender_id: userId,
            p_content: userMessage,
        });

        if (msgErr) {
            console.warn('[MessageHost] Send message error:', msgErr.message);
            return res.status(500).json({ success: false, error: 'Failed to send message' });
        }

        return res.json({
            success: true,
            conversationId,
            msgId,
            message: 'Message sent! Check your Messenger for updates.',
        });

    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('[MessageHost API Error]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}
