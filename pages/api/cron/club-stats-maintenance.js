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
 *     It is immediately followed by the ca_hand_player_stat forward roll, which
 *     the Club Arena stats page depends on in the same way: whatever that step
 *     has not rolled, the page's RPC computes live, so the gap since this route
 *     last succeeded is directly a term in that page's response time.
 *
 *  WHAT THIS ROUTE NO LONGER DOES (2026-09-22). Three steps repaired work a
 *  writer owns. They are removed at source rather than left running:
 *
 *  - The profit reconcile, fn_reconcile_club_member_daily_profit(yesterday).
 *    pg_cron job reconcile-club-member-daily-profit runs the same function
 *    for the same date at 00:35 UTC with a 300s statement timeout; this route
 *    ran it 96 times a day under the 8s service_role timeout. Since the
 *    2026-09-19 no-rewrite fix only the first successful call of a day
 *    corrected a row (2,541 rows for 2026-09-21, at 00:00 and 00:15) and
 *    every later call updated none, while 147 calls in 7 days were cancelled
 *    by the timeout (all 87 on 2026-09-18) and spent this route's budget.
 *    From 2026-09-23 the function only measures and logs
 *    (a_members_profit_is_each_hands_own_net); one pg_cron call a day
 *    records that.
 *
 *  - The rebuild drain, ca_clubs_with_rebuild_backlog + ca_drain_club_rebuild.
 *    Its backlog was history: tables whose hands predate the live
 *    projection. None is left (0 pending tables created before 2026-08-20),
 *    so every run re-derived tables the live projection already keeps:
 *    36,195 tables and 851,555 hands in the 7 days to 2026-09-22. A table
 *    rebuilt while it was still being dealt came out with more hands_played
 *    than hand_history holds: in the six hours to 16:10 UTC on 2026-09-22,
 *    219 of 2,154 member-table-days on 93 of the 731 tables rebuilt while
 *    active, against 0 of 976 tables rebuilt while idle and 0 of the 1,544
 *    tables only the live projection had written.
 *
 *  - The club_hand_daily roll-forward, ca_clubs_missing_hand_daily +
 *    ca_backfill_club_hand_daily. The shard trigger owns every day since the
 *    rollup existed: in 3,097 runs from 2026-08-20 the probe found nothing to
 *    roll, and the statement timeout cancelled it 854 times.
 *
 *  The database functions stay, for a person who needs one table rebuilt or
 *  one day re-derived by hand. This law keeps them out of this schedule:
 *  __tests__/club-stats-maintenance-does-no-repair-work.law.test.mjs
 *
 * Cadence: every 15 minutes, for the index, stat rollup and distribution
 * steps above, whose readers compute live whatever has not been rolled yet.
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

