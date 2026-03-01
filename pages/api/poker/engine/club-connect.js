/**
 * POST /api/poker/engine/club-connect
 * 
 * Bridges Club Arena's 'tables' DB with the poker engine.
 * When a player opens a Club Arena table, this endpoint:
 *   1. Checks if the engine already has an in-memory game for this table
 *   2. If not, reads config from 'tables' DB and creates one
 *   3. Enforces observer restriction (restrict_observers setting)
 *   4. Enforces buy-in authorization (buy_in_authorization setting)
 *   5. Returns the engine tableId (same as club table UUID)
 * 
 * Body: { tableId, userId }
 * Returns: { success, tableId, name?, observerRestricted?, buyInAuthRequired? }
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    // Rate limit
    if (!applyRateLimit(req, res, 'poker/engine/club-connect')) return;

    const { tableId, userId } = req.body;
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    const controller = await getController();
    const result = await controller.connectToClubTable(tableId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // ─── Observer Restriction ───────────────────────────────────────
    // ─── Observer Time Limit ─────────────────────────────────────
    // When restrict_observers is enabled, non-seated non-staff users
    // can observe for up to 30 minutes before being booted.
    // Staff (owner/admin/manager/agent) and seated players bypass.
    if (userId) {
      const entry = controller.lobby?.getEntry?.(tableId);
      const settings = entry?.config?.clubSettings || {};
      const clubId = entry?.config?.clubId;

      if (settings.restrict_observers && clubId) {
        const seatedPlayers = entry?.state?.seats || [];
        const isSeated = seatedPlayers.some(s => s && s.playerId === userId);

        if (!isSeated) {
          // Check if user is club staff
          const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', userId)
            .single();

          const staffRoles = ['owner', 'admin', 'manager', 'agent'];
          const isStaff = member && staffRoles.includes(member.role);

          if (!isStaff) {
            const OBSERVER_LIMIT_MINUTES = 30;

            // Check for existing observer session
            const { data: existingSession } = await supabaseAdmin
              .from('table_sessions')
              .select('id, seated_at')
              .eq('table_id', tableId)
              .eq('player_id', userId)
              .eq('is_active', true)
              .eq('seat_index', -1) // -1 = observer (not seated)
              .single();

            if (existingSession) {
              const elapsed = (Date.now() - new Date(existingSession.seated_at).getTime()) / 60000;
              if (elapsed >= OBSERVER_LIMIT_MINUTES) {
                // Time's up — close session and boot
                await supabaseAdmin
                  .from('table_sessions')
                  .update({ is_active: false, left_at: new Date().toISOString(), kick_reason: 'observer_time_limit' })
                  .eq('id', existingSession.id);

                return res.status(403).json({
                  success: false,
                  error: 'Observer time limit reached (30 minutes)',
                  code: 'OBSERVER_TIME_EXPIRED',
                });
              }
              // Still within limit
              result.observerTimeLimit = {
                enabled: true,
                limitMinutes: OBSERVER_LIMIT_MINUTES,
                elapsedMinutes: Math.round(elapsed),
                remainingMinutes: Math.round(OBSERVER_LIMIT_MINUTES - elapsed),
                startedAt: existingSession.seated_at,
              };
            } else {
              // First connect as observer — create observer session
              await supabaseAdmin
                .from('table_sessions')
                .insert({
                  table_id: tableId,
                  player_id: userId,
                  club_id: clubId,
                  seat_index: -1, // -1 = observer
                  is_active: true,
                })
                .catch(() => {}); // Ignore duplicates

              result.observerTimeLimit = {
                enabled: true,
                limitMinutes: OBSERVER_LIMIT_MINUTES,
                elapsedMinutes: 0,
                remainingMinutes: OBSERVER_LIMIT_MINUTES,
                startedAt: new Date().toISOString(),
              };
            }
          }
        }
      }

    }

    return res.json(result);
  } catch (err) {
    console.error('[club-connect]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
