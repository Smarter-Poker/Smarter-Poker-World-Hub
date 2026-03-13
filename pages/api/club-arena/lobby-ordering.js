/**
 * Lobby Ordering API — Drag-and-drop table ordering for lobby display
 * ═══════════════════════════════════════════════════════════════
 * POST /api/club-arena/lobby-ordering
 *
 * Actions:
 *   - get:    Get ordered table IDs for a club
 *   - save:   Save new table ordering (array of table IDs)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');
export default async function handler(req, res) {
  try {
      // Rate limit
      if (await applyRateLimit(req, res)) return;
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Not authenticated' });

      const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, order } = req.body;
      if (!clubId) return res.status(400).json({ error: 'clubId required' });

      try {
          if (action === 'get') {
              const { data: clubData } = await supabaseAdmin
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
              const { data: membership } = await supabaseAdmin
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
              const { data: existing } = await supabaseAdmin
                  .from('clubs')
                  .select('settings')
                  .eq('id', clubId)
                  .maybeSingle();

              const settings = existing?.settings || {};
              settings.lobby_order = order;
              settings.lobby_order_updated = new Date().toISOString();

              const { error } = await supabaseAdmin
                  .from('clubs')
                  .update({ settings })
                  .eq('id', clubId);

              if (error) throw error;
              return res.status(200).json({ success: true });
          }

          return res.status(400).json({ error: `Unknown action: ${action}` });
      } catch (err) {
          console.error('[lobby-ordering]', err);
          return res.status(500).json({ error: 'Internal error' });
      }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
