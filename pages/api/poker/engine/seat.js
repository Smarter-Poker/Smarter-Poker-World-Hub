/**
 * POST /api/poker/engine/seat
 * 
 * Seat management actions.
 * Body: { tableId, playerId, action, ...params }
 * 
 * Actions:
 *   sit_down:    { seatIndex, buyIn, displayName?, avatarUrl? }
 *   stand_up:    {}
 *   sit_out:     {}
 *   sit_in:      {}
 *   add_chips:   { amount }
 *   join_waitlist:  { displayName?, seatPreference? }
 *   leave_waitlist: {}
 */

import { getController } from '../../../../src/lib/poker-engine/GameController';

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
    let result;

    switch (action) {
      case 'sit_down': {
        const { seatIndex, buyIn, displayName, avatarUrl } = params;
        if (seatIndex === undefined || seatIndex === null) {
          return res.status(400).json({ error: 'seatIndex required' });
        }
        if (!buyIn) return res.status(400).json({ error: 'buyIn required' });
        result = await controller.sitDown(tableId, playerId, parseInt(seatIndex), parseFloat(buyIn), {
          displayName, avatarUrl,
        });
        break;
      }

      case 'stand_up':
        result = await controller.standUp(tableId, playerId);
        break;

      case 'sit_out':
        result = await controller.sitOut(tableId, playerId);
        break;

      case 'sit_in':
        result = await controller.sitIn(tableId, playerId);
        break;

      case 'add_chips': {
        const { amount } = params;
        if (!amount) return res.status(400).json({ error: 'amount required' });
        result = await controller.addChips(tableId, playerId, parseFloat(amount));
        break;
      }

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
