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
const { applyCors } = require('../../../../src/lib/cors');
const { applyRateLimit } = require('../../../../src/lib/poker-engine/RateLimiter');
const { createClient } = require('../../../../src/lib/supabaseServerClient');
import { reportApiError } from '../../../../src/lib/sentryWrap';

// Supabase admin for buy-in auth and chip operations
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}



const VALID_SEAT_ACTIONS = new Set([
  'sit_down', 'stand_up', 'sit_out', 'sit_in',
  'add_chips', 'join_waitlist', 'leave_waitlist',
  'declare_straddle', 'cancel_straddle',
  'discard', 'respond_run_it',
  'set_auto_rebuy', 'set_auto_topup',
  'invite_player', 'approve_buyin', 'reject_buyin',
  'show_cards', 'show_one_card', 'kick_player',
  'request_rabbit',
]);

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
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

      // ── RETIRED 2026-08-24: no new money into World Hub's second engine ──
      // This route belongs to src/lib/poker-engine, which is NOT the engine
      // that runs the games. Club Arena on Hetzner is. Two facts settle it:
      // hand_history holds 1,390,864 rows and every one is source='manual'
      // (Club Arena); this engine stamps source='engine-api' and has written
      // none. And the only pages that call this route, /hub/poker/lobby and
      // /hub/poker/table/[tableId], are linked from nowhere and now 404.
      //
      // It is refused rather than merely unreachable because it seats players
      // in memory and never writes table_seats. table_seats is where the
      // four-table hard rule lives (trg_enforce_four_table_limit), so anyone
      // seated here is invisible to that trigger AND to the away-blind cap. A
      // seat this engine grants is a seat outside both rules. sit_down also
      // calls ChipBridge.lockChips, so it moves real balance on the way in.
      //
      // Read-only actions are left alone: they cannot create that state, and
      // this route is still the shape LivePokerTable expects if the pages are
      // ever revived deliberately.
      const RETIRED_MONEY_ACTIONS = new Set(['sit_down', 'add_chips', 'approve_buyin']);
      if (RETIRED_MONEY_ACTIONS.has(action)) {
        return res.status(410).json({
          success: false,
          error: 'This table engine is retired. Play at /hub/club-arena/.',
          code: 'ENGINE_RETIRED',
        });
      }

      const controller = await getController();
      const antiCheat = controller.antiCheat; // Shared instance — same data as background monitor

      // ── COLD-START AUTO-RECOVERY ──────────────────────────────────
      // If this serverless function spun up fresh, reconnect from DB first.
      if (!controller.lobby.tables.has(tableId)) {
        const recovered = await controller.ensureTable(tableId);
        if (!recovered) return res.status(404).json({ error: 'Table not found' });
      }

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

          // TOS gate — player must accept Club Arena TOS before sitting down
          if (clubId) {
            const { data: tosProfile } = await getSupabase()
              .from('profiles')
              .select('club_arena_tos_accepted_at')
              .eq('id', playerId)
              .maybeSingle();
            if (!tosProfile?.club_arena_tos_accepted_at) {
              return res.status(403).json({
                success: false,
                error: 'You must accept the Club Arena Terms of Service before playing.',
                code: 'TOS_NOT_ACCEPTED',
              });
            }
          }

          // ── Phase 7.1.5 — Responsible Gaming self-exclusion gate ──
          // Block sit_down if the player is currently self-excluded.
          // fn_rg_require_not_excluded returns { ok, error?, code?, self_excluded_until? }.
          try {
            const { data: rgCheck, error: rgErr } = await getSupabase().rpc(
              'fn_rg_require_not_excluded',
              { p_user_id: playerId }
            );
            if (rgErr) {
              console.warn('[seat.js] RG exclusion check failed:', rgErr.message);
              // Fail-closed for gaming-compliance: reject on DB error.
              return res.status(503).json({
                success: false,
                error: 'Responsible-gaming check unavailable. Please try again.',
                code: 'RG_CHECK_UNAVAILABLE',
              });
            }
            if (!rgCheck?.ok) {
              return res.status(403).json({
                success: false,
                error: rgCheck?.error || 'You are currently self-excluded.',
                code: rgCheck?.code || 'SELF_EXCLUDED',
                self_excluded_until: rgCheck?.self_excluded_until || null,
              });
            }
          } catch (e) {
            console.warn('[seat.js] RG exclusion check threw:', e?.message);
            return res.status(503).json({
              success: false,
              error: 'Responsible-gaming check unavailable. Please try again.',
              code: 'RG_CHECK_UNAVAILABLE',
            });
          }

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
            const { data: mem } = await getSupabase()
              .from('club_members')
              .select('role, tier')
              .eq('club_id', clubId)
              .eq('user_id', playerId)
              .maybeSingle();
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
              const hq = new HandHistoryQuery(getSupabase());
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
            } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          // Fetch display name from profiles if client sends default
          let resolvedName = displayName;
          let resolvedAvatar = avatarUrl;
          if (!resolvedName || resolvedName === 'Player') {
            const { data: prof } = await getSupabase()
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
            }).catch(err => console.warn('[AntiCheat] Session record failed:', err.message));

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

          // If pending (player in a hand), don't unlock yet — handled after hand completes
          if (result.pending) break;

          // Clean up anti-cheat tracking for this player/table
          if (result.success) {
            antiCheat.removePlayerFromTable(playerId, tableId);
            antiCheat.closeSession(tableId, playerId)
              .catch(err => console.warn('[AntiCheat] Session close failed:', err.message));
          }

          // If club table: return chips to club balance
          if (result.success && clubId) {
            const cashoutAmount = typeof result.cashout === 'number' ? result.cashout : 0;
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
          result = controller.processDiscard(tableId, playerId, params.cardIndex);
          break;

        // ═══════════════════════════════════════════════════════════
        // RUN IT TWICE/THRICE — Accept/decline offer
        // ═══════════════════════════════════════════════════════════
        case 'respond_run_it': {
          const { choice } = params; // 'twice' | 'thrice' | 'decline'
          result = controller.respondRunIt(tableId, playerId, choice);
          break;
        }

        // ═══════════════════════════════════════════════════════════
        // AUTO-REBUY — Toggle auto-rebuy preference for this player
        // ═══════════════════════════════════════════════════════════
        case 'set_auto_rebuy': {
          const enabled = params.enabled !== false;
          result = controller.setAutoRebuy(tableId, playerId, enabled);
          break;
        }

        // AUTO TOP-UP — Top up to max buy-in between hands
        // ═══════════════════════════════════════════════════════════
        case 'set_auto_topup': {
          // value: true = top up to max, number = specific amount, false = off
          const topUpValue = params.amount ? Number(params.amount) : (params.enabled !== false);
          result = controller.setAutoTopUp(tableId, playerId, topUpValue);
          break;
        }

        // ═══════════════════════════════════════════════════════════
        // ADMIN: Private game invite
        // ═══════════════════════════════════════════════════════════
        case 'invite_player': {
          const targetId = params.targetPlayerId;
          if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
          // Verify admin role
          if (clubId) {
            const { data: inviterMember } = await getSupabase()
              .from('club_members').select('role')
              .eq('club_id', clubId).eq('user_id', playerId).maybeSingle();
            if (!inviterMember || !['owner', 'admin', 'manager', 'agent'].includes(inviterMember.role)) {
              return res.status(403).json({ error: 'Only owners, admins, managers, or agents can invite players' });
            }
          }
          result = controller.invitePlayer(tableId, targetId);
          break;
        }

        // ADMIN: Approve pending buy-in authorization
        case 'approve_buyin': {
          const targetId = params.targetPlayerId;
          if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
          // Verify admin role
          if (clubId) {
            const { data: approverMember } = await getSupabase()
              .from('club_members').select('role')
              .eq('club_id', clubId).eq('user_id', playerId).maybeSingle();
            if (!approverMember || !['owner', 'admin', 'manager'].includes(approverMember.role)) {
              return res.status(403).json({ error: 'Only owners, admins, or managers can approve buy-ins' });
            }
          }
          result = controller.approveBuyIn(tableId, targetId);
          break;
        }

        // ADMIN: Reject pending buy-in authorization
        case 'reject_buyin': {
          const targetId = params.targetPlayerId;
          if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });
          // Verify admin role
          if (clubId) {
            const { data: rejecterMember } = await getSupabase()
              .from('club_members').select('role')
              .eq('club_id', clubId).eq('user_id', playerId).maybeSingle();
            if (!rejecterMember || !['owner', 'admin', 'manager'].includes(rejecterMember.role)) {
              return res.status(403).json({ error: 'Only owners, admins, or managers can reject buy-ins' });
            }
          }
          result = controller.rejectBuyIn(tableId, targetId);
          break;
        }

        case 'show_cards': {
          result = await controller.showCards(tableId, playerId);
          break;
        }

        case 'show_one_card': {
          const cardIdx = typeof params.cardIndex === 'number' ? params.cardIndex : parseInt(params.cardIndex);
          if (isNaN(cardIdx) || cardIdx < 0) return res.status(400).json({ error: 'Valid cardIndex required' });
          result = await controller.showOneCard(tableId, playerId, cardIdx);
          break;
        }

        case 'kick_player': {
          // Admin-only: kick a player from the table
          const targetId = params.targetPlayerId;
          if (!targetId) return res.status(400).json({ error: 'targetPlayerId required' });

          // Verify admin/manager/owner role from DATABASE, not request body
          if (clubId) {
            const { data: kickerMember } = await getSupabase()
              .from('club_members')
              .select('role')
              .eq('club_id', clubId)
              .eq('user_id', playerId)
              .maybeSingle();
            if (!kickerMember || !['owner', 'admin', 'manager'].includes(kickerMember.role)) {
              return res.status(403).json({ error: 'Only owners, admins, or managers can kick players' });
            }
          }

          const reason = params.reason || 'admin_kick';
          result = await controller.kickPlayer(tableId, targetId, reason);
          // Unlock kicked player's chips
          if (result.success && clubId) {
            await ChipBridge.unlockChips(clubId, targetId, tableId, result.cashout || 0);
          }
          break;
        }

        // ═══════════════════════════════════════════════════════════
        // RABBIT HUNT — Peek at remaining board cards after fold win
        // ═══════════════════════════════════════════════════════════
        case 'request_rabbit': {
          result = controller.requestRabbit(tableId, playerId);
          break;
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      if (!result.success) return res.status(400).json(result);
      return res.json(result);
    } catch (err) {
      console.warn('[engine/seat]', err);
      return res.status(500).json({ error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
