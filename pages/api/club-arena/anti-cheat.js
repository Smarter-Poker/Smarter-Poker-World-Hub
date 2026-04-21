/**
 * /api/club-arena/anti-cheat | ORB-7 AUDITED
 * 
 * Anti-cheat administration for club owners/admins.
 * 
 * Actions:
 *   get_flags       — Get open flags for a club (with filters)
 *   get_events      — Get recent anti-cheat events
 *   get_sessions    — Get active table sessions
 *   review_flag     — Mark a flag as reviewed/dismissed/actioned
 *   kick_player     — Remove a player from a table for anti-cheat violation
 *   get_player_history — Get all flags/events for a specific player
 *   get_stats       — Anti-cheat summary for dashboard
 *   get_collusion_pairs — Detect chip-dumping / collusion between player pairs
 *   get_anomalies   — Detect folding-the-nuts and other suspicious plays
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
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



// ─── Idempotency Store (in-memory, TTL-based) ────────────────
// Prevents double-tap / fat-finger duplicate mutations.
// Key = X-Idempotency-Key header, Value = { response, expiry }
const idempotencyStore = new Map();
const IDEMPOTENCY_TTL_MS = 60_000; // 1 minute
const MUTATION_ACTIONS = ['review_flag', 'kick_player'];

// Clean up expired idempotency keys every 2 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyStore.entries()) {
      if (now > entry.expiry) idempotencyStore.delete(key);
    }
  }, 2 * 60_000);
}

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type, Authorization, X-Idempotency-Key' })) return;
try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    // ── Idempotency Check: dedup mutation requests ──
    const idempotencyKey = req.headers['x-idempotency-key'];
    if (idempotencyKey && typeof idempotencyKey === 'string') {
      const cached = idempotencyStore.get(idempotencyKey);
      if (cached && Date.now() < cached.expiry) {
        res.setHeader('X-Idempotent-Replayed', 'true');
        return res.status(cached.status).json(cached.body);
      }
    }

    try {
      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, ...params } = req.body;
      const userId = user.id; // From JWT, not body — NEVER trust req.body.user_id

      // ── EXPLOIT DEFENSE: Strip any spoofed user_id from body ──
      if (req.body.user_id || req.body.userId) {
        console.warn(`[AntiCheat] Auth spoofing attempt: body contained user_id field from ${userId}`);
      }

      // ── Input Validation: clubId must be UUID ──
      if (!clubId || typeof clubId !== 'string') {
        return res.status(400).json({ error: 'clubId required' });
      }
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(clubId)) {
        return res.status(400).json({ error: 'clubId must be a valid UUID' });
      }

      // ── Input Validation: action must be in whitelist ──
      const VALID_ACTIONS = [
        'get_flags', 'get_events', 'get_sessions', 'review_flag',
        'kick_player', 'get_player_history', 'get_stats',
        'get_collusion_pairs', 'get_anomalies',
      ];
      if (!action || !VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` });
      }

      // ── Input Validation: sanitize numeric params ──
      if (params.limit !== undefined) {
        params.limit = Math.max(1, Math.min(1000, parseInt(params.limit, 10) || 50));
      }
      if (params.offset !== undefined) {
        params.offset = Math.max(0, Math.min(100000, parseInt(params.offset, 10) || 0));
      }
      if (params.threshold !== undefined) {
        const t = parseFloat(params.threshold);
        if (!Number.isFinite(t) || t < 0 || t > 1) {
          return res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
        }
        params.threshold = t;
      }
      if (params.minHands !== undefined) {
        const mh = parseInt(params.minHands, 10);
        if (!Number.isFinite(mh) || mh < 1 || mh > 10000) {
          return res.status(400).json({ error: 'minHands must be an integer between 1 and 10000' });
        }
        params.minHands = mh;
      }

      // ── Input Validation: string params must not contain SQL/injection ──
      const SQL_RE = /[;'"\\]|(--)|(\/\*)|DROP|ALTER|DELETE|INSERT|UPDATE|UNION|SELECT/i;
      for (const key of ['notes', 'reason', 'flagType', 'eventType']) {
        if (params[key] && typeof params[key] === 'string') {
          if (SQL_RE.test(params[key])) {
            return res.status(400).json({ error: `Invalid characters in ${key}` });
          }
          if (params[key].length > 500) {
            return res.status(400).json({ error: `${key} too long (max 500 chars)` });
          }
        }
      }

      // ── Input Validation: UUID params ──
      for (const key of ['flagId', 'playerId', 'tableId']) {
        if (params[key] && typeof params[key] === 'string' && !UUID_RE.test(params[key])) {
          return res.status(400).json({ error: `${key} must be a valid UUID` });
        }
      }

      // Verify caller is club owner/admin/manager
      const { data: membership } = await getSupabase()
        .from('club_members')
        .select('role')
        .eq('club_id', clubId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
        return res.status(403).json({ error: 'Not authorized. Club admin access required.' });
      }

      switch (action) {
        // ─────────────────────────────────────────────────────
        // GET FLAGS — Open flags for this club
        // ─────────────────────────────────────────────────────
        case 'get_flags': {
          const { status = 'open', severity, flagType, limit = 50, offset = 0 } = params;

          let query = getSupabase()
            .from('anti_cheat_flags')
            .select(`
              *,
              player:player_id (id, display_name, avatar_url),
              reviewer:reviewed_by (id, display_name)
            `)
            .eq('club_id', clubId)
            .order('flagged_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (status !== 'all') query = query.eq('status', status);
          if (severity) query = query.eq('severity', severity);
          if (flagType) query = query.eq('flag_type', flagType);

          const { data, error, count } = await query;
          if (error) throw error;

          return res.status(200).json({ success: true, flags: data || [], count });
        }

        // ─────────────────────────────────────────────────────
        // GET EVENTS — Recent anti-cheat events
        // ─────────────────────────────────────────────────────
        case 'get_events': {
          const { limit = 50, offset = 0, eventType, playerId } = params;

          let query = getSupabase()
            .from('anti_cheat_events')
            .select(`
              *,
              player:player_id (id, display_name, avatar_url)
            `)
            .eq('club_id', clubId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

          if (eventType) query = query.eq('event_type', eventType);
          if (playerId) query = query.eq('player_id', playerId);

          const { data, error } = await query;
          if (error) throw error;

          return res.status(200).json({ success: true, events: data || [] });
        }

        // ─────────────────────────────────────────────────────
        // GET SESSIONS — Active table sessions
        // ─────────────────────────────────────────────────────
        case 'get_sessions': {
          const { tableId } = params;

          let query = getSupabase()
            .from('table_sessions')
            .select(`
              *,
              player:player_id (id, display_name, avatar_url)
            `)
            .eq('club_id', clubId)
            .eq('is_active', true)
            .order('seated_at', { ascending: false })
            .limit(200);

          if (tableId) query = query.eq('table_id', tableId);

          const { data, error } = await query;
          if (error) throw error;

          return res.status(200).json({ success: true, sessions: data || [] });
        }

        // ─────────────────────────────────────────────────────
        // REVIEW FLAG — Atomic conditional update (TOCTOU-safe)
        // Uses .eq('status', 'open') to prevent double-review race.
        // Two admins clicking "Review" at the same time: only one
        // succeeds, the other gets 409 Conflict.
        // ─────────────────────────────────────────────────────
        case 'review_flag': {
          const { flagId, newStatus, notes } = params;

          if (!flagId) return res.status(400).json({ error: 'flagId required' });
          if (!['reviewed', 'dismissed', 'actioned'].includes(newStatus)) {
            return res.status(400).json({ error: 'newStatus must be reviewed, dismissed, or actioned' });
          }

          // ATOMIC: Only update if flag is still 'open' — prevents TOCTOU double-review
          const { data, error } = await getSupabase()
            .from('anti_cheat_flags')
            .update({
              status: newStatus,
              reviewed_by: userId,
              reviewed_at: new Date().toISOString(),
              review_notes: notes || null,
            })
            .eq('id', flagId)
            .eq('club_id', clubId)
            .eq('status', 'open')  // ← Row-level conditional lock: only if still 'open'
            .select()
            .maybeSingle();

          if (error) throw error;
          if (!data) {
            // Either flag doesn't exist OR was already reviewed (race condition caught)
            const { data: existing } = await getSupabase()
              .from('anti_cheat_flags')
              .select('id, status, reviewed_by, reviewed_at')
              .eq('id', flagId)
              .eq('club_id', clubId)
              .maybeSingle();

            if (!existing) {
              return res.status(404).json({ error: 'Flag not found' });
            }
            // Flag exists but was already reviewed — 409 Conflict
            return res.status(409).json({
              error: 'Flag already reviewed',
              current_status: existing.status,
              reviewed_by: existing.reviewed_by,
              reviewed_at: existing.reviewed_at,
            });
          }

          // Log the review event
          await getSupabase().from('anti_cheat_events').insert({
            event_type: `flag_${newStatus}`,
            player_id: data.player_id,
            club_id: clubId,
            table_id: data.table_id,
            details: { flag_id: flagId, new_status: newStatus, notes },
            triggered_by: userId,
          });

          const reviewResult = { success: true, flag: data };
          // Cache idempotent response
          if (idempotencyKey) {
            idempotencyStore.set(idempotencyKey, {
              status: 200, body: reviewResult, expiry: Date.now() + IDEMPOTENCY_TTL_MS,
            });
          }
          return res.status(200).json(reviewResult);
        }

        // ─────────────────────────────────────────────────────
        // KICK PLAYER — Recovery-tracked multi-step operation
        // Each step records its completion. If any step fails,
        // the recovery log allows manual or automated rollback.
        // Idempotency key prevents double-kicks from fat-fingers.
        // ─────────────────────────────────────────────────────
        case 'kick_player': {
          const { playerId: targetPlayerId, reason } = params;
          let { tableId } = params;

          if (!targetPlayerId) {
            return res.status(400).json({ error: 'playerId required' });
          }

          // If no tableId provided, try to find the player's active table session
          if (!tableId) {
            const { data: activeSession } = await getSupabase()
              .from('table_sessions')
              .select('table_id')
              .eq('club_id', clubId)
              .eq('player_id', targetPlayerId)
              .eq('is_active', true)
              .maybeSingle();
            tableId = activeSession?.table_id || null;
          }

          // ── Step tracker for disconnect recovery ──
          const kickOp = {
            step: 0, // 0=init, 1=stood_up, 2=session_closed, 3=chips_returned, 4=logged
            standUpResult: null,
            cashoutAmount: 0,
            errors: [],
          };

          try {
            // If player has no active table, skip stand-up and just log the kick
            if (!tableId) {
              kickOp.step = 3; // Skip steps 1-3 (no table to remove from)
            } else {
              // STEP 1: Force stand up via game controller
              let controller = null;
              try {
                const { getController } = await import('../../../src/lib/poker-engine/GameController');
                controller = await getController();
              } catch (importErr) {
                console.warn('[AntiCheat] GameController import error:', importErr?.message);
              }

              if (!controller) {
                return res.status(500).json({ error: 'Game controller not available' });
              }

              const result = await controller.standUp(tableId, targetPlayerId);
              kickOp.step = 1;
              kickOp.standUpResult = result;
              kickOp.cashoutAmount = result.cashout || 0;

              if (!result.success) {
                return res.status(200).json({
                  success: false,
                  message: result.error || 'Failed to remove player — may already be stood up',
                });
              }

              // STEP 2: Close table session (RPC — atomic on DB side)
              try {
                await getSupabase().rpc('close_table_session', {
                  p_table_id: tableId,
                  p_player_id: targetPlayerId,
                  p_reason: reason || 'Anti-cheat violation: removed by admin',
                });
                kickOp.step = 2;
              } catch (sessionErr) {
                kickOp.errors.push({ step: 'close_session', error: sessionErr?.message });
                console.warn('[AntiCheat] Session close failed (player already stood up):', sessionErr?.message);
                // Non-fatal: player is already stood up, session will expire naturally
              }

              // STEP 3: Return chips to club balance (if applicable)
              if (kickOp.cashoutAmount > 0) {
                try {
                  const ChipBridgeModule = await import('../../../src/lib/poker-engine/ChipBridge');
                  const ChipBridge = ChipBridgeModule.default || ChipBridgeModule;
                  await ChipBridge.unlockChips(clubId, targetPlayerId, tableId, kickOp.cashoutAmount);
                  kickOp.step = 3;
                } catch (chipErr) {
                  kickOp.errors.push({ step: 'unlock_chips', error: chipErr?.message, amount: kickOp.cashoutAmount });
                  console.warn('[AntiCheat] Chip unlock failed — MANUAL RECOVERY NEEDED:', {
                    clubId, targetPlayerId, tableId, amount: kickOp.cashoutAmount,
                  });
                  // CRITICAL: Log to anti_cheat_events for manual recovery
                  await getSupabase().from('anti_cheat_events').insert({
                    event_type: 'chip_unlock_failed',
                    player_id: targetPlayerId,
                    club_id: clubId,
                    table_id: tableId,
                    details: {
                      reason: 'Mid-kick chip unlock failure — requires manual recovery',
                      amount: kickOp.cashoutAmount,
                      error: chipErr?.message,
                      kicked_by: userId,
                    },
                    triggered_by: 'system',
                  }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Best-effort logging
                }
              } else {
                kickOp.step = 3; // No chips to unlock
              }
            } // end of if (tableId) else block

            // STEP 4: Log the kick event
            try {
              await getSupabase().from('anti_cheat_events').insert({
                event_type: 'player_kicked',
                player_id: targetPlayerId,
                club_id: clubId,
                table_id: tableId,
                details: {
                  reason,
                  kicked_by: userId,
                  cashout: kickOp.cashoutAmount,
                  recovery_steps_completed: kickOp.step,
                  errors: kickOp.errors.length > 0 ? kickOp.errors : undefined,
                },
                triggered_by: userId,
              });
              kickOp.step = 4;
            } catch (logErr) {
              kickOp.errors.push({ step: 'log_event', error: logErr?.message });
              // Non-fatal: kick succeeded, just logging failed
            }

            const kickResult = {
              success: true,
              message: `Player removed from table. Chips returned: ${kickOp.cashoutAmount}`,
              recovery: kickOp.errors.length > 0 ? {
                warnings: kickOp.errors,
                steps_completed: kickOp.step,
              } : undefined,
            };

            // Cache idempotent response
            if (idempotencyKey) {
              idempotencyStore.set(idempotencyKey, {
                status: 200, body: kickResult, expiry: Date.now() + IDEMPOTENCY_TTL_MS,
              });
            }

            return res.status(200).json(kickResult);

          } catch (fatalErr) { console.warn('[App] Handled exception:', fatalErr?.message || fatalErr); },
              triggered_by: 'system',
            }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); // Best-effort

            return res.status(500).json({
              error: 'Kick operation failed mid-execution',
              step_reached: kickOp.step,
              recovery_logged: true,
            });
          }
        }

        // ─────────────────────────────────────────────────────
        // GET PLAYER HISTORY — All flags/events for a player
        // ─────────────────────────────────────────────────────
        case 'get_player_history': {
          const { playerId: targetPlayerId } = params;
          if (!targetPlayerId) return res.status(400).json({ error: 'playerId required' });

          const [flagsResult, eventsResult, sessionsResult] = await Promise.all([
            getSupabase()
              .from('anti_cheat_flags')
              .select('*')
              .eq('club_id', clubId)
              .eq('player_id', targetPlayerId)
              .order('flagged_at', { ascending: false })
              .limit(50),

            getSupabase()
              .from('anti_cheat_events')
              .select('*')
              .eq('club_id', clubId)
              .eq('player_id', targetPlayerId)
              .order('created_at', { ascending: false })
              .limit(50),

            getSupabase()
              .from('table_sessions')
              .select('*')
              .eq('club_id', clubId)
              .eq('player_id', targetPlayerId)
              .order('seated_at', { ascending: false })
              .limit(20),
          ]);

          // BUG FIX: Check for errors in any promise result
          if (flagsResult.error || eventsResult.error || sessionsResult.error) {
            const err = flagsResult.error || eventsResult.error || sessionsResult.error;
            throw err;
          }

          return res.status(200).json({
            success: true,
            flags: flagsResult.data || [],
            events: eventsResult.data || [],
            sessions: sessionsResult.data || [],
          });
        }

        // ─────────────────────────────────────────────────────
        // GET STATS — Anti-cheat summary for dashboard
        // ─────────────────────────────────────────────────────
        case 'get_stats': {
          const [openFlags, recentBlocks, activeSessions] = await Promise.all([
            getSupabase()
              .from('anti_cheat_flags')
              .select('severity, flag_type', { count: 'exact' })
              .eq('club_id', clubId)
              .eq('status', 'open'),

            getSupabase()
              .from('anti_cheat_events')
              .select('event_type', { count: 'exact' })
              .eq('club_id', clubId)
              .eq('event_type', 'seat_blocked')
              .gte('created_at', new Date(Date.now() - 86400000).toISOString()),

            getSupabase()
              .from('table_sessions')
              .select('*', { count: 'exact' })
              .eq('club_id', clubId)
              .eq('is_active', true),
          ]);

          // Count by severity
          const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
          const byType = {};
          (openFlags.data || []).forEach(f => {
            bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
            byType[f.flag_type] = (byType[f.flag_type] || 0) + 1;
          });

          return res.status(200).json({
            success: true,
            stats: {
              open_flags: openFlags.count || 0,
              by_severity: bySeverity,
              by_type: byType,
              blocks_24h: recentBlocks.count || 0,
              active_sessions: activeSessions.count || 0,
            },
          });
        }

        // ─────────────────────────────────────────────────────
        // GET COLLUSION PAIRS — Chip-dumping ratio detection
        // ORB-7 Mandate: Track Win/Loss chip-dumping ratios
        // between specific player pairs
        // ─────────────────────────────────────────────────────
        case 'get_collusion_pairs': {
          const { threshold = 0.75, minHands = 5, limit = 500 } = params;

          const { data: hands, error: hErr } = await getSupabase()
            .from('mv_hand_histories')
            .select('player_ids, winner_ids, hand_data, pot_total')
            .eq('club_id', clubId)
            .order('completed_at', { ascending: false })
            .limit(limit);

          if (hErr) throw hErr;

          // Build chip-flow matrix: flowMatrix[A][B] = net chips flowing A → B
          const flowMatrix = {};
          const pairHandCount = {};

          for (const hand of (hands || [])) {
            const players = hand.hand_data?.players || [];
            if (players.length < 2) continue;

            // Track net results between each pair
            for (let i = 0; i < players.length; i++) {
              for (let j = i + 1; j < players.length; j++) {
                const pA = String(players[i].id);
                const pB = String(players[j].id);
                const pairKey = [pA, pB].sort().join('::');

                if (!pairHandCount[pairKey]) pairHandCount[pairKey] = 0;
                pairHandCount[pairKey]++;

                const netA = players[i].netResult || 0;
                const netB = players[j].netResult || 0;

                if (!flowMatrix[pairKey]) flowMatrix[pairKey] = { a: pA, b: pB, aToB: 0, bToA: 0 };

                // If A lost and B won (in the same hand), chips flowed A → B
                if (netA < 0 && netB > 0) {
                  flowMatrix[pairKey].aToB += Math.min(Math.abs(netA), netB);
                } else if (netB < 0 && netA > 0) {
                  flowMatrix[pairKey].bToA += Math.min(Math.abs(netB), netA);
                }
              }
            }
          }

          // Flag pairs with one-directional chip flow above threshold
          const flaggedPairs = [];
          for (const [pairKey, flow] of Object.entries(flowMatrix)) {
            const hands = pairHandCount[pairKey] || 0;
            if (hands < minHands) continue;

            const totalFlow = flow.aToB + flow.bToA;
            if (totalFlow === 0) continue;

            const ratio = Math.max(flow.aToB, flow.bToA) / totalFlow;
            if (ratio >= threshold) {
              const dumper = flow.aToB > flow.bToA ? flow.a : flow.b;
              const receiver = flow.aToB > flow.bToA ? flow.b : flow.a;
              flaggedPairs.push({
                dumper_id: dumper,
                receiver_id: receiver,
                hands_together: hands,
                chip_flow_ratio: parseFloat(ratio.toFixed(3)),
                net_chips_transferred: Math.round(Math.max(flow.aToB, flow.bToA)),
                severity: ratio >= 0.9 ? 'critical' : ratio >= 0.85 ? 'high' : 'medium',
              });
            }
          }

          // Sort by severity then ratio
          flaggedPairs.sort((a, b) => b.chip_flow_ratio - a.chip_flow_ratio);

          return res.status(200).json({
            success: true,
            pairs: flaggedPairs,
            analyzed_hands: (hands || []).length,
            threshold,
          });
        }

        // ─────────────────────────────────────────────────────
        // GET ANOMALIES — Folding-the-nuts detection
        // ORB-7 Mandate: Auto-flag folding the nuts on the river
        // ─────────────────────────────────────────────────────
        case 'get_anomalies': {
          const { limit = 500 } = params;

          const { data: hands, error: hErr } = await getSupabase()
            .from('mv_hand_histories')
            .select('id, hand_number, player_ids, winner_ids, hand_data, pot_total, completed_at')
            .eq('club_id', clubId)
            .order('completed_at', { ascending: false })
            .limit(limit);

          if (hErr) throw hErr;

          const STRONG_HANDS = ['royal_flush', 'straight_flush', 'four_of_a_kind', 'full_house', 'flush'];
          const anomalies = [];

          for (const hand of (hands || [])) {
            const hd = hand.hand_data || {};
            const players = hd.players || [];
            const riverActions = hd.streets?.river?.actions || [];

            for (const p of players) {
              const pid = String(p.id);
              // Check if player folded on the river
              const foldedRiver = riverActions.some(a =>
                String(a.playerId) === pid && a.type === 'fold'
              );

              if (!foldedRiver) continue;

              // Check if player had a strong hand
              const playerHand = p.finalHand || p.handRank || p.bestHand;
              if (!playerHand) continue;

              const handKey = String(playerHand).toLowerCase().replace(/\s+/g, '_');
              if (STRONG_HANDS.includes(handKey)) {
                anomalies.push({
                  hand_id: hand.id,
                  hand_number: hand.hand_number,
                  player_id: pid,
                  action: 'folded_strong_hand_on_river',
                  hand_rank: playerHand,
                  pot_total: hand.pot_total,
                  completed_at: hand.completed_at,
                  severity: ['royal_flush', 'straight_flush', 'four_of_a_kind'].includes(handKey) ? 'critical' : 'high',
                });
              }
            }
          }

          // Sort by severity (critical first) then date
          const sevOrder = { critical: 0, high: 1 };
          anomalies.sort((a, b) => (sevOrder[a.severity] || 99) - (sevOrder[b.severity] || 99));

          return res.status(200).json({
            success: true,
            anomalies,
            analyzed_hands: (hands || []).length,
          });
        }

        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (err) {
      console.warn('[AntiCheat API]', err);
      return res.status(500).json({ error: 'Internal error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
