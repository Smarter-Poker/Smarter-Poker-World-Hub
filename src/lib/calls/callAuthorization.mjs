/*
 * WHO MAY CALL WHOM (2026-10-31).
 *
 * A Messenger call belongs to a 1:1 conversation. Both the call-creation route
 * and the LiveKit token route ask the same question here, so they can never
 * disagree about whether a call is allowed:
 *
 *   - the conversation exists, is not a group and is not an unaccepted request
 *   - the user is one of its participants, and it has exactly two
 *   - neither participant has blocked the other
 *
 * Takes a service-role Supabase client. Returns { ok: true, otherUserId } or
 * { ok: false, status, error }. Never throws for an ordinary refusal.
 */
import { isConversationId } from './callRoom.mjs';

export async function authorizeCallConversation(sb, { conversationId, userId }) {
    if (!isConversationId(conversationId) || !userId) {
        return { ok: false, status: 400, error: 'This call is missing its conversation.' };
    }

    const { data: conversation, error: conversationError } = await sb
        .from('social_conversations')
        .select('id, is_group, is_request')
        .eq('id', conversationId)
        .maybeSingle();
    if (conversationError) return { ok: false, status: 503, error: 'Could not verify this conversation.' };
    if (!conversation) return { ok: false, status: 404, error: 'This conversation no longer exists.' };
    if (conversation.is_group) return { ok: false, status: 403, error: 'Calls Are Only Available In 1-on-1 Conversations' };
    if (conversation.is_request) return { ok: false, status: 403, error: 'Accept The Message Request Before Calling' };

    const { data: participants, error: participantError } = await sb
        .from('social_conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .limit(3);
    if (participantError) return { ok: false, status: 503, error: 'Could not verify this conversation.' };
    const ids = [...new Set((participants || []).map(row => row.user_id).filter(Boolean))];
    if (!ids.includes(userId)) return { ok: false, status: 403, error: 'You are not part of this conversation.' };
    if (ids.length !== 2) return { ok: false, status: 403, error: 'Calls Are Only Available In 1-on-1 Conversations' };
    const otherUserId = ids.find(id => id !== userId);

    const { data: blocks, error: blockError } = await sb
        .from('messenger_blocked')
        .select('blocker_id')
        .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${userId})`)
        .limit(1);
    if (blockError) return { ok: false, status: 503, error: 'Could not verify this conversation.' };
    if (Array.isArray(blocks) && blocks.length > 0) return { ok: false, status: 403, error: 'This Person Cannot Be Called' };

    return { ok: true, otherUserId };
}
