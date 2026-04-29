/**
 * /api/live-help/* — Hono catch-all router (Phase 4.4 module #8, 2026-04-28)
 *
 * Consolidates 8 previously-separate handlers under a single Hono app.
 * Same pattern as promo/employee/venues/kyc/hendonmob/trivia.
 *
 * Routes (mounted at /api/live-help):
 *   GET  /conversations         — list user's recent conversations (last 5)
 *   GET  /get-conversation      — fetch single conversation + messages
 *   POST /start-conversation    — create new or resume active (rate-limited)
 *   POST /send-message          — Grok-powered AI response (rate-limited)
 *   POST /react                 — helpful/unhelpful reaction on Jarvis msg
 *   POST /create-ticket         — escalate conversation to support ticket + email
 *   POST /track-analytics       — log analytics event
 *   POST /report-bug            — anonymous-OK bug report → admin@smarter.poker
 *
 * Replaces:
 *   conversations.js         (77 LOC)
 *   create-ticket.js         (136 LOC)
 *   get-conversation.js      (87 LOC)
 *   react.js                 (101 LOC)
 *   report-bug.js            (187 LOC)
 *   send-message.js          (194 LOC)
 *   start-conversation.js    (152 LOC)
 *   track-analytics.js       (80 LOC)
 *   = 1014 LOC, now ~720 LOC with shared middleware.
 *
 * Auth pattern (per-route):
 *   - userAuth (required JWT): 7 routes — via getServerUserWithFallback
 *   - optionalAuth: report-bug (anonymous reports allowed; user attribution
 *     applied if Bearer token is valid)
 *
 * Bonus fix: track-analytics.js had dead-code bug at line 9 referencing
 * undefined `supabaseUrl`/`supabaseServiceKey`. Dropped in port.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getGrokClient } from '../../../src/lib/grokClient';
import { getAgentConfig, buildSystemPrompt } from '../../../src/lib/liveHelp/agentPrompts';
import { injectKnowledge } from '../../../src/lib/liveHelp/knowledgeInjection';
import { sendTicketNotification } from '../../../src/lib/emailService';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

function calculateTypingDelay(message) {
  const baseDelay = 40;
  const thinkingTime = 500 + Math.random() * 1000;
  const typingTime = message.length * baseDelay;
  return Math.min(thinkingTime + typingTime, 4000);
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/live-help');

// Required-auth middleware (7 of 8 routes)
const userAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    c.set('user', user);
    await next();
  } catch (err) {
    console.warn('[live-help] auth error:', err);
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// Optional-auth middleware (report-bug only)
const optionalAuth = async (c, next) => {
  try {
    const req = c.env?.req;
    const supabase = getSupabase();
    const { user } = await getServerUserWithFallback(req, supabase);
    c.set('user', user || null);
  } catch {
    c.set('user', null);
  }
  await next();
};

// Rate-limit middleware (writes only)
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Routes ───────────────────────────────────────────────────────────────

// GET /api/live-help/conversations — list recent
app.get('/conversations', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const { data: conversations, error } = await supabase
      .from('live_help_conversations')
      .select(`
        id,
        updated_at,
        live_help_messages!inner ( content )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[live-help/conversations]', error);
      return c.json({ error: 'Failed to fetch conversations' }, 500);
    }

    const formatted = (conversations || []).map(conv => ({
      id: conv.id,
      first_message: conv.live_help_messages[0]?.content || 'New conversation',
      updated_at: conv.updated_at,
    }));

    return c.json({ conversations: formatted });
  } catch (err) {
    console.warn('[live-help/conversations]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /api/live-help/get-conversation — fetch single
app.get('/get-conversation', userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const conversationId = c.req.query('conversationId');
    if (!conversationId) {
      return c.json({ error: 'Missing conversationId' }, 400);
    }

    const { data: conversation, error } = await supabase
      .from('live_help_conversations')
      .select('*, live_help_messages (*)')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const messages = (conversation.live_help_messages || []).sort((a, b) =>
      new Date(a.created_at) - new Date(b.created_at)
    );

    return c.json({
      conversation: {
        id: conversation.id,
        agentId: conversation.agent_id,
        status: conversation.status,
        startedAt: conversation.started_at,
        endedAt: conversation.ended_at,
        context: conversation.context,
      },
      messages,
    });
  } catch (err) {
    console.warn('[live-help/get-conversation]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/live-help/start-conversation
app.post('/start-conversation', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, username')
      .eq('id', user.id)
      .maybeSingle();

    const userName = profile?.first_name || profile?.username || 'there';
    const body = await c.req.json().catch(() => ({}));
    const { agentId, context } = body;

    const { data: existingConversation } = await supabase
      .from('live_help_conversations')
      .select('*, live_help_messages(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConversation) {
      return c.json({
        conversationId: existingConversation.id,
        agentId: existingConversation.agent_id,
        greeting: null,
        messages: existingConversation.live_help_messages || [],
      });
    }

    const selectedAgent = agentId || 'jarvis';

    const { data: conversation, error: convError } = await supabase
      .from('live_help_conversations')
      .insert({
        user_id: user.id,
        agent_id: 'jarvis',
        status: 'active',
      })
      .select()
      .maybeSingle();

    if (convError) {
      console.warn('[live-help/start-conversation] convError:', convError);
      return c.json({
        error: 'Failed to create conversation',
        details: convError.message,
        hint: convError.hint,
      }, 500);
    }

    const greetingMessage = `Hi ${userName}! I'm Jarvis, your Smarter.Poker expert. I can help you with:\n\n• Training games and GTO strategy\n• Club Arena and tournament management\n• Diamond Store and VIP features\n• Social features and messaging\n• Technical support and troubleshooting\n\nWhat can I help you with today?`;

    const { data: greeting } = await supabase
      .from('live_help_messages')
      .insert({
        conversation_id: conversation.id,
        sender_type: 'agent',
        agent_id: selectedAgent,
        content: greetingMessage,
        metadata: { isGreeting: true },
      })
      .select()
      .maybeSingle();

    return c.json({
      conversationId: conversation.id,
      agentId: selectedAgent,
      greeting: greeting?.content || greetingMessage,
      messages: greeting ? [greeting] : [],
    });
  } catch (err) {
    console.warn('[live-help/start-conversation]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/live-help/send-message
app.post('/send-message', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId, content, context } = body;

    if (!conversationId || !content?.trim()) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const { data: conversation, error: convError } = await supabase
      .from('live_help_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (convError || !conversation) {
      return c.json({ error: 'Conversation not found' }, 404);
    }

    const { data: userMessage, error: userMsgError } = await supabase
      .from('live_help_messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'user',
        content: content.trim(),
      })
      .select()
      .maybeSingle();

    if (userMsgError) {
      console.warn('[live-help/send-message] userMsg:', userMsgError);
      return c.json({ error: 'Failed to save message' }, 500);
    }

    const { data: history } = await supabase
      .from('live_help_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (history || []).reverse();
    const agentConfig = getAgentConfig(conversation.agent_id);
    const basePrompt = buildSystemPrompt(
      conversation.agent_id,
      context || conversation.context || {},
      conversationHistory
    );
    const enhancedPrompt = injectKnowledge(
      basePrompt,
      content.trim(),
      context || conversation.context || {}
    );

    const grok = getGrokClient();
    const response = await grok.chat.completions.create({
      model: 'grok-beta',
      messages: [
        { role: 'system', content: enhancedPrompt },
        ...conversationHistory.slice(-6).map(msg => ({
          role: msg.sender_type === 'user' ? 'user' : 'assistant',
          content: msg.content,
        })),
        { role: 'user', content: content.trim() },
      ],
      temperature: agentConfig.temperature,
      max_tokens: agentConfig.maxTokens,
    });

    const aiResponse = response.choices[0].message.content;
    const typingDelay = calculateTypingDelay(aiResponse);

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
          tokensUsed: response.usage?.total_tokens,
        },
      })
      .select()
      .maybeSingle();

    if (agentMsgError) {
      console.warn('[live-help/send-message] agentMsg:', agentMsgError);
      return c.json({ error: 'Failed to save response' }, 500);
    }

    await supabase
      .from('live_help_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    return c.json({ userMessage, agentMessage, typingDelay });
  } catch (err) {
    console.warn('[live-help/send-message]', err);
    return c.json({ error: 'Failed to process message', details: err?.message }, 500);
  }
});

// POST /api/live-help/react
app.post('/react', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { messageId, reaction } = body;

    if (!messageId) {
      return c.json({ success: false, error: 'Missing messageId' }, 400);
    }

    if (reaction === null) {
      const { error: deleteError } = await supabase
        .from('live_help_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id);

      if (deleteError) {
        return c.json({ success: false, error: 'Failed to delete reaction' }, 500);
      }
      return c.json({ success: true, reaction: null });
    }

    if (!['helpful', 'unhelpful'].includes(reaction)) {
      return c.json({ success: false, error: 'Invalid reaction value' }, 400);
    }

    const { data, error } = await supabase
      .from('live_help_reactions')
      .upsert(
        { message_id: messageId, user_id: user.id, reaction },
        { onConflict: 'message_id,user_id' }
      )
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[live-help/react]', error);
      return c.json({ success: false, error: 'Failed to save reaction' }, 500);
    }

    return c.json({ success: true, reaction: data.reaction });
  } catch (err) {
    console.warn('[live-help/react]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/live-help/create-ticket
app.post('/create-ticket', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { conversationId, subject, description, priority = 'medium' } = body;

    if (!subject?.trim() || !description?.trim()) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    if (conversationId) {
      const { data: conversation } = await supabase
        .from('live_help_conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!conversation) {
        return c.json({ error: 'Conversation not found' }, 404);
      }

      await supabase
        .from('live_help_conversations')
        .update({ status: 'escalated' })
        .eq('id', conversationId);
    }

    const { data: ticket, error: ticketError } = await supabase
      .from('live_help_tickets')
      .insert({
        user_id: user.id,
        conversation_id: conversationId || null,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        status: 'open',
      })
      .select()
      .maybeSingle();

    if (ticketError) {
      console.warn('[live-help/create-ticket]', ticketError);
      return c.json({ error: 'Failed to create ticket' }, 500);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', user.id)
      .maybeSingle();

    try {
      await sendTicketNotification({
        ticketId: ticket.id,
        userId: user.id,
        userEmail: profile?.email || user.email,
        userName: profile?.username || 'Unknown User',
        subject: subject.trim(),
        description: description.trim(),
        priority,
        conversationId,
      });
    } catch (emailErr) {
      console.warn('[live-help/create-ticket] email err:', emailErr);
    }

    const ticketNumber = `HELP-${ticket.id.substring(0, 8).toUpperCase()}`;
    return c.json({
      ticketId: ticket.id,
      ticketNumber,
      status: ticket.status,
      createdAt: ticket.created_at,
    });
  } catch (err) {
    console.warn('[live-help/create-ticket]', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /api/live-help/track-analytics
app.post('/track-analytics', writeLimit, userAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { event_type, conversation_id, metadata } = body;

    if (!event_type) {
      return c.json({ success: false, error: 'Event type required' }, 400);
    }

    const { error: insertError } = await supabase
      .from('live_help_analytics')
      .insert({
        user_id: user.id,
        conversation_id,
        event_type,
        metadata: metadata || {},
      });

    if (insertError) throw insertError;

    return c.json({ success: true });
  } catch (err) {
    console.warn('[live-help/track-analytics]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/live-help/report-bug — anonymous OK
app.post('/report-bug', writeLimit, optionalAuth, async (c) => {
  const user = c.get('user');
  const supabase = getSupabase();
  try {
    const body = await c.req.json().catch(() => ({}));
    const { subject, description, priority = 'medium', currentPage, userAgent } = body;

    if (!subject?.trim() || !description?.trim()) {
      return c.json({ error: 'Subject and description are required' }, 400);
    }

    let userId = null;
    let userName = 'Anonymous User';
    let userEmail = 'unknown';

    if (user) {
      userId = user.id;
      userEmail = user.email || 'unknown';
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();
      userName = profile?.username || user.email || 'Unknown User';
    }

    let ticketId = null;
    try {
      const { data: result, error: rpcError } = await supabase.rpc('fn_submit_bug_report_to_admin', {
        p_sender_id: userId,
        p_subject: subject.trim(),
        p_description: description.trim(),
        p_priority: priority,
        p_current_page: currentPage || 'unknown',
        p_user_agent: userAgent || 'unknown',
      });

      if (rpcError) throw rpcError;
      if (result?.success) {
        ticketId = result.ticket_id;
        console.debug(`[ReportBug] Atomic bug report successful: Ticket ${ticketId}, MSG: ${result.message_id}`);
      } else {
        console.warn('[ReportBug] Atomic bug report failed internally:', result?.error);
      }
    } catch (dbErr) {
      console.warn('[ReportBug] DB insert failed (non-fatal):', dbErr.message);
    }

    try {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);

      const priorityColors = {
        low: { bg: '#00ff88', text: 'black' },
        medium: { bg: '#ffa500', text: 'white' },
        high: { bg: '#ff4444', text: 'white' },
      };
      const pColor = priorityColors[priority] || priorityColors.medium;
      const ticketRef = ticketId
        ? `BUG-${ticketId.substring(0, 8).toUpperCase()}`
        : `BUG-${Date.now().toString(36).toUpperCase()}`;

      await resend.emails.send({
        from: 'Bug Reports <support@smarter.poker>',
        to: ['admin@smarter.poker'],
        replyTo: userEmail !== 'unknown' ? userEmail : undefined,
        subject: `[${priority.toUpperCase()}] Bug Report: ${subject.trim().substring(0, 80)}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: 'Inter', Arial, sans-serif; background: #0a0e1a; color: #ffffff; padding: 20px; margin: 0; }
              .container { max-width: 600px; margin: 0 auto; background: linear-gradient(180deg, rgba(0, 20, 45, 0.98), rgba(0, 10, 30, 0.99)); border: 1px solid rgba(255, 80, 80, 0.3); border-radius: 12px; padding: 30px; }
              .header { border-bottom: 2px solid #ff4444; padding-bottom: 20px; margin-bottom: 20px; }
              .header h1 { color: #ff6b6b; margin: 0; font-size: 22px; }
              .priority { display: inline-block; padding: 4px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
              .field { margin-bottom: 16px; }
              .label { color: rgba(255, 255, 255, 0.5); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
              .value { color: #ffffff; font-size: 14px; line-height: 1.6; }
              .description-box { background: rgba(255, 80, 80, 0.08); border: 1px solid rgba(255, 80, 80, 0.2); border-radius: 8px; padding: 16px; margin-top: 16px; }
              .meta { background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 12px; color: rgba(255, 255, 255, 0.4); }
              .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255, 80, 80, 0.15); font-size: 11px; color: rgba(255, 255, 255, 0.4); }
              code { background: rgba(0, 212, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #00d4ff; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Bug Report</h1>
                <span class="priority" style="background: ${pColor.bg}; color: ${pColor.text};">${priority}</span>
                <span style="float: right; font-size: 12px; color: rgba(255,255,255,0.4);">${ticketRef}</span>
              </div>
              <div class="field">
                <div class="label">Subject</div>
                <div class="value"><strong>${subject.trim()}</strong></div>
              </div>
              <div class="field">
                <div class="label">Reported By</div>
                <div class="value">${userName}${userEmail !== 'unknown' ? ` (<a href="mailto:${userEmail}" style="color: #00d4ff;">${userEmail}</a>)` : ''}</div>
              </div>
              ${userId ? `
              <div class="field">
                <div class="label">User ID</div>
                <div class="value"><code>${userId}</code></div>
              </div>
              ` : ''}
              <div class="description-box">
                <div class="label">Bug Description</div>
                <div class="value">${description.trim().replace(/\n/g, '<br>')}</div>
              </div>
              <div class="meta">
                <div><strong>Page:</strong> ${currentPage || 'N/A'}</div>
                <div style="margin-top: 4px;"><strong>Browser:</strong> ${(userAgent || 'N/A').substring(0, 120)}</div>
                <div style="margin-top: 4px;"><strong>Reported At:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CST</div>
              </div>
              <div class="footer">
                <p>This bug report was submitted via the Geeves messenger widget on Smarter.Poker</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      console.debug(`[ReportBug] Bug report sent to admin@smarter.poker: ${ticketRef}`);
    } catch (emailErr) {
      console.warn('[ReportBug] Email send failed:', emailErr?.message);
    }

    return c.json({
      success: true,
      ticketId,
      message: 'Bug report submitted successfully',
    });
  } catch (err) {
    console.warn('[live-help/report-bug]', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[live-help] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[live-help] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
