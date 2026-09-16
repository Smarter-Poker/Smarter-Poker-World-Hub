import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * /api/club-arena/anti-cheat | ORB-7 AUDITED
 * 
 * Anti-cheat administration for club owners/admins.
 * 
 * Actions:
 *   get_flags       - Get open flags for a club (with filters)
 *   get_events      - Get recent anti-cheat events
 *   get_sessions    - Get active table sessions
 *   review_flag     - Mark a flag as reviewed/dismissed/actioned
 *   kick_player     - Remove a player from a table for anti-cheat violation
 *   get_player_history - Get all flags/events for a specific player
 *   get_stats       - Anti-cheat summary for dashboard
 *   get_collusion_pairs - Detect chip-dumping / collusion between player pairs
 *   get_anomalies   - Detect folding-the-nuts and other suspicious plays
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
import { reportApiError } from '../../../src/lib/apiErrorHandler';
const { checkIdempotency } = require('../../../src/lib/club-arena/idempotency');
import { auditOperatorAction } from '../../../src/lib/horses/operatorAudit.js';
import { requestIdOf } from '../../../src/lib/horses/apiEnvelope.js';
import { operatorHoldsPermission } from '../../../src/lib/horses/operatorGate.js';
import { PERMISSIONS } from '../../../src/lib/horses/permissions.js';

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