// Open Claw is the caller and stops waiting after 120 seconds. Heavy
// production work ahead of the old rebuild drain took about 55 seconds, so
// target a 90-second whole-handler finish and stop scheduling optional work
// at 75 seconds, leaving 15 seconds for the heartbeat and response.
const HANDLER_BUDGET_SECONDS = 90;
const RESPONSE_RESERVE_SECONDS = 15;

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
  const handlerDeadline = started + HANDLER_BUDGET_SECONDS * 1000;
  const optionalWorkDeadline = handlerDeadline - RESPONSE_RESERVE_SECONDS * 1000;
  const result = {
    hand_index: null,
    stat_rollup: null,
    stat_distribution: null,
    budget_exhausted: false,
    errors: [],
  };

  // A SQL function's own time box is not enough to protect the HTTP request:
  // connection waits, statement startup, or an unexpectedly slow probe can
  // otherwise keep fetch pending beyond Open Claw's 120-second deadline. Give
  // every maintenance RPC one request-wide abort signal. Once the optional
  // work budget expires, later RPCs fail immediately and the heartbeat still
  // has its reserved response window.
  const workAbort = new AbortController();
  const workAbortTimer = setTimeout(
    () => {
      result.budget_exhausted = true;
      workAbort.abort(new Error('club stats maintenance work budget exhausted'));
    },
    Math.max(1, optionalWorkDeadline - Date.now())
  );
  const rpc = (name, args) => admin.rpc(name, args).abortSignal(workAbort.signal);

  try {
    // ── 0a. LEADERBOARD SNAPSHOT SELF-HEAL ────────────────────────────────
    // Runs FIRST, deliberately. Every period leaderboard is a delta against
    // player_stats_snapshots; the 00:05 pg_cron capture has 21 runs and 1
    // failure (2026-08-09, exactly the day missing from the table), and on a
    // miss the RPCs fall back to an older snapshot so "This Week" silently
    // becomes a longer window.
    //
    // This is one fast RPC and it is ordered ahead of the index refresh and the
    // backlog drain because those are the slow parts — the first observed run of
    // this route took 113s against a 300s maxDuration. Anything placed after
    // them is not guaranteed to execute on a heavy run, and a recovery step that
    // only runs when nothing else is busy is not a recovery step.
    //
    // No-op whenever today is already captured, so the only case it acts on is a
    // genuinely missing day. Rides this existing route and schedule on purpose:
    // CLAUDE.md 11.3/11.5 forbid growing pages/api/cron/, and 11 routes new
    // scheduled work to Open Claw rather than pg_cron.
    try {
      const { data: healData, error: healErr } = await rpc('fn_snapshot_player_stats_if_missing');
      if (healErr) {
        result.errors.push(`snapshot heal: ${healErr.message}`);
      } else if (healData?.healed) {
        // Captured late, so that day's baseline is hours off — worth seeing.
        console.warn(
          '[club-stats-maintenance] snapshot self-heal fired:',
          JSON.stringify(healData)
        );
        result.snapshot_heal = healData;
      }

      const { data: healthData, error: healthErr } = await rpc('fn_snapshot_health', {
        p_days: 35,
      });
      if (healthErr) {
        result.errors.push(`snapshot health: ${healthErr.message}`);
      } else if (healthData) {
        result.snapshot_health = healthData;
        // Only gaps inside the actionable window raise an error. An older gap
        // cannot be healed - a snapshot captures counters at a moment that has
        // passed - so alerting on it forever would pin this probe to non-ok and
        // train everyone to ignore it. All gaps remain visible in
        // snapshot_health for anyone who looks.
        const RECENT_GAP_DAYS = 7;
        const cutoff = new Date(Date.now() - RECENT_GAP_DAYS * 86400000).toISOString().slice(0, 10);
        const recentGaps = (healthData.missing_days || []).filter((d) => d >= cutoff);
        if (recentGaps.length > 0) {
          result.errors.push(
            `snapshot gaps in the last ${RECENT_GAP_DAYS}d: ${JSON.stringify(recentGaps)} - period leaderboard windows are wider than their labels for affected ranges`
          );
        }
      }
    } catch (e) {
      result.errors.push(`snapshot heal: ${e?.message || e}`);
    }

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
      const { data: idxRows, error: idxErr } = await rpc('ca_refresh_hand_player_index', {
        p_max_hands: 60000,
      });
      if (idxErr) {
        result.errors.push(`hand index: ${idxErr.message}`);
      } else {
        const row = Array.isArray(idxRows) ? idxRows[0] : idxRows;
        result.hand_index = row || null;
      }
    } catch (e) {
      result.errors.push(`hand index: ${e?.message || e}`);
    }

    // ── 0a2. ROLL THE PER-HAND STAT SUMMARIES FORWARD ─────────────────────
    // ca_hand_player_stat holds the ~28 scalars per (player, hand) that the
    // Club Arena stats page actually needs, so ca_player_stats_full reads ~20
    // pages instead of dragging 750 rows of 6.4 KB JSONB off disk. Measured
    // before it existed: 15,071 ms cold against an 8,000 ms statement_timeout,
    // which meant the page was being CANCELLED on heavy accounts, not merely
    // being slow.
    //
    // Anything the rollup has not reached, the RPC computes live. So the gap
    // since this last ran IS a term in the page's response time - at roughly
    // 142,000 hands a day, 15 minutes is about 1,500 hands and costs the page
    // very little, while a day of this step failing silently would be 142,000
    // and would put the page back where it started. That is why the row count
    // is reported rather than discarded: a number that keeps climbing across
    // runs means this step is not keeping up.
    //
    // Ordered immediately after the hand index for the same reason that one is
    // ordered early: the backlog drain below can take 150 seconds, and a step
    // placed after it is not guaranteed to run on a heavy day.
    try {
      const { data: rolled, error: rollErr } = await rpc('ca_roll_hand_stats_forward');
      if (rollErr) {
        result.errors.push(`stat rollup: ${rollErr.message}`);
      } else {
        result.stat_rollup = { hands_rolled: Number(rolled) || 0 };
      }
    } catch (e) {
      result.errors.push(`stat rollup: ${e?.message || e}`);
    }

    // ── 0b. REFRESH THE PERCENTILE DISTRIBUTION ────────────────────────────
    // ca_stat_distribution holds the p10/p25/p50/p75/p90 breakpoints that the
    // Club Arena stats page compares a player against ("how you compare").
    // Without a refresh the breakpoints freeze at whatever the field looked
    // like the day they were first computed, and every percentile shown slowly
    // becomes a lie about a club that has moved on.
    //
    // It lands here for the same reason the hand index does: this route is
    // already scheduled, and CLAUDE.md 11.3/11.5 fail CI on net-new
    // pages/api/cron files. It is a single aggregate over player_stats and
    // player_position_stats, so it is cheap; running it every 15 minutes is
    // wasteful but harmless, and simpler than carrying its own schedule.
    try {
      const { data: distData, error: distErr } = await rpc('ca_refresh_stat_distribution', {
        p_min_hands: 1000,
      });
      if (distErr) {
        result.errors.push(`stat distribution: ${distErr.message}`);
      } else {
        result.stat_distribution = distData || null;
      }
    } catch (e) {
      result.errors.push(`stat distribution: ${e?.message || e}`);
    }

    clearTimeout(workAbortTimer);
    const heartbeatAbort = AbortSignal.timeout(RESPONSE_RESERVE_SECONDS * 1000);
    const { error: heartbeatErr } = await admin
      .from('probe_heartbeats')
      .insert({
        probe_name: 'club-stats-maintenance',
        // 'partial', not 'degraded': probe_heartbeats_status_check allows only
        // ok | failed | partial. Writing 'degraded' violated the constraint, so
        // every run WITH errors silently failed to record - the exact runs you
        // most want recorded. The insert error is only console.warn'd, so this
        // was invisible until the Vercel runtime log was read directly.
        status: result.errors.length ? 'partial' : 'ok',
        duration_ms: Date.now() - started,
        details: result,
      })
      .abortSignal(heartbeatAbort);
    if (heartbeatErr) {
      console.warn('[club-stats-maintenance] heartbeat write failed:', heartbeatErr.message);
    }

    return res.status(200).json({
      status: result.errors.length ? 'partial' : 'ok',
      ...result,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err?.message });
  } finally {
    clearTimeout(workAbortTimer);
  }
}

export default withCronHealth('club-stats-maintenance', handler);
