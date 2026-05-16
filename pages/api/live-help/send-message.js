/* ═══════════════════════════════════════════════════════════════════════════
   API: Send Live Help Message
   Handles user messages and generates AI responses
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getAgentConfig, buildSystemPrompt } from '../../../src/lib/liveHelp/agentPrompts';
import { injectKnowledge } from '../../../src/lib/liveHelp/knowledgeInjection';
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

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ error: 'Unauthorized' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
          const user = authData?.user;

          if (authError || !user) {
              return res.status(401).json({ error: 'Invalid token' });
          }

          const { conversationId, content, context } = req.body;

          if (!conversationId || !content?.trim()) {
              return res.status(400).json({ error: 'Missing required fields' });
          }

          // Verify conversation belongs to user
          const { data: conversation, error: convError } = await getSupabase()
              .from('live_help_conversations')
              .select('*')
              .eq('id', conversationId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (convError || !conversation) {
              return res.status(404).json({ error: 'Conversation not found' });
          }

          // Save user message
          const { data: userMessage, error: userMsgError } = await getSupabase()
              .from('live_help_messages')
              .insert({
                  conversation_id: conversationId,
                  sender_type: 'user',
                  content: content.trim()
              })
              .select()
              .maybeSingle();

          if (userMsgError) {
              console.warn('Failed to save user message:', userMsgError);
              return res.status(500).json({ error: 'Failed to save message' });
          }

          // Get conversation history (last 10 messages)
          const { data: history } = await getSupabase()
              .from('live_help_messages')
              .select('*')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .limit(10);

          const conversationHistory = (history || []).reverse();

          // Get agent config
          const agentConfig = getAgentConfig(conversation.agent_id);

          // Build base system prompt with context and history
          const basePrompt = buildSystemPrompt(
              conversation.agent_id,
              context || conversation.context || {},
              conversationHistory
          );

          // Inject relevant knowledge based on user's question and context
          const enhancedPrompt = injectKnowledge(
              basePrompt,
              content.trim(),
              context || conversation.context || {}
          );


          // Call Grok API with enhanced prompt
          const grok = getGrokClient();

          const response = await grok.chat.completions.create({
              model: 'grok-beta',
              messages: [
                  { role: 'system', content: enhancedPrompt },
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
          const { data: agentMessage, error: agentMsgError } = await getSupabase()
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
              .maybeSingle();

          if (agentMsgError) {
              console.warn('Failed to save agent message:', agentMsgError);
              return res.status(500).json({ error: 'Failed to save response' });
          }

          // Update conversation updated_at
          const { error: err_live_help_conversations_jkjwu } = await getSupabase()
            .from('live_help_conversations')
            .update({ updated_at: new Date().toISOString() })
              .eq('id', conversationId);
          if (err_live_help_conversations_jkjwu) console.warn('[Supabase] Silent mutation failed in live_help_conversations:', err_live_help_conversations_jkjwu.message);

          return res.status(200).json({
              userMessage,
              agentMessage,
              typingDelay
          });

      } catch (error) {
          console.warn('Send message error:', error);
          return res.status(500).json({
              error: 'Failed to process message',
              details: error.message
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Calculate realistic typing delay based on message length
 */
function calculateTypingDelay(message, agentId) {
    const baseDelay = 40; // Medium typing speed for Jarvis
    const thinkingTime = 500 + Math.random() * 1000; // 500-1500ms thinking
    const typingTime = message.length * baseDelay;

    // Cap at 4 seconds max
    return Math.min(thinkingTime + typingTime, 4000);
}

