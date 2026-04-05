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

        const { data: { user }, error: authErr } = await getSupabase().auth.getUser(token);
        if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const userId = user.id;
        const { host_id, game_id, game_name, message } = req.body;

        if (!host_id || !game_id) {
            return res.status(400).json({ success: false, error: 'host_id and game_id are required' });
        }

        // Can't message yourself
        if (host_id === userId) {
            return res.status(400).json({ success: false, error: "You can't message yourself" });
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
        // Step 1: Check for existing DM
        const { data: existingConvos } = await getSupabase()
            .from('social_conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        let conversationId = null;

        if (existingConvos && existingConvos.length > 0) {
            const userConvoIds = existingConvos.map(c => c.conversation_id);
            // Find a conversation where the host is also a participant
            const { data: hostMatch } = await getSupabase()
                .from('social_conversation_participants')
                .select('conversation_id')
                .eq('user_id', host_id)
                .in('conversation_id', userConvoIds)
                .limit(1);

            if (hostMatch && hostMatch.length > 0) {
                conversationId = hostMatch[0].conversation_id;
            }
        }

        // Step 2: Create new conversation if none exists
        if (!conversationId) {
            const { data: newConvo, error: convoErr } = await getSupabase()
                .from('social_conversations')
                .insert({
                    type: 'dm',
                    created_by: userId,
                })
                .select('id')
                .maybeSingle();

            if (convoErr || !newConvo) {
                console.error('[MessageHost] Failed to create conversation:', convoErr?.message);
                return res.status(500).json({ success: false, error: 'Failed to create conversation' });
            }

            conversationId = newConvo.id;

            // Add both participants
            await getSupabase()
                .from('social_conversation_participants')
                .insert([
                    { conversation_id: conversationId, user_id: userId },
                    { conversation_id: conversationId, user_id: host_id },
                ]);
        }

        // Step 3: Send the message with context tag
        const gameName = game_name || 'a home game';
        const userMessage = message?.trim()
            ? `${message.trim()}\n\n${contextTag}`
            : `Hey! I'm interested in joining ${gameName}. Is there room for a new player? ${contextTag}`;

        const { data: msgId, error: msgErr } = await getSupabase().rpc('fn_send_message', {
            p_conversation_id: conversationId,
            p_sender_id: userId,
            p_content: userMessage,
        });

        if (msgErr) {
            console.error('[MessageHost] Send message error:', msgErr.message);
            return res.status(500).json({ success: false, error: 'Failed to send message' });
        }

        return res.json({
            success: true,
            conversationId,
            msgId,
            message: 'Message sent! Check your Messenger for updates.',
        });

    } catch (err) {
        console.error('[MessageHost API Error]', err);
        if (!res.headersSent) {
            return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
        }
    }
}
