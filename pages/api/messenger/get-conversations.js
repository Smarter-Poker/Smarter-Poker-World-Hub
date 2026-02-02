/**
 * 📬 GET CONVERSATIONS API - Service Role Fallback
 * Bypasses RLS using service_role to ensure user always sees their conversations
 * This is a workaround for when client-side auth tokens don't match RLS policies
 */

import { createClient } from '@supabase/supabase-js';

// Use service role to bypass RLS
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, error: 'userId required' });
    }

    console.log('[GET-CONVERSATIONS] Fetching for userId:', userId);

    try {
        // Step 1: Get all conversation IDs where user is a participant
        const { data: participations, error: partError } = await supabaseAdmin
            .from('social_conversation_participants')
            .select('conversation_id, last_read_at')
            .eq('user_id', userId);

        if (partError) {
            console.error('[GET-CONVERSATIONS] Participation query error:', partError);
            return res.status(500).json({ success: false, error: partError.message });
        }

        console.log('[GET-CONVERSATIONS] Found participations:', participations?.length || 0);

        if (!participations || participations.length === 0) {
            return res.json({ success: true, conversations: [] });
        }

        // Step 2: Get conversation details
        const conversationIds = participations.map(p => p.conversation_id);
        const { data: conversations, error: convError } = await supabaseAdmin
            .from('social_conversations')
            .select('id, last_message_at, last_message_preview, is_group')
            .in('id', conversationIds)
            .order('last_message_at', { ascending: false });

        if (convError) {
            console.error('[GET-CONVERSATIONS] Conversation query error:', convError);
            return res.status(500).json({ success: false, error: convError.message });
        }

        // Step 3: For each conversation, get the other participant(s) and unread count
        const enriched = await Promise.all(
            conversations.map(async (conv) => {
                const participation = participations.find(p => p.conversation_id === conv.id);

                // Get other participants
                const { data: otherParticipants } = await supabaseAdmin
                    .from('social_conversation_participants')
                    .select('user_id')
                    .eq('conversation_id', conv.id)
                    .neq('user_id', userId);

                let otherUser = null;
                if (otherParticipants?.[0]?.user_id) {
                    const { data: profile } = await supabaseAdmin
                        .from('profiles')
                        .select('id, username, avatar_url')
                        .eq('id', otherParticipants[0].user_id)
                        .single();
                    otherUser = profile;
                }

                // Count unread messages
                const { count } = await supabaseAdmin
                    .from('social_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('conversation_id', conv.id)
                    .neq('sender_id', userId)
                    .gt('created_at', participation?.last_read_at || '1970-01-01');

                return {
                    id: conv.id,
                    last_message_at: conv.last_message_at,
                    last_message_preview: conv.last_message_preview,
                    is_group: conv.is_group,
                    otherUser,
                    unreadCount: count || 0,
                    last_read_at: participation?.last_read_at,
                };
            })
        );

        // Filter out conversations without other users and sort
        const validConversations = enriched
            .filter(c => c.otherUser)
            .sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                return timeB - timeA;
            });

        console.log('[GET-CONVERSATIONS] Returning conversations:', validConversations.length);

        return res.json({ success: true, conversations: validConversations });

    } catch (error) {
        console.error('[GET-CONVERSATIONS] Error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
