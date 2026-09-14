import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
      // get-messages is a read-only operation — apply the read limit (higher allowance)
      if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return res.status(500).json({ success: false, error: 'Service key not configured' });
      }

      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

      const userId = user.id; // From JWT, NOT body
      const { conversationId, before, beforeId, limit: reqLimit } = req.body;

      if (!conversationId) {
          return res.status(400).json({ success: false, error: 'Missing conversationId' });
      }

      // Pagination: cap limit at 200
      const pageLimit = Math.max(1, Math.min(parseInt(reqLimit) || 100, 200));
      if (before && (typeof before !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before) || !Number.isFinite(Date.parse(before)) || (beforeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(beforeId)))) {
          return res.status(400).json({ success: false, error: 'Invalid Message Cursor' });
      }

      try {
          // First verify user is a participant in this conversation (security check)
          const { data: participant, error: partError } = await getSupabase()
              .from('social_conversation_participants')
              .select('id')
              .eq('conversation_id', conversationId)
              .eq('user_id', userId)
              .maybeSingle();

          if (partError || !participant) {
              return res.status(403).json({ success: false, error: 'Not a participant in this conversation' });
          }

          // Fetch messages with sender profiles (with pagination support)
          let query = getSupabase()
              .from('social_messages')
              .select(`
                  id,
                  content,
                  message_type,
                  media_metadata,
                  created_at,
                  updated_at,
                  sender_id,
                  is_deleted,
                  is_edited,
                  profiles:sender_id (id, username, avatar_url, is_vip)
              `)
              .eq('conversation_id', conversationId)
              .eq('is_deleted', false);

          // Pagination: load messages before a given timestamp
          if (before) {
              // Backward pagination: descending to get the N most recent before cursor
              const cursorTime = before; // Preserve PostgreSQL microseconds across equal-time pages.
              query = (beforeId ? query.or(`created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${beforeId})`) : query.lt('created_at', cursorTime))
                  .order('created_at', { ascending: false }).order('id', { ascending: false })
                  .limit(pageLimit);
          } else {
              // Initial load: descending to get newest N, then reverse for display
              query = query.order('created_at', { ascending: false }).order('id', { ascending: false })
                  .limit(pageLimit);
          }

          const { data: messages, error } = await query;

          if (error) {
              console.warn('[ANTIGRAVITY] Error fetching messages:', error);
              return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          // Reverse descending order to chronological ascending for display
          const sorted = [...(messages || [])].reverse();
          // Issued content stays immutable. Display the current payment state
          // from the linked invoice, never from an old message snapshot.
          const liveInvoices = new Map();
          const invoiceMessages = sorted.filter(m => m.message_type === 'invoice').map(m => m.id);
          if (invoiceMessages.length) {
              const { data: links, error: linksError } = await getSupabase().from('accounting_invoice_deliveries')
                  .select('message_id,invoice_id').in('message_id', invoiceMessages);
              if (linksError) throw linksError;
              const invoiceIds = [...new Set((links || []).map(link => link.invoice_id))];
              if (invoiceIds.length) {
                  const { data: invoices, error: invoiceError } = await getSupabase().from('settlement_invoices')
                      .select('id,status,chips_transferred').in('id', invoiceIds);
                  if (invoiceError) throw invoiceError;
                  const byId = new Map((invoices || []).map(invoice => [invoice.id, invoice]));
                  for (const link of links || []) {
                      const invoice = byId.get(link.invoice_id);
                      if (!invoice) throw new Error('Invoice Status Unavailable');
                      liveInvoices.set(link.message_id, invoice);
                  }
              }
          }

          // Reactions, in ONE query for the whole page.
          //
          // This route never returned reactions, and the get_message_reactions
          // RPC that existed for it had no callers anywhere - so even once the
          // writes were fixed (message_reactions' FK pointed at the wrong
          // messages table and every insert had been failing silently),
          // reactions still vanished on reload. The client was maintaining them
          // optimistically and nothing else.
          const reactionsByMessage = {};
          if (sorted.length) {
              const { data: reactionRows, error: reactionErr } = await getSupabase()
                  .rpc('fn_get_reactions_for_messages', { p_message_ids: sorted.map(m => m.id) });
              if (reactionErr) {
                  console.warn('[messenger/get-messages] reactions unavailable:', reactionErr.message);
              } else {
                  for (const r of reactionRows || []) {
                      (reactionsByMessage[r.message_id] ||= []).push({
                          reaction: r.reaction,
                          user_id: r.user_id,
                          username: r.username || null,
                      });
                  }
              }
          }

          const normalized = sorted.map(m => {
              const invoice = liveInvoices.get(m.id);
              if (invoice) m = { ...m, media_metadata: { ...m.media_metadata, issued_status: m.media_metadata?.status,
                  status: invoice.status, chips_transferred: invoice.chips_transferred } };
              let prof = m.profiles;
              if (m.media_metadata && m.media_metadata.is_club_identity && m.media_metadata.club_id) {
                  prof = {
                      id: m.profiles?.id || m.sender_id,
                      username: m.media_metadata.club_name || m.profiles?.username,
                      avatar_url: m.media_metadata.club_avatar || m.profiles?.avatar_url,
                      is_club_identity: true,
                      club_id: m.media_metadata.club_id,
                      is_vip: m.profiles?.is_vip || false
                  };
              }
              return {
                  ...m,
                  profiles: prof,
                  text: m.content ?? null, // alias content → text for frontend compatibility
                  reactions: reactionsByMessage[m.id] || [],
              };
          });

          return res.json({
              success: true,
              messages: normalized,
              count: normalized.length
          });
      } catch (e) {
          console.warn('[ANTIGRAVITY] Exception:', e);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
