import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   API: Create Live Help Ticket
   Escalates conversation to support ticket
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { sendTicketNotification } from '../../../src/lib/emailService';
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
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authError || !user) {
              return res.status(401).json({ error: 'Invalid token' });
          }

          const { conversationId, subject, description, priority = 'medium' } = req.body;

          if (!subject?.trim() || !description?.trim()) {
              return res.status(400).json({ error: 'Missing required fields' });
          }

          // Verify conversation belongs to user (if provided)
          if (conversationId) {
              const { data: conversation } = await getSupabase()
                  .from('live_help_conversations')
                  .select('id')
                  .eq('id', conversationId)
                  .eq('user_id', user.id)
                  .maybeSingle();

              if (!conversation) {
                  return res.status(404).json({ error: 'Conversation not found' });
              }

              // Update conversation status to escalated
              const { error: err_live_help_conversations_8znhb } = await getSupabase()
                .from('live_help_conversations')
                .update({ status: 'escalated' })
                  .eq('id', conversationId);
              if (err_live_help_conversations_8znhb) console.warn('[Supabase] Silent mutation failed in live_help_conversations:', err_live_help_conversations_8znhb.message);
          }

          // Create ticket
          const { data: ticket, error: ticketError } = await getSupabase()
              .from('live_help_tickets')
              .insert({
                  user_id: user.id,
                  conversation_id: conversationId || null,
                  subject: subject.trim(),
                  description: description.trim(),
                  priority: priority,
                  status: 'open'
              })
              .select()
              .maybeSingle();

          if (ticketError) {
              console.warn('Failed to create ticket:', ticketError);
              return res.status(500).json({ error: 'Failed to create ticket' });
          }

          // Get user profile for email
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('username, email')
              .eq('id', user.id)
              .maybeSingle();

          // Send email notification via Resend
          try {
              await sendTicketNotification({
                  ticketId: ticket.id,
                  userId: user.id,
                  userEmail: profile?.email || user.email,
                  userName: profile?.username || 'Unknown User',
                  subject: subject.trim(),
                  description: description.trim(),
                  priority: priority,
                  conversationId: conversationId
              });
          } catch (emailError) {
              console.warn('[LiveHelp] Failed to send ticket email:', emailError);
              // Don't fail the request if email fails
          }

          // Generate ticket number (e.g., HELP-12345)
          const ticketNumber = `HELP-${ticket.id.substring(0, 8).toUpperCase()}`;

          return res.status(200).json({
              ticketId: ticket.id,
              ticketNumber,
              status: ticket.status,
              createdAt: ticket.created_at
          });

      } catch (error) {
          console.warn('Create ticket error:', error);
          return res.status(500).json({ error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


