/**
 * /api/cron/player-stats-refresh — keep VPIP/PFR and hand counts current
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS (2026-08-31 heads-up audit, Phase 1)
 *
 * Open Claw fires this hourly at :15 —
 * `('/api/cron/player-stats-refresh', dict(minute=15))` in
 * scripts/openclaw-cron-dispatcher.py — and the handler never existed. It was
 * written for `smarter-poker-workers`, a repo that has not been created, so
 * every fire since the Wave 5 rollout has hit a 404. The scheduler reported
 * success, because a 404 is a response.
 *
 * The visible consequence: `player_stats` is what the club leaderboards, the
 * leak finder and the nit/VPIP eviction rules all read. Stale stats mean a
 * player is evicted on last week's VPIP and ranked on last week's volume.
 *
 * NOT club-stats-maintenance. That job rebuilds CLUB rollups
 * (fn_snapshot_health, ca_refresh_hand_player_index, ca_drain_club_rebuild)
 * and never touches player_stats.
 *
 * WHAT IT DOES
 *
 * Calls `fn_refresh_player_stats(p_since)`, which recomputes hands, VPIP and
 * PFR per (user, club) from hand_history and upserts player_stats. The
 * function is idempotent — hands_played takes GREATEST of stored and computed
 * — so an overlapping window never double-counts and a re-run is free.
 *
 * LOOKBACK is deliberately wider than the cadence. The job runs hourly and
 * looks back 26 hours, so a whole day of missed ticks (a deploy, an Open Claw
 * restart) is repaired by the next successful run rather than leaving a hole
 * nothing ever fills. `?since_hours=N` overrides it for a manual catch-up.
 *
 * HORSES ARE PLAYERS: no is_horse filter here or in the SQL function. A
 * horse's hands count exactly like a human's, which is what the nit-eviction
 * rules and the club leaderboards both require.
 *
 * Cadence: hourly at :15 via Open Claw (CLAUDE.md section 11 — NOT
 * vercel.json).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

/** Hourly cadence, 26-hour window: a full day of misses still self-heals. */
const DEFAULT_SINCE_HOURS = 26;
/** A manual catch-up may reach back a week, never further in one call. */
const MAX_SINCE_HOURS = 24 * 7;

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

async function handler(req, res) {
  if (!validateCronAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const admin = getAdmin();
  if (!admin) {
    return res.status(500).json({ status: 'unconfigured', error: 'Missing SUPABASE env vars' });
  }

  const requested = Number(req.query?.since_hours);
  const sinceHours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.floor(requested), MAX_SINCE_HOURS)
      : DEFAULT_SINCE_HOURS;

  const since = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const started = Date.now();

  try {
    const { data, error } = await admin.rpc('fn_refresh_player_stats', { p_since: since });

    if (error) {
      return res.status(500).json({
        status: 'failed',
        error: error.message,
        since,
        duration_ms: Date.now() - started,
      });
    }

    return res.status(200).json({
      status: 'ok',
      since,
      since_hours: sinceHours,
      users_updated: Number(data?.users || 0),
      hands_counted: Number(data?.hands_counted || 0),
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    return res.status(500).json({
      status: 'failed',
      error: err?.message || String(err),
      since,
      duration_ms: Date.now() - started,
    });
  }
}

export default withCronHealth('player-stats-refresh', handler);
