/* ═══════════════════════════════════════════════════════════════════════════
   API: Start Live Help Conversation
   Creates new conversation or resumes existing active one
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const AGENTS = ['daniel', 'sarah', 'alice', 'michael', 'jenny'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get authenticated user from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { agentId, context } = req.body;

        // Check for existing active conversation
        const { data: existingConversation } = await supabase
            .from('live_help_conversations')
            .select('*, live_help_messages(*)')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingConversation) {
            // Resume existing conversation
            return res.status(200).json({
                conversationId: existingConversation.id,
                agentId: existingConversation.agent_id,
                greeting: null, // No greeting for resumed conversations
                messages: existingConversation.live_help_messages || []
            });
        }

        // Create new conversation
        const selectedAgent = agentId || AGENTS[Math.floor(Math.random() * AGENTS.length)];

        const { data: conversation, error: convError } = await supabase
            .from('live_help_conversations')
            .insert({
                user_id: user.id,
                agent_id: selectedAgent,
                status: 'active',
                context: context || {}
            })
            .select()
            .single();

        if (convError) {
            console.error('[LiveHelp] Failed to create conversation:', {
                error: convError,
                message: convError.message,
                details: convError.details,
                hint: convError.hint,
                code: convError.code
            });
            return res.status(500).json({
                error: 'Failed to create conversation',
                details: convError.message,
                hint: convError.hint
            });
        }

        // Create greeting message
        const greetingText = getAgentGreeting(selectedAgent);

        const { data: greetingMessage, error: msgError } = await supabase
            .from('live_help_messages')
            .insert({
                conversation_id: conversation.id,
                sender_type: 'agent',
                agent_id: selectedAgent,
                content: greetingText,
                metadata: { isGreeting: true }
            })
            .select()
            .single();

        if (msgError) {
            console.error('Failed to create greeting message:', msgError);
        }

        return res.status(200).json({
            conversationId: conversation.id,
            agentId: selectedAgent,
            greeting: greetingText,
            messages: greetingMessage ? [greetingMessage] : []
        });

    } catch (error) {
        console.error('Start conversation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * Get greeting message for agent
 */
function getAgentGreeting(agentId) {
    const greetings = {
        daniel: "Hi there! I'm Daniel, your GTO Strategy Coach. What can I help you with today?",
        sarah: "Hey! I'm Sarah, here to help with mindset and performance. How are you feeling about your game?",
        alice: "I'm Alice, your Drill Master. Ready to level up your skills? What do you want to work on?",
        michael: "Hi! I'm Michael, your Bankroll Advisor. Let's talk about building your bankroll sustainably. What's on your mind?",
        jenny: "Hey there! I'm Jenny, your Live Game Expert. Want to talk reads, tells, or table dynamics? What's up?"
    };

    return greetings[agentId] || "Hi! How can I help you today?";
}
