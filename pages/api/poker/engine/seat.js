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
        const { seatIndex, buyIn, displayName, avatarUrl } = params;
        if (seatIndex === undefined || seatIndex === null) {
          return res.status(400).json({ error: 'seatIndex required' });
        }
        if (!buyIn) return res.status(400).json({ error: 'buyIn required' });

        const buyInAmount = parseFloat(buyIn);

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
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // STAND UP — Engine returns stack, unlock chips back to balance
      // ═══════════════════════════════════════════════════════════
      case 'stand_up': {
        result = await controller.standUp(tableId, playerId);

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