// Idempotency is handled entirely by the shared checkIdempotency helper
// (see the guard in the handler below). A second, hand-rolled in-memory
// store used to live here; it duplicated that helper and leaked an
// un-unref'd setInterval handle per lambda instance.

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'POST, OPTIONS', headers: 'Content-Type, Authorization, X-Idempotency-Key' })) return;
try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

  // Idempotency guard - prevents duplicate mutations from laggy mobile networks
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    if (checkIdempotency(req, res)) return;
  }
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      // ── Auth: verify JWT identity ──
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { action, clubId, ...params } = req.body;
      const userId = user.id; // From JWT, not body - NEVER trust req.body.user_id

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

      // ── Input Validation: string params length cap ──
      // The old regex blocklist here rejected any apostrophe and the word
      // SELECT. It bought nothing (PostgREST parameterizes every value) and
      // rejected legitimate moderator notes such as "player's second account".
      for (const key of ['notes', 'reason', 'flagType', 'eventType']) {
        if (params[key] && typeof params[key] === 'string') {
          if (params[key].length > 500) {
            return res.status(400).json({ error: `${key} too long (max 500 chars)` });
          }
        }
      }

      // ── Input Validation: UUID params ──
      for (const key of ['flagId', 'playerId', 'targetUserId', 'tableId']) {
        if (params[key] && typeof params[key] === 'string' && !UUID_RE.test(params[key])) {
          return res.status(400).json({ error: `${key} must be a valid UUID` });
        }
      }

      // Platform staff operating from /horses are not members of every club
      // they moderate. Without this branch they were 403'd on every club they
      // did not personally belong to, which is all of them.
      const { data: callerProfile } = await getSupabase()
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      // Platform staff here is whoever holds moderation.write, resolved the
      // way the console resolves it (re-verification M-3): the legacy profile
      // roles carry it until enforce_named_roles is on, a granted compliance or
      // operations operator carries it through the grant, and a narrowed
      // legacy account does not. Club owners, admins and super agents are
      // authorised through club_members below exactly as before.
      const platformGate = await operatorHoldsPermission(
        getSupabase(),
        { userId, profileRole: callerProfile?.role || null },
        PERMISSIONS.MODERATION_WRITE
      );
      const isPlatformAdmin = platformGate.ok === true;

      // The operator context the shared audit helper wants. Auth below is
      // unchanged; this only gives the audit rows the same actor, role, ip,
      // user agent, request id and before/after stamp every other console
      // write now carries.
      const auditOp = {
        // The caller's REAL role. `|| 'admin'` fabricated a platform privilege
        // for the common case here: a club agent with a null profiles.role who
        // is authorised through club_members. When there is no platform role
        // the club membership role found below is filled in instead, and if
        // there is neither the row says null rather than inventing one.
        user: { id: userId },
        role: callerProfile?.role || null,
        db: getSupabase(),
        requestId: requestIdOf(req),
      };

      // Verify caller is club owner / admin / super_agent.
      // Round 72: dropped 'manager' (0 rows in production), added
      // 'super_agent' (the de-facto admin role used elsewhere - waitlist,
      // club-analytics, lobby-ordering all gate on this trio).
      if (!isPlatformAdmin) {
        const { data: membership } = await getSupabase()
          .from('club_members')
          .select('role')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!membership || !['owner', 'admin', 'super_agent'].includes(membership.role)) {
          return res.status(403).json({ error: 'Not authorized. Club admin access required.' });
        }
        // This caller acted on their club membership, so that is the role the
        // audit row should name.
        if (!auditOp.role) auditOp.role = `club_${membership.role}`;
      }

      switch (action) {
        // ─────────────────────────────────────────────────
        // GET FLAGS - Open flags for this club
        // ─────────────────────────────────────────────────
        case 'get_flags': {
          const { status = 'open', severity, flagType, limit = 50, offset = 0 } = params;

          let query = getSupabase()
            .from('anti_cheat_flags')
            .select(`
              *,
              player:player_id (id, display_name, username, avatar_url),
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

          // The admin panel reads FLAT fields. anti_cheat_flags has no
          // user_id and no description column, so both are derived here
          // rather than selected.
          const flags = (data || []).map((f) => ({
            ...f,
            user_id: f.player_id,
            player_name: f.player?.display_name || f.player?.username || f.player_id,
            description: f.reason,
          }));

          return res.status(200).json({ success: true, flags, count });
        }

        // ─────────────────────────────────────────────────
        // GET EVENTS - Recent anti-cheat events
        // ─────────────────────────────────────────────────
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

        // ─────────────────────────────────────────────────
        // GET SESSIONS - Active table sessions
        // ─────────────────────────────────────────────────
        case 'get_sessions': {
          const { tableId } = params;

          let query = getSupabase()
            .from('table_sessions')
            .select(`
              *,
              player:player_id (id, display_name, username, avatar_url)
            `)
            .eq('club_id', clubId)
            .eq('is_active', true)
            .order('seated_at', { ascending: false })
            .limit(200);

          if (tableId) query = query.eq('table_id', tableId);

          const { data, error } = await query;
          if (error) throw error;

          // Flattened for the admin panel, same as get_flags. table_sessions
          // carries table_id (no table_name) and seated_at (no stored
          // duration), so duration_minutes is computed here.
          const now = Date.now();
          const sessions = (data || []).map((s) => {
            const startedMs = s.seated_at ? Date.parse(s.seated_at) : NaN;
            const endedMs = s.left_at ? Date.parse(s.left_at) : now;
            const durationMinutes = Number.isFinite(startedMs)
              ? Math.max(0, Math.round((endedMs - startedMs) / 60000))
              : null;
            return {
              ...s,
              user_id: s.player_id,
              player_name: s.player?.display_name || s.player?.username || s.player_id,
              duration_minutes: durationMinutes,
            };
          });

          return res.status(200).json({ success: true, sessions });
        }

        // ─────────────────────────────────────────────────
        // REVIEW FLAG - Atomic conditional update (TOCTOU-safe)
        // Uses .eq('status', 'open') to prevent double-review race.
        // Two admins clicking "Review" at the same time: only one
        // succeeds, the other gets 409 Conflict.
        // ─────────────────────────────────────────────────
        case 'review_flag': {
          const { flagId, newStatus, verdict, notes } = params;

          if (!flagId) return res.status(400).json({ error: 'flagId required' });

          // The admin panel sends `verdict` ('dismiss' | 'reviewed'); older
          // callers send `newStatus`. Accept either, and normalise the
          // panel's 'dismiss' to the stored 'dismissed'.
          let status = newStatus ?? verdict;
          if (status === 'dismiss') status = 'dismissed';
          if (!['reviewed', 'dismissed', 'actioned'].includes(status)) {
            return res.status(400).json({ error: 'newStatus must be reviewed, dismissed, or actioned' });
          }

          // ATOMIC: Only update if flag is still 'open' - prevents TOCTOU double-review
          const { data, error } = await getSupabase()
            .from('anti_cheat_flags')
            .update({
              status,
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
            // Flag exists but was already reviewed - 409 Conflict
            return res.status(409).json({
              error: 'Flag already reviewed',
              current_status: existing.status,
              reviewed_by: existing.reviewed_by,
              reviewed_at: existing.reviewed_at,
            });
          }

          // Log the review event
          const { error: eventErr } = await getSupabase().from('anti_cheat_events').insert({
            event_type: `flag_${status}`,
            player_id: data.player_id,
            club_id: clubId,
            table_id: data.table_id,
            details: { flag_id: flagId, new_status: status, notes },
            triggered_by: userId,
          });
          if (eventErr) console.warn('[AntiCheat] Failed to log review event:', eventErr.message);

          // Admin console audit trail. The conditional update above only
          // matches rows still in 'open', so that is the prior status.
          await auditOperatorAction(auditOp, req, {
            action: 'anticheat.review_flag',
            targetType: 'anti_cheat_flag',
            targetId: flagId,
            details: {
              club_id: clubId,
              player_id: data.player_id,
              table_id: data.table_id,
              flag_type: data.flag_type,
              severity: data.severity,
              verdict: status,
              notes: notes || null,
            },
            before: { status: 'open', reviewed_by: null, reviewed_at: null },
            after: { status, reviewed_by: userId, reviewed_at: data.reviewed_at },
          });

          return res.status(200).json({ success: true, flag: data });
        }

        // ─────────────────────────────────────────────────
        // KICK PLAYER - Recovery-tracked multi-step operation
        // Each step records its completion. If any step fails,
        // the recovery log allows manual or automated rollback.
        // Idempotency key prevents double-kicks from fat-fingers.
        // ─────────────────────────────────────────────────
        case 'kick_player': {
          // Round 68 follow-up: this action used to call the World-Hub-internal
          // GameController.standUp which operates on a parallel in-memory
          // lobby that has NO entries for production tables (engine lives on
          // Hetzner). Result: every kick was a silent no-op. Now we forward
          // the request to the engine's POST /admin/kick endpoint, which
          // independently verifies the caller's club_members.role + drives
          // the real ServerTableEngine.leaveTable cleanup.
          // The admin panel sends `targetUserId`; older callers send
          // `playerId`. Accept either.
          const { playerId, targetUserId, reason } = params;
          const targetPlayerId = playerId ?? targetUserId;
          let { tableId } = params;

          if (!targetPlayerId) {
            return res.status(400).json({ error: 'playerId (or targetUserId) required' });
          }

          // If no tableId provided, look up the player's active session
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

          // No table = nothing to remove from on the engine, but still log.
          let engineResult = null;
          if (tableId) {
            const engineUrl = process.env.GAME_SERVER_URL || 'https://engine.smarter.poker';
            // Server-to-server secret, NOT the caller's own JWT. Forwarding a
            // player-scoped token to another service hands that service a
            // credential it can replay as the caller.
            const engineSecret = process.env.GAME_SERVER_ADMIN_SECRET || process.env.CRON_SECRET || '';
            try {
              const resp = await fetch(`${engineUrl}/admin/kick`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${engineSecret}`,
                },
                body: JSON.stringify({
                  tableId,
                  userId: targetPlayerId,
                  actingUserId: userId,
                  reason: reason || 'Anti-cheat violation: removed by admin',
                }),
              });
              const respBody = await resp.json().catch(() => ({}));
              if (!resp.ok) {
                return res.status(resp.status).json({
                  success: false,
                  error: respBody?.error || 'Engine kick failed',
                  step: 'engine_admin_kick',
                });
              }
              engineResult = respBody;
            } catch (engineErr) {
              console.warn('[AntiCheat] engine /admin/kick failed:', engineErr?.message || engineErr);
              return res.status(502).json({
                success: false,
                error: 'Engine unreachable',
                step: 'engine_admin_kick',
              });
            }
          }

          // Engine writes its own anti_cheat_events row on success (R71), but
          // we ALSO write the dashboard-side audit row so admin review stays
          // unified whether the kick happened mid-session (engine path) or
          // when the player was already idle (no engine call).
          try {
            const { error: kickLogErr } = await getSupabase().from('anti_cheat_events').insert({
              event_type: 'player_kicked',
              player_id: targetPlayerId,
              club_id: clubId,
              table_id: tableId,
              details: {
                reason,
                kicked_by: userId,
                source: tableId ? 'engine_admin_kick' : 'no_active_table',
                engine_result: engineResult,
              },
              triggered_by: userId,
            });
            if (kickLogErr) throw kickLogErr;
          } catch (logErr) {
            console.warn('[AntiCheat] kick log failed:', logErr?.message || logErr);
            // Non-fatal - kick already succeeded server-side
          }

          // Admin console audit trail. A kick removes a seated player.
          await auditOperatorAction(auditOp, req, {
            // kick_player, not kick_session: the target is a player id, and a
            // name that says session made this row answer queries for
            // session-scoped events it is not.
            action: 'anticheat.kick_player',
            targetType: 'player',
            targetId: targetPlayerId,
            details: {
              club_id: clubId,
              table_id: tableId,
              reason: reason || null,
              source: tableId ? 'engine_admin_kick' : 'no_active_table',
              engine_result: engineResult,
            },
            after: { kicked: true, table_id: tableId },
          });

          return res.status(200).json({
            success: true,
            message: tableId
              ? 'Player removed from engine table'
              : 'Player not at any active table - kick logged only',
            engine_result: engineResult,
          });
        }

        // ─────────────────────────────────────────────────
        // GET PLAYER HISTORY - All flags/events for a player
        // ─────────────────────────────────────────────────
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

        // ─────────────────────────────────────────────────
        // GET STATS - Anti-cheat summary for dashboard
        // ─────────────────────────────────────────────────
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

        // ─────────────────────────────────────────────────
        // GET COLLUSION PAIRS - Chip-dumping ratio detection
        // ORB-7 Mandate: Track Win/Loss chip-dumping ratios
        // between specific player pairs
        // ─────────────────────────────────────────────────
        case 'get_collusion_pairs': {
          const { threshold = 0.75, minHands = 5, limit = 500 } = params;

          // Round 68 fix: read from live hand_history (was reading the stale
          // mv_hand_histories MV - 4 rows from 2026-03-03, never refreshed).
          // hand_history is the canonical engine output and has the same
          // logical fields under different column names: players + winners
          // are JSONB arrays, pot_size replaces pot_total, ended_at replaces
          // completed_at. We derive netResult from the winner side: the
          // winner's net is +pot_size, every other dealt-in player is -invested.
          //
          // Filter by club_id via the tables side-table since hand_history
          // doesn't carry club_id directly.
          const { data: clubTables } = await getSupabase()
            .from('tables')
            .select('id')
            .eq('club_id', clubId);
          const tableIds = (clubTables ?? []).map((t) => t.id);
          if (tableIds.length === 0) {
            return res.status(200).json({ success: true, pairs: [], analyzed_hands: 0, threshold });
          }

          const { data: hands, error: hErr } = await getSupabase()
            .from('hand_history')
            .select('id, players, winners, pot_size, ended_at')
            .in('table_id', tableIds)
            .order('ended_at', { ascending: false })
            .limit(limit);

          if (hErr) throw hErr;

          // Build chip-flow matrix: flowMatrix[A][B] = net chips flowing A → B
          const flowMatrix = {};
          const pairHandCount = {};

          for (const hand of (hands || [])) {
            const playersRaw = Array.isArray(hand.players) ? hand.players : [];
            if (playersRaw.length < 2) continue;

            const winnersRaw = Array.isArray(hand.winners) ? hand.winners : [];
            const winnerIds = new Set(
              winnersRaw.map((w) => w?.user_id ?? w?.userId ?? w?.id).filter(Boolean)
            );
            const pot = Number(hand.pot_size ?? 0);

            // Build players[] with netResult derived from winner status +
            // chips_invested (engine writes invested per seat in players JSONB).
            const players = playersRaw.map((p) => {
              const id = String(p.user_id ?? p.userId ?? p.id ?? '');
              const invested = Number(p.chips_invested ?? p.invested ?? 0);
              const isWinner = winnerIds.has(id);
              // Winner net = pot - invested; loser net = -invested.
              // Approximate: assumes single-winner hands. Multi-winner chops
              // skipped (winnerIds.size > 1 hands handled below).
              const netResult = isWinner && winnerIds.size === 1 ? pot - invested : -invested;
              return { id, netResult };
            });

            // Skip chops (multi-winner) - net attribution becomes ambiguous
            if (winnerIds.size !== 1) continue;

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
          for (const [pairKey, flow] of Object.entries(flowMatrix || {})) {
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

        // ─────────────────────────────────────────────────
        // GET ANOMALIES - Folding-the-nuts detection
        // ORB-7 Mandate: Auto-flag folding the nuts on the river
        // ─────────────────────────────────────────────────
        case 'get_anomalies': {
          const { limit = 500 } = params;

          // Round 68 fix: read from live hand_history (was reading the stale
          // mv_hand_histories MV - 4 rows from 2026-03-03). Map the new
          // column shape: actions JSONB has stage='river' + action='fold';
          // hand_name carries the strong-hand label.
          const { data: clubTables } = await getSupabase()
            .from('tables')
            .select('id')
            .eq('club_id', clubId);
          const tableIds = (clubTables ?? []).map((t) => t.id);
          if (tableIds.length === 0) {
            return res.status(200).json({ success: true, anomalies: [], analyzed_hands: 0 });
          }

          const { data: hands, error: hErr } = await getSupabase()
            .from('hand_history')
            .select('id, hand_number, players, winners, actions, pot_size, ended_at')
            .in('table_id', tableIds)
            .order('ended_at', { ascending: false })
            .limit(limit);

          if (hErr) throw hErr;

          const STRONG_HANDS = ['royal_flush', 'straight_flush', 'four_of_a_kind', 'full_house', 'flush'];
          const anomalies = [];

          for (const hand of (hands || [])) {
            const playersRaw = Array.isArray(hand.players) ? hand.players : [];
            const actionsRaw = Array.isArray(hand.actions) ? hand.actions : [];
            const riverFolds = actionsRaw
              .filter((a) => (a?.stage ?? a?.street) === 'river' && a?.action === 'fold')
              .map((a) => String(a?.userId ?? a?.user_id ?? a?.playerId ?? ''));
            if (riverFolds.length === 0) continue;

            // Each player's hand-strength label sits in player.hand_name (set
            // by the engine at showdown when cards are revealed).
            for (const p of playersRaw) {
              const pid = String(p.user_id ?? p.userId ?? p.id ?? '');
              if (!pid || !riverFolds.includes(pid)) continue;
              const playerHand = p.hand_name ?? p.finalHand ?? p.handRank ?? null;
              if (!playerHand) continue;
              const handKey = String(playerHand).toLowerCase().replace(/\s+/g, '_');
              if (!STRONG_HANDS.includes(handKey)) continue;
              anomalies.push({
                hand_id: hand.id,
                hand_number: hand.hand_number,
                player_id: pid,
                action: 'folded_strong_hand_on_river',
                hand_rank: playerHand,
                pot_total: Number(hand.pot_size ?? 0),
                completed_at: hand.ended_at,
                severity: ['royal_flush', 'straight_flush', 'four_of_a_kind'].includes(handKey)
                  ? 'critical'
                  : 'high',
              });
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
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
