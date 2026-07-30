import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   START GEEVES CONVERSATION — Initialize new poker strategy conversation
   ═══════════════════════════════════════════════════════════════════════════ */

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

          // Fetch user profile for personalized greeting
          const { data: profile } = await getSupabase()
              .from('profiles')
              .select('first_name, username')
              .eq('id', user.id)
              .maybeSingle();

          const userName = profile?.first_name || profile?.username || 'there';

          // Create conversation
          const { data: conversation, error: convError } = await getSupabase()
              .from('geeves_conversations')
              .insert({
                  user_id: user.id,
                  title: 'New Poker Conversation'
              })
              .select()
              .maybeSingle();

          if (convError) {
              throw convError;
          }

          if (!conversation) {
              return res.status(500).json({ error: 'Failed to create conversation' });
          }

          // Create personalized greeting
          const greeting = `Good evening, ${userName}! I'm Geeves, your poker strategy expert.

  I have deep knowledge of:
  • **GTO Strategy** — Optimal play theory
  • **Tournament Poker** — ICM, bubble play, final tables
  • **Cash Games** — All stakes and formats
  • **Hand Analysis** — Detailed breakdowns
  • **Poker Math** — Equity, odds, EV calculations

  What poker question can I help you with today?`;

          // Save greeting message
          const { error: msgErr } = await getSupabase().from('geeves_messages').insert({
              conversation_id: conversation.id,
              content: greeting,
              is_user: false
          });
          if (msgErr) console.warn('[Geeves] Failed to save greeting message:', msgErr.message);

          return res.status(200).json({
              conversationId: conversation.id,
              greeting
          });

      } catch (error) {
          console.warn('[Geeves] Start conversation error:', error);
          return res.status(500).json({ error: 'Failed to start conversation' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
