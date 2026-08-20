/**
 * /api/cron/club-stats-maintenance — Club Dashboard stats upkeep
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED MAINTENANCE ROUTE. This started as the club-stats upkeep job and has
 * become the place scheduled Club Arena maintenance lands, because CLAUDE.md
 * 11.3/11.5 fail CI on net-new pages/api/cron files and 11 routes new
 * scheduled work to Open Claw rather than pg_cron. Adding a step here is
 * therefore the sanctioned move, not a shortcut.
 *
 * Every step must be idempotent, independently failure-isolated (push to
 * result.errors and continue — never throw past a sibling), and cheap when
 * there is nothing to do, since this fires every 15 minutes. Steps are
 * deliberately NOT counted in this header: that count went stale twice in one
 * evening as steps were added. Read the numbered sections below instead.
 *
 *  0. ADVANCE THE PLAYER -> HAND INDEX (added by the player-stats work, which
 *     deliberately shares this route rather than adding a cron file — see the
 *     inline note at the call site). Its advisory lock makes a concurrent
 *     page-triggered refresh a no-op, so it cannot collide with the steps below.
 *
 *  1. DRAIN THE REBUILD BACKLOG. club_member_daily_stats is maintained live by
 *     the hand_history trigger, so NEW hands are always exact. History is not:
 *     7,281 tables across the two largest clubs were never rebuilt, and the
 *     biggest holds 75,211 hands — far more than one statement can process
 *     inside any workable timeout. ca_drain_club_rebuild walks those tables
 *     newest-activity-first via the resumable chunk walker, time-boxed so it
 *     never outlives the request. Stopping mid-table is safe: the cursor lives
 *     in club_stats_rebuild_log and the next run resumes from it.
 *
 *  2. ROLL club_hand_daily FORWARD. The trigger owns the current day from its
 *     first hand, so the rollup only needs help for a day that saw hands
 *     BEFORE the rollup existed. Yesterday is immutable once past, so it is
 *     safe to recompute exactly once; today is deliberately never touched
 *     (ca_backfill_club_hand_daily refuses it without p_force, because it
 *     writes an absolute snapshot and would discard concurrent increments).
 *
 * Cadence: every 15 minutes. The drain is the long pole and is capped well
 * under maxDuration; once the backlog is gone each run is a no-op costing one
 * cheap query per club.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export const config = { maxDuration: 300 };

// Total seconds of drain work per run, split across clubs that still have a
// backlog. Kept comfortably inside maxDuration so the rollup step always runs.
const DRAIN_BUDGET_SECONDS = 150;

async function handler(req, res) {
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const admin = getAdmin();
  if (!admin) {
    return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
  }

  const started = Date.now();
  const result = { drained: [], rollup: [], hand_index: null, errors: [] };

  try {
    // ── 0. ADVANCE THE PLAYER -> HAND INDEX ──────────────────────────────
    // ca_hand_player_idx is what makes the Club Arena stats page fast: without
    // it, "this player's most recent N hands" is a JSONB containment scan that
    // materialises every hand they ever played (measured 71,238 rows / ~12s for
    // one account) and gets cancelled by the 8s statement_timeout.
    //
    // It advances on stats-page loads, but that makes freshness depend on
    // traffic — and a player who has not opened the page is exactly the one
    // whose window has grown. Doing it here instead is deliberate: this route
    // already exists and is already scheduled, so it needs no net-new cron file
    // (CLAUDE.md section 11.3 forbids growing pages/api/cron/) and no second
    // scheduler. The advisory lock inside the function makes a concurrent
    // page-triggered refresh a no-op rather than duplicate work.
    try {
      const { data: idxRows, error: idxErr } = await admin.rpc(
        'ca_refresh_hand_player_index',
        { p_max_hands: 60000 }
      );
      if (idxErr) {
        result.errors.push(`hand index: ${idxErr.message}`);
      } else {
        const row = Array.isArray(idxRows) ? idxRows[0] : idxRows;
        result.hand_index = row || null;
      }
    } catch (e) {
      result.errors.push(`hand index: ${e?.message || e}`);
    }

    // ── 1. Which clubs still have un-rebuilt tables with recent hands? ──
    const { data: pending, error: pendingErr } = await admin.rpc('ca_clubs_with_rebuild_backlog');
    if (pendingErr) {
      result.errors.push(`backlog probe: ${pendingErr.message}`);
    }

    const clubs = (pending || []).map((r) => r.club_id).filter(Boolean);
    if (clubs.length > 0) {
      const perClub = Math.max(20, Math.floor(DRAIN_BUDGET_SECONDS / clubs.length));
      for (const clubId of clubs) {
        const { data, error } = await admin.rpc('ca_drain_club_rebuild', {
          p_club_id: clubId,
          p_max_seconds: perClub,
          p_chunk: 3000,
        });
        if (error) {
          result.errors.push(`drain ${clubId}: ${error.message}`);
          continue;
        }
        const row = Array.isArray(data) ? data[0] : data;
        result.drained.push({ club_id: clubId, ...(row || {}) });
      }
    }

    // ── 2. Roll club_hand_daily forward for yesterday (immutable) ────────
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: clubsNeedingRollup, error: rollupProbeErr } = await admin.rpc(
      'ca_clubs_missing_hand_daily',
      { p_date: yesterday }
    );
    if (rollupProbeErr) {
      result.errors.push(`rollup probe: ${rollupProbeErr.message}`);
    }
    for (const row of clubsNeedingRollup || []) {
      const { data, error } = await admin.rpc('ca_backfill_club_hand_daily', {
        p_club_id: row.club_id,
        p_date: yesterday,
      });
      if (error) {
        result.errors.push(`rollup ${row.club_id}: ${error.message}`);
        continue;
      }
      result.rollup.push({ club_id: row.club_id, date: yesterday, hands: data });
    }

    // ── Leaderboard snapshot self-heal (added 2026-08-19) ──────────────────
    // Every period leaderboard is a delta against player_stats_snapshots. The
    // 00:05 pg_cron capture has 21 runs and 1 failure (2026-08-09), and that is
    // exactly the day missing from the table - on a miss the RPCs fall back to
    // an older snapshot and "This Week" silently becomes a longer window.
    //
    // This runs every 15 minutes and is a no-op whenever today is already
    // captured, so the only case it acts on is a genuinely missing day. It
    // rides an EXISTING handler and schedule deliberately: CLAUDE.md 11.5 fails
    // CI on net-new pages/api/cron files, and 11 routes new scheduled work to
    // Open Claw rather than pg_cron.
    const { data: healData, error: healErr } = await admin.rpc(
      'fn_snapshot_player_stats_if_missing'
    );
    if (healErr) {
      result.errors.push(`snapshot heal: ${healErr.message}`);
    } else if (healData?.healed) {
      // Captured late, so the baseline for that day is hours off - worth seeing.
      console.warn('[club-stats-maintenance] snapshot self-heal fired:', JSON.stringify(healData));
      result.snapshot_heal = healData;
    }

    // Surface any remaining gap so a missed day is visible rather than silent.
    const { data: healthData, error: healthErr } = await admin.rpc('fn_snapshot_health', {
      p_days: 35,
    });
    if (healthErr) {
      result.errors.push(`snapshot health: ${healthErr.message}`);
    } else if (healthData) {
      result.snapshot_health = healthData;
      if ((healthData.missing_count || 0) > 0) {
        result.errors.push(
          `snapshot gaps present: ${JSON.stringify(healthData.missing_days)} - period leaderboard windows are wider than their labels for affected ranges`
        );
      }
    }

    const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
      probe_name: 'club-stats-maintenance',
      status: result.errors.length ? 'degraded' : 'ok',
      duration_ms: Date.now() - started,
      details: result,
    });
    if (heartbeatErr) {
      console.warn('[club-stats-maintenance] heartbeat write failed:', heartbeatErr.message);
    }

    return res.status(200).json({
      status: result.errors.length ? 'degraded' : 'ok',
      ...result,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message });
  }
}

export default withCronHealth('club-stats-maintenance', handler);
