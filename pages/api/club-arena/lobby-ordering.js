import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * Lobby Ordering API — Drag-and-drop table ordering for lobby display
 * ═════════════════════════════════════════════════════════════
 * POST /api/club-arena/lobby-ordering
 *
 * Actions:
 *   - get:    Get ordered table IDs for a club
 *   - save:   Save new table ordering (array of table IDs)
 */

import { createClient } from '@supabase/supabase-js';
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

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
export default async function handler(req, res) {
  // Idempotency guard — prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }

  try {
      // Rate limit
      if (!applyRateLimit(req, res, 'club-arena/lobby-ordering')) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, order } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      try {
          if (action === 'get') {
              const { data: clubData } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              return res.status(200).json({
                  success: true,
                  order: clubData?.settings?.lobby_order || [],
              });
          }

          if (action === 'save') {
              // Admin only
              const { data: membership } = await getSupabase()
                  .from('club_members')
                  .select('role')
                  .eq('club_id', clubId)
                  .eq('user_id', user.id)
                  .maybeSingle();

              if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
                  return res.status(403).json({ error: 'Admin access required' });
              }

              if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of table IDs' });

              // Merge with existing settings
              const { data: existing } = await getSupabase()
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const settings = existing?.settings || {};
              settings.lobby_order = order;
              settings.lobby_order_updated = new Date().toISOString();

              const { error } = await getSupabase()
                  .from('clubs')
                  .update({ settings })
                  .eq('id', clubId);

              if (error) throw error;
              return res.status(200).json({ success: true });
          }

          return res.status(400).json({ error: `Unknown action: ${action}` });
      } catch (err) {
          console.warn('[lobby-ordering]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
