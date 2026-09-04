/**
 * /api/cron/restriction-maintenance - the two housekeeping passes Phase 4 owes
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ONE HANDLER, TWO PASSES, DELIBERATELY.
 *
 * Both are maintenance on the same record - `ca_player_restrictions` and the
 * observation log beside it - both are idempotent, both take milliseconds, and
 * `pages/api/cron/` is under a CI ratchet that fails on net-new files
 * (CLAUDE.md 11.5, CHECK 6b). Two handlers would spend two of that budget on
 * work that shares a subject, a table and a schedule.
 *
 * ── PASS 1: EXPIRE ─────────────────────────────────────────────────────────
 *
 * `fn_ca_restriction_expire_sweep()` marks run-out restrictions `expired`.
 *
 * IT CHANGES NO BEHAVIOUR, and that is worth saying plainly so nobody reads
 * its absence as an outage. `expires_at` is the CLOCK and `status` is only the
 * INTENT: `fn_ca_player_restricted` - the reader the guards call - already
 * treats a run-out row as not binding, and `fn_ca_player_restrict` retires a
 * stale row itself before writing a new one. So a player is never restricted a
 * second longer than their expiry, sweep or no sweep.
 *
 * What the sweep buys is an honest LIST. Without it the Restrictions tab shows
 * `active` against somebody who is not restricted, and an operator reading
 * that goes looking for a lift that is not needed - or worse, believes the
 * platform is still stopping somebody it stopped stopping yesterday.
 *
 * ── PASS 2: PRUNE ──────────────────────────────────────────────────────────
 *
 * `fn_ca_restriction_observation_prune(days)` drops observations by AGE.
 *
 * While `ca_operator_policy.restrictions_enforced` is false, every entry a
 * restriction WOULD have refused is written to `ca_restriction_observations`
 * and allowed through. That log is the evidence Dan is meant to judge by
 * before turning enforcement on - and the fleet re-seats continuously, so one
 * restricted horse writes a row per seating attempt, forever, with two indexes
 * riding along on every insert.
 *
 * PHASE4-CONTRACTS section 2 and the table's own comment both promised
 * "retained by age" and nothing delivered it. This is that.
 *
 * ── WHY OPEN CLAW AND NOWHERE ELSE ─────────────────────────────────────────
 *
 * World Hub CLAUDE.md 10.9 is a HARD LAW and it is not about preference: a
 * task on the Claude scheduler belongs to ONE Claude account, and Dan works
 * across several, so one installed from a session is unreachable from the
 * next. It does not error. It keeps reporting `enabled: true` and never fires
 * again. `smarter-poker-cron-health` read healthy for two and a half months
 * while its last run was 2026-06-17.
 *
 * A scheduler that lies about running is worse than none, because somebody
 * stops watching the thing it claimed to watch. So: Open Claw, registered in
 * scripts/openclaw-cron-dispatcher.py, deployed with
 * bash scripts/deploy-openclaw.sh.
 *
 * ── WHY IT NEVER RETURNS 500 FOR AN EMPTY RUN ──────────────────────────────
 *
 * Nothing to expire and nothing to prune is the NORMAL state of a platform
 * where nobody is restricted, which is the state today (0 rows). A red light
 * for that would be a false alarm on a dashboard whose whole value is that a
 * red light means something. It answers 500 only when a pass genuinely failed.
 *
 * Cadence: hourly at :20. Neither pass is time-critical - the reader is
 * authoritative on expiry, and the log is bounded by days - and :20 keeps it
 * off the quarter-hour pile-up that made spin-sweep hit the statement timeout
 * (see its note), and well clear of the :55 maintenance break.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';

/**
 * How long an observation is kept.
 *
 * Thirty days is long enough to answer "what would enforcement have refused
 * over the last month" - the question this log exists for - and short enough
 * that an enforced platform with a busy restriction list does not accumulate
 * a table nobody prunes. The RPC clamps its own argument to 1..3650.
 */
const OBSERVATION_RETENTION_DAYS = 30;

let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export const config = { maxDuration: 60 };

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
  const alerts = [];
  let expired = null;
  let deleted = null;

  // PASS 1. Independent of pass 2 on purpose: a failure in one must not hide
  // the other's result, and neither is a prerequisite for the other.
  try {
    const { data, error } = await admin.rpc('fn_ca_restriction_expire_sweep');
    if (error) throw new Error(error.message);
    expired = Number(data?.expired ?? 0);
  } catch (err) {
    alerts.push(`expire sweep failed: ${err?.message || 'unknown'}`);
  }

  // PASS 2.
  try {
    const { data, error } = await admin.rpc('fn_ca_restriction_observation_prune', {
      p_days: OBSERVATION_RETENTION_DAYS,
    });
    if (error) throw new Error(error.message);
    deleted = Number(data?.deleted ?? 0);
  } catch (err) {
    alerts.push(`observation prune failed: ${err?.message || 'unknown'}`);
  }

  /**
   * The two numbers an operator would want beside the result, read AFTER the
   * sweep so they describe the state it left behind.
   *
   * `enforced` rides along because it changes what the observation count
   * MEANS: with enforcement off a row is a dry-run record of something that
   * was allowed through; with it on the log stops growing, because the entry
   * is refused instead. A count that falls to zero the day enforcement goes
   * live is the system working, not the sweep over-pruning, and the only way
   * to tell those apart later is to have recorded which state it was in.
   */
  let activeRestrictions = null;
  let observationsRemaining = null;
  let enforced = null;
  try {
    const nowIso = new Date().toISOString();
    const [{ count: active }, { count: obs }, { data: policy }] = await Promise.all([
      admin
        .from('ca_player_restrictions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
      admin
        .from('ca_restriction_observations')
        .select('id', { count: 'exact', head: true }),
      admin.from('ca_operator_policy').select('restrictions_enforced').limit(1).maybeSingle(),
    ]);
    activeRestrictions = active ?? null;
    observationsRemaining = obs ?? null;
    // Tristate, as everywhere else in this phase: a policy row that could not
    // be read is UNKNOWN, never "off".
    enforced = policy ? policy.restrictions_enforced === true : null;
  } catch (err) {
    // A failed count is not a failed sweep. Report it as unknown, not as zero,
    // and do not turn the light red for it.
    console.warn('[restriction-maintenance] context read failed:', err?.message);
  }

  const payload = {
    status: alerts.length === 0 ? 'ok' : 'attention',
    expired,
    deleted,
    retentionDays: OBSERVATION_RETENTION_DAYS,
    activeRestrictions,
    observationsRemaining,
    enforced,
    alerts,
    duration_ms: Date.now() - started,
  };

  const { error: heartbeatErr } = await admin.from('probe_heartbeats').insert({
    probe_name: 'restriction-maintenance',
    status: payload.status,
    duration_ms: payload.duration_ms,
    details: payload,
  });
  if (heartbeatErr) {
    console.warn('[restriction-maintenance] heartbeat write failed:', heartbeatErr.message);
  }

  // Nothing to do is the normal state and stays green. Only a pass that
  // actually failed turns this red.
  return res.status(alerts.length === 0 ? 200 : 500).json(payload);
}

export default withCronHealth('restriction-maintenance', handler);
