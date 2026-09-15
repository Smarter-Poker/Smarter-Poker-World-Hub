import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { readMessengerMessages } from '../../../src/lib/messengerWorkspace.mjs';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { verifyAccountingMessage } from '../../../src/lib/accountingMessage.mjs';

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
      if ((beforeId && !before) || (before && (typeof before !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(before) || !Number.isFinite(Date.parse(before)) || (beforeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(beforeId))))) {
          return res.status(400).json({ success: false, error: 'Invalid Message Cursor' });
      }

      try {
          // The same workspace authority protects links, search and paging;
          // the database also enforces visibility on individual attachments.
          const messages = await readMessengerMessages(getSupabase(), userId, {
              conversationId, before, beforeId, limit: pageLimit,
          });

          // Reverse descending order to chronological ascending for display
          const sorted = [...(messages || [])].reverse();
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
              m = verifyAccountingMessage(m, m.media_metadata?.accounting_verified === true ? {
                  accounting_verified: true,
                  id: m.media_metadata.invoice_id, status: m.media_metadata.status,
                  chips_transferred: m.media_metadata.chips_transferred,
                  invoice_type: m.media_metadata.invoice_type,
                  source_ledger_id: m.media_metadata.source_ledger_id,
                  club_id: m.media_metadata.club_id, amount: m.media_metadata.amount,
                  // Only the private reader can attest these fields from the
                  // immutable cashier event joined to this exact invoice.
                  cashier_verified: m.media_metadata.cashier_verified,
                  cashier: m.media_metadata.cashier,
              } : null);
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
          return res.status([400, 403, 404, 503].includes(e.status) ? e.status : 500)
              .json({ success: false, error: 'Messages Unavailable' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
