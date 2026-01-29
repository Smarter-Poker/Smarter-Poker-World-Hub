/* ═══════════════════════════════════════════════════════════════════════════
   API: Send Live Help Message
   Handles user messages and generates AI responses
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getAgentPrompt } from '../../../src/lib/liveHelp/agentPrompts';
import { collectUserContext } from '../../../src/lib/liveHelp/contextCollector';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { conversationId, content, context } = req.body;

        if (!conversationId || !content?.trim()) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Verify conversation belongs to user
        const { data: conversation, error: convError } = await supabase
            .from('live_help_conversations')
            .select('*')
            .eq('id', conversationId)
            .eq('user_id', user.id)
            .single();

        if (convError || !conversation) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Save user message
        const { data: userMessage, error: userMsgError } = await supabase
            .from('live_help_messages')
            .insert({
                conversation_id: conversationId,
                sender_type: 'user',
                content: content.trim()
            })
            .select()
            .single();

        if (userMsgError) {
            console.error('Failed to save user message:', userMsgError);
            return res.status(500).json({ error: 'Failed to save message' });
        }

        // Get conversation history (last 10 messages)
        const { data: history } = await supabase
            .from('live_help_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .limit(10);

        const conversationHistory = (history || []).reverse();

        // Get agent config
        const agentConfig = getAgentConfig(conversation.agent_id);

        // Build system prompt with context and history
        const systemPrompt = buildSystemPrompt(
            conversation.agent_id,
            context || conversation.context || {},
            conversationHistory
        );

        // Call Grok API
        const grok = getGrokClient();

        const response = await grok.chat.completions.create({
            model: 'grok-beta',
            messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory.slice(-6).map(msg => ({
                    role: msg.sender_type === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })),
                { role: 'user', content: content.trim() }
            ],
            temperature: agentConfig.temperature,
            max_tokens: agentConfig.maxTokens
        });

        const aiResponse = response.choices[0].message.content;

        // Calculate typing delay based on response length
        const typingDelay = calculateTypingDelay(aiResponse, conversation.agent_id);

        // Save agent message
        const { data: agentMessage, error: agentMsgError } = await supabase
            .from('live_help_messages')
            .insert({
                conversation_id: conversationId,
                sender_type: 'agent',
                agent_id: conversation.agent_id,
                content: aiResponse,
                metadata: {
                    model: 'grok-beta',
                    typingDelay,
                    temperature: agentConfig.temperature,
                    tokensUsed: response.usage?.total_tokens
                }
            })
            .select()
            .single();

        if (agentMsgError) {
            console.error('Failed to save agent message:', agentMsgError);
            return res.status(500).json({ error: 'Failed to save response' });
        }

        // Update conversation updated_at
        await supabase
            .from('live_help_conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', conversationId);

        return res.status(200).json({
            userMessage,
            agentMessage,
            typingDelay
        });

    } catch (error) {
        console.error('Send message error:', error);
        return res.status(500).json({
            error: 'Failed to process message',
            details: error.message
        });
    }
}

/**
 * Calculate realistic typing delay based on message length and agent personality
 */
function calculateTypingDelay(message, agentId) {
    const baseDelays = {
        daniel: 40,  // medium
        sarah: 60,   // slow (thoughtful)
        alice: 25,   // fast (direct)
        michael: 40, // medium
        jenny: 40    // medium
    };

    const baseDelay = baseDelays[agentId] || 40;
    const thinkingTime = 500 + Math.random() * 1000; // 500-1500ms thinking
    const typingTime = message.length * baseDelay;

    // Cap at 4 seconds max
    return Math.min(thinkingTime + typingTime, 4000);
}
