/**
 * Debug endpoint to test messaging system
 * GET /api/debug/test-messaging?user1=username1&user2=username2
 * 
 * Tests the entire message flow:
 * 1. Finds both users by username
 * 2. Gets or creates conversation between them
 * 3. Lists any existing messages
 * 4. Reports conversation participants
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    const { user1, user2 } = req.query;

    if (!user1 || !user2) {
        return res.status(400).json({
            error: 'Please provide user1 and user2 query params (usernames)',
            example: '/api/debug/test-messaging?user1=alice&user2=bob'
        });
    }

    try {
        const results = {};

        // 1. Find both users by username
        const { data: profile1, error: err1 } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', user1)
            .single();

        const { data: profile2, error: err2 } = await supabase
            .from('profiles')
            .select('id, username, full_name')
            .ilike('username', user2)
            .single();

        results.user1 = profile1 || { error: err1?.message || 'Not found' };
        results.user2 = profile2 || { error: err2?.message || 'Not found' };

        if (!profile1 || !profile2) {
            return res.status(404).json({
                success: false,
                error: 'One or both users not found',
                results
            });
        }

        // 2. Check for existing conversation between them
        const { data: existingConvs } = await supabase
            .from('social_conversation_participants')
            .select(`
                conversation_id,
                user_id,
                last_read_at,
                social_conversations (id, last_message_at, last_message_preview, is_group)
            `)
            .eq('user_id', profile1.id);

        // Filter to find conversation with user2
        let sharedConversation = null;
        for (const conv of existingConvs || []) {
            const { data: otherParticipants } = await supabase
                .from('social_conversation_participants')
                .select('user_id')
                .eq('conversation_id', conv.conversation_id);

            const hasUser2 = otherParticipants?.some(p => p.user_id === profile2.id);
            if (hasUser2) {
                sharedConversation = {
                    id: conv.conversation_id,
                    ...conv.social_conversations,
                    participants: otherParticipants
                };
                break;
            }
        }

        results.existingConversation = sharedConversation;

        // 3. If conversation exists, get messages
        if (sharedConversation) {
            const { data: messages } = await supabase
                .from('social_messages')
                .select('id, sender_id, content, created_at')
                .eq('conversation_id', sharedConversation.id)
                .order('created_at', { ascending: false })
                .limit(10);

            results.recentMessages = messages || [];
            results.messageCount = messages?.length || 0;
        }

        // 4. Test RPC function
        try {
            const { data: convId, error: rpcError } = await supabase.rpc('fn_get_or_create_conversation', {
                user1_id: profile1.id,
                user2_id: profile2.id
            });

            results.rpcTest = {
                function: 'fn_get_or_create_conversation',
                result: convId,
                error: rpcError?.message || null
            };
        } catch (e) {
            results.rpcTest = {
                function: 'fn_get_or_create_conversation',
                error: e.message
            };
        }

        // 5. Check if fn_send_message function exists
        try {
            const { data: funcCheck } = await supabase
                .rpc('fn_send_message', {
                    p_conversation_id: '00000000-0000-0000-0000-000000000000',
                    p_sender_id: profile1.id,
                    p_content: 'test'
                });
        } catch (e) {
            // Expected to fail with pg error about conversation, that's fine
            results.fnSendMessage = {
                exists: !e.message.includes('function') && !e.message.includes('does not exist'),
                errorMessage: e.message
            };
        }

        // Summary diagnosis
        results.diagnosis = [];

        if (!sharedConversation) {
            results.diagnosis.push('❌ No existing conversation found between users');
        } else if (sharedConversation.participants?.length !== 2) {
            results.diagnosis.push(`⚠️ Conversation has ${sharedConversation.participants?.length} participants (expected 2)`);
        } else {
            results.diagnosis.push('✅ Conversation exists with correct participants');
        }

        if (results.recentMessages?.length === 0 && sharedConversation) {
            results.diagnosis.push('❌ Conversation exists but has no messages');
        } else if (results.recentMessages?.length > 0) {
            results.diagnosis.push(`✅ Found ${results.recentMessages.length} recent messages`);
        }

        if (results.rpcTest?.error) {
            results.diagnosis.push(`❌ RPC error: ${results.rpcTest.error}`);
        } else {
            results.diagnosis.push('✅ RPC functions work');
        }

        return res.status(200).json({
            success: true,
            results
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}
