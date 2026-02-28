/**
 * POST /api/poker/engine/seat
 * 
 * Seat management actions — WIRED TO CLUB ARENA CHIPS.
 * When the table belongs to a club (has clubId), chip operations are
 * atomic: lock chips on sit_down, unlock on stand_up, rebuy on add_chips.
 * 
 * Body: { tableId, playerId, action, ...params }
 * 
 * Actions:
 *   sit_down:       { seatIndex, buyIn, displayName?, avatarUrl? }
 *   stand_up:       {}
 *   sit_out:        {}
 *   sit_in:         {}
 *   add_chips:      { amount }
 *   join_waitlist:  { displayName?, seatPreference? }
 *   leave_waitlist: {}
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';
const ChipBridge = require('../../../../src/lib/poker-engine/ChipBridge');
const { AntiCheat } = require('../../../../src/lib/poker-engine/AntiCheat');
const { createClient } = require('@supabase/supabase-js');

// Supabase admin for anti-cheat agent lookups
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Singleton anti-cheat instance (persists across requests via globalThis)
if (!globalThis.__ANTI_CHEAT__) globalThis.__ANTI_CHEAT__ = new AntiCheat(supabaseAdmin);
const antiCheat = globalThis.__ANTI_CHEAT__;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

const VALID_SEAT_ACTIONS = new Set([
  'sit_down', 'stand_up', 'sit_out', 'sit_in',
  'add_chips', 'join_waitlist', 'leave_waitlist',
]);

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tableId, playerId, action, ...params } = req.body;

    if (!tableId) return res.status(400).json({ error: 'tableId required' });
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    if (!action || !VALID_SEAT_ACTIONS.has(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const controller = await getController();

    // Get table entry to check if this is a club table
    const entry = controller.lobby.tables.get(tableId);
    if (!entry) return res.status(404).json({ error: 'Table not found' });
    const clubId = entry.config?.clubId || null;

    let result;

    switch (action) {
      // ═══════════════════════════════════════════════════════════
      // SIT DOWN — Lock chips from club balance, then seat in engine
      // ═══════════════════════════════════════════════════════════
      case 'sit_down': {
        const { seatIndex, buyIn, displayName, avatarUrl, fingerprint, latitude, longitude } = params;
        if (seatIndex === undefined || seatIndex === null) {
          return res.status(400).json({ error: 'seatIndex required' });
        }
        if (!buyIn) return res.status(400).json({ error: 'buyIn required' });

        const buyInAmount = parseFloat(buyIn);

        // ─── Buy-in Authorization ─────────────────────────────────────
        // When enabled, player must have an approved request before sitting
        const clubSettings = entry.config?.clubSettings || {};
        if (clubSettings.buy_in_authorization && clubId) {
          // Check if there's an approved buyin request for this player/table
          const { data: approved } = await supabaseAdmin
            .from('buyin_requests')
            .select('id, approved_amount')
            .eq('player_id', playerId)
            .eq('table_id', tableId)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!approved) {
            // Check if already pending
            const { data: pending } = await supabaseAdmin
              .from('buyin_requests')
              .select('id')
              .eq('player_id', playerId)
              .eq('table_id', tableId)
              .eq('status', 'pending')
              .limit(1)
              .single();

            if (pending) {
              return res.status(202).json({
                success: false,
                code: 'BUYIN_AUTH_PENDING',
                requestId: pending.id,
                error: 'Your buy-in request is pending approval',
              });
            }

            // Create new pending request
            const { data: newReq, error: reqErr } = await supabaseAdmin
              .from('buyin_requests')
              .insert({
                player_id: playerId,
                table_id: tableId,
                club_id: clubId,
                seat_index: parseInt(seatIndex),
                requested_amount: buyInAmount,
                status: 'pending',
              })
              .select('id')
              .single();

            if (reqErr) {
              console.error('[BuyinAuth] Request creation failed:', reqErr.message);
              return res.status(500).json({ success: false, error: 'Failed to create buy-in request' });
            }

            return res.status(202).json({
              success: false,
              code: 'BUYIN_AUTH_REQUIRED',
              requestId: newReq.id,
              error: 'Buy-in requires authorization. Request submitted for approval.',
            });
          }

          // Approved — consume the approval (mark as used)
          await supabaseAdmin
            .from('buyin_requests')
            .update({ status: 'used', used_at: new Date().toISOString() })
            .eq('id', approved.id);
        }

        // Anti-cheat pre-join check (IP, device, GPS, downline, emulator, rate limit)
        const acCheck = await antiCheat.preJoinCheck(playerId, tableId, req, {
          fingerprint,
          clubSettings: entry.config?.clubSettings,
          location: (latitude != null && longitude != null) ? { lat: latitude, lng: longitude } : null,
          userAgent: req.headers?.['user-agent'],
        });
        if (!acCheck.allowed) {
          // Log the blocked seating attempt
          antiCheat.logSeatBlocked(playerId, tableId, clubId, acCheck.reason);
          return res.status(403).json({ success: false, error: acCheck.reason });
        }
        // Log warnings to console for admin visibility
        if (acCheck.warnings?.length) {
          console.warn(`[AntiCheat] Warnings for ${playerId} at ${tableId}:`, acCheck.warnings);
          // Persist flags from this check
          antiCheat.persistFlags(playerId, clubId, tableId);
        }

        // If club table: lock chips BEFORE engine sit_down
        if (clubId) {
          const lockResult = await ChipBridge.lockChips(clubId, playerId, tableId, buyInAmount);
          if (!lockResult.success) {
            return res.status(400).json({
              success: false,
              error: lockResult.error || 'Failed to lock chips',
              available: lockResult.available,
            });
          }
        }

        result = await controller.sitDown(tableId, playerId, parseInt(seatIndex), buyInAmount, {
          displayName, avatarUrl,
        });

        // If engine rejected the sit_down, rollback the chip lock
        if (!result.success && clubId) {
          await ChipBridge.unlockChips(clubId, playerId, tableId, buyInAmount);
        }

        // Record session for anti-cheat persistence (non-blocking)
        if (result.success) {
          const ip = req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.headers?.['x-real-ip'] || req.socket?.remoteAddress || null;
          antiCheat.recordSession(tableId, playerId, parseInt(seatIndex), {
            ip,
            lat: latitude || null,
            lng: longitude || null,
            fingerprint: fingerprint || null,
            userAgent: req.headers?.['user-agent'] || null,
            clubId,
          }).catch(err => console.error('[AntiCheat] Session record failed:', err.message));
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // STAND UP — Engine returns stack, unlock chips back to balance
      // ═══════════════════════════════════════════════════════════
      case 'stand_up': {
        result = await controller.standUp(tableId, playerId);

        // Clean up anti-cheat tracking for this player/table
        if (result.success) {
          antiCheat.removePlayerFromTable(playerId, tableId);
          antiCheat.closeSession(tableId, playerId)
            .catch(err => console.error('[AntiCheat] Session close failed:', err.message));
        }

        // If club table: return chips to club balance
        if (result.success && clubId) {
          const cashoutAmount = result.cashout || 0;
          const unlockResult = await ChipBridge.unlockChips(clubId, playerId, tableId, cashoutAmount);
          result.chipBridge = {
            returned: unlockResult.returned,
            newBalance: unlockResult.newBalance,
          };
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // ADD CHIPS — Lock additional chips from balance
      // ═══════════════════════════════════════════════════════════
      case 'add_chips': {
        const { amount } = params;
        if (!amount) return res.status(400).json({ error: 'amount required' });
        const addAmount = parseFloat(amount);

        // If club table: lock additional chips BEFORE engine add
        if (clubId) {
          const lockResult = await ChipBridge.rebuyChips(clubId, playerId, tableId, addAmount);
          if (!lockResult.success) {
            return res.status(400).json({
              success: false,
              error: lockResult.error || 'Failed to lock additional chips',
              available: lockResult.available,
            });
          }
        }

        result = await controller.addChips(tableId, playerId, addAmount);

        // If engine rejected, rollback
        if (!result.success && clubId) {
          await ChipBridge.unlockChips(clubId, playerId, tableId, addAmount);
        }
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // PASSTHROUGH — No chip operations needed
      // ═══════════════════════════════════════════════════════════
      case 'sit_out':
        result = await controller.sitOut(tableId, playerId);
        break;

      case 'sit_in':
        result = await controller.sitIn(tableId, playerId);
        break;

      case 'join_waitlist':
        result = await controller.joinWaitlist(tableId, playerId, params);
        break;

      case 'leave_waitlist':
        result = await controller.leaveWaitlist(tableId, playerId);
        break;

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (err) {
    console.error('[engine/seat]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
