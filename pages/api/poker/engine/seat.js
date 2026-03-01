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
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
const { createClient } = require('@supabase/supabase-js');

// Supabase admin for buy-in auth and chip operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  // Rate limit
  if (!applyRateLimit(req, res, 'poker/engine/seat')) return;

  // ── Auth: verify JWT identity matches playerId ──
  const { authenticatePlayer } = require('../../../../src/lib/poker-engine/authMiddleware');
  const auth = await authenticatePlayer(req, res);
  if (!auth) return; // 401/403 already sent

  try {
    const { tableId, action, ...params } = req.body;
    const playerId = auth.playerId; // Guaranteed to match JWT

    if (!tableId) return res.status(400).json({ error: 'tableId required' });
    if (!action || !VALID_SEAT_ACTIONS.has(action)) {
      return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const controller = await getController();
    const antiCheat = controller.antiCheat; // Shared instance — same data as background monitor

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

        // Fetch player's club membership for access control
        let memberRole = null;
        let memberTier = null;
        if (clubId) {
          const { data: mem } = await supabaseAdmin
            .from('club_members')
            .select('role, tier')
            .eq('club_id', clubId)
            .eq('user_id', playerId)
            .single();
          if (mem) {
            memberRole = mem.role;
            memberTier = mem.tier;
          }
        }

        // ── Career Percent Gate: require minimum career VPIP to sit ──
        const careerPercent = entry.config?.clubSettings?.career_percent || 0;
        if (careerPercent > 0 && clubId && !['owner', 'admin', 'manager', 'agent'].includes(memberRole)) {
          try {
            const { HandHistoryQuery } = require('../../../../src/lib/poker-engine/HandHistory');
            const hq = new HandHistoryQuery(supabaseAdmin);
            const stats = await hq.getPlayerStats(clubId, playerId, { limit: 100 });
            if (stats.handsPlayed >= 10 && parseFloat(stats.vpipRate) < careerPercent) {
              // Unlock chips since we locked them above
              if (clubId) await ChipBridge.unlockChips(clubId, playerId, tableId, buyInAmount);
              return res.status(403).json({
                success: false,
                error: `Minimum career VPIP of ${careerPercent}% required. Your VPIP: ${stats.vpipRate}%`,
                code: 'CAREER_VPIP_TOO_LOW',
                vpipRate: stats.vpipRate,
                required: careerPercent,
              });
            }
          } catch (e) {
            // If stats query fails, allow entry (don't block on stats errors)
            console.warn('[seat.js] Career percent check failed:', e.message);
          }
        }

        // Fetch display name from profiles if client sends default
        let resolvedName = displayName;
        let resolvedAvatar = avatarUrl;
        if (!resolvedName || resolvedName === 'Player') {
          const { data: prof } = await supabaseAdmin
            .from('profiles').select('display_name, avatar_url').eq('id', playerId).maybeSingle();
          if (prof) {
            resolvedName = prof.display_name || 'Player';
            resolvedAvatar = resolvedAvatar || prof.avatar_url || null;
          }
        }

        result = await controller.sitDown(tableId, playerId, parseInt(seatIndex), buyInAmount, {
          displayName: resolvedName, avatarUrl: resolvedAvatar,
          role: memberRole,
          tier: memberTier,
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

          // Feed initial GPS to background monitor for continuous scanning
          if (controller.antiCheatMonitor && latitude && longitude) {
            controller.antiCheatMonitor.updatePlayerGPS(playerId, tableId, latitude, longitude);
          }
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

      // ═══════════════════════════════════════════════════════════
      // STRADDLE — Declare/cancel voluntary straddle for next hand
      // ═══════════════════════════════════════════════════════════
      case 'declare_straddle':
        result = controller.declareStraddle(tableId, playerId);
        break;

      case 'cancel_straddle':
        result = controller.cancelStraddle(tableId, playerId);
        break;

      // ═══════════════════════════════════════════════════════════
      // PINEAPPLE DISCARD — Discard 1 of 3 hole cards after flop
      // ═══════════════════════════════════════════════════════════
      case 'discard':
        result = controller.processDiscard(tableId, playerId, body.cardIndex);
        break;

      // ═══════════════════════════════════════════════════════════
      // RUN IT TWICE/THRICE — Accept/decline offer
      // ═══════════════════════════════════════════════════════════
      case 'respond_run_it': {
        const { choice } = body; // 'twice' | 'thrice' | 'decline'
        result = controller.respondRunIt(tableId, playerId, choice);
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // AUTO-REBUY — Toggle auto-rebuy preference for this player
      // ═══════════════════════════════════════════════════════════
      case 'set_auto_rebuy': {
        const enabled = body.enabled !== false;
        result = controller.setAutoRebuy(tableId, playerId, enabled);
        break;
      }

      // AUTO TOP-UP — Top up to max buy-in between hands
      // ═══════════════════════════════════════════════════════════
      case 'set_auto_topup': {
        // value: true = top up to max, number = specific amount, false = off
        const topUpValue = body.amount ? Number(body.amount) : (body.enabled !== false);
        result = controller.setAutoTopUp(tableId, playerId, topUpValue);
        break;
      }

      // ═══════════════════════════════════════════════════════════
      // ADMIN: Private game invite
      // ═══════════════════════════════════════════════════════════
      case 'invite_player': {
        const targetId = body.targetPlayerId;
        if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
        result = controller.invitePlayer(tableId, targetId);
        break;
      }

      // ADMIN: Approve pending buy-in authorization
      case 'approve_buyin': {
        const targetId = body.targetPlayerId;
        if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
        result = controller.approveBuyIn(tableId, targetId);
        break;
      }

      // ADMIN: Reject pending buy-in authorization
      case 'reject_buyin': {
        const targetId = body.targetPlayerId;
        if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
        result = controller.rejectBuyIn(tableId, targetId);
        break;
      }

      case 'show_cards': {
        result = await controller.showCards(tableId, playerId);
        break;
      }

      case 'kick_player': {
        // Admin-only: kick a player from the table
        const targetId = body.targetPlayerId;
        if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
        // Verify admin/manager/owner role
        const kickerRole = body.role || 'player';
        if (!['owner', 'admin', 'manager'].includes(kickerRole)) {
          return res.status(403).json({ error: 'Only admins can kick players' });
        }
        const reason = body.reason || 'admin_kick';
        result = await controller.kickPlayer(tableId, targetId, reason);
        // Unlock kicked player's chips
        if (result.success && clubId) {
          await ChipBridge.unlockChips(clubId, targetId, tableId, result.cashout || 0);
        }
        break;
      }

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
