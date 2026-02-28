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
    const { tableId, userId } = req.body;
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    const controller = await getController();
    const result = await controller.connectToClubTable(tableId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // ─── Observer Restriction ───────────────────────────────────────
    // If restrict_observers is enabled, only seated players and club
    // staff (owner/admin/manager/agent) can view the table.
    if (userId) {
      const entry = controller.lobby?.getEntry?.(tableId);
      const settings = entry?.config?.clubSettings || {};
      const clubId = entry?.config?.clubId;

      if (settings.restrict_observers && clubId) {
        // Check if user is currently seated at this table
        const seatedPlayers = entry?.state?.seats || [];
        const isSeated = seatedPlayers.some(s => s && s.playerId === userId);

        if (!isSeated) {
          // Check if user is club staff (owner/admin/manager/agent)
          const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', userId)
            .single();

          const staffRoles = ['owner', 'admin', 'manager', 'agent'];
          const isStaff = member && staffRoles.includes(member.role);

          if (!isStaff) {
            return res.status(403).json({
              success: false,
              error: 'Observers are not allowed at this table',
              code: 'OBSERVERS_RESTRICTED',
            });
          }
        }
      }

      // ─── Buy-in Authorization flag ──────────────────────────────────
      // Signal to the client that buy-in requires admin approval
      if (settings.buy_in_authorization) {
        result.buyInAuthRequired = true;
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('[club-connect]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
