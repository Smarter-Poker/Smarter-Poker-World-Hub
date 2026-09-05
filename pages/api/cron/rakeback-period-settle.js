/**
 * /api/cron/rakeback-period-settle — pay the rakeback that players earned
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS (2026-08-31 heads-up audit, Phase 1)
 *
 * Open Claw has been firing this path on a schedule since the Wave 5 rollout
 * — `('/api/cron/rakeback-period-settle', dict(day_of_week='mon', hour=10,
 * minute=30))` in scripts/openclaw-cron-dispatcher.py. The handler it was
 * calling never existed. It was written for `smarter-poker-workers`, the repo
 * Phase 2B has not created yet, so every fire since has hit a 404 and
 * reported nothing: a scheduler pointed at an empty URL fails silently and
 * looks exactly like a scheduler doing its job.
 *
 * What that cost, measured on production the day this was written:
 *
 *     rakeback_periods    status=pending   2,456 rows   281,108.01 chips owed
 *                         oldest period    2026-07-20   (six weeks)
 *                         newest PAID      2026-08-23   (nothing for 8 days)
 *
 * The money is not lost — `apply_rakeback_player_stats` kept accruing it
 * correctly the whole time, and the settlement chain underneath
 * (settle_club_rakeback -> fn_close_settlement_period) has always worked when
 * a human called it. What was missing was the caller.
 *
 * WHAT IT DOES
 *
 * For every club with a pending period that has actually ENDED (period_end <
 * today — a period still running must not be settled early), calls
 * `settle_club_rakeback(club_id)`. That function is idempotent per club and
 * per period: it only picks up `status='pending'` rows, and closing one
 * stamps it paid, so a double fire pays nobody twice.
 *
 * It does NOT call fn_run_pending_rakeback_settlement, which looks like the
 * obvious entry point: that function gates on `auth.uid()` being an admin
 * profile, and a service-role cron has no auth.uid() at all.
 * settle_club_rakeback accepts the service role through fn_caller_is_engine(),
 * which is the sanctioned server-side path.
 *
 * SAFETY VALVE — DRY RUN
 *
 * `?dry=1` reports exactly what would be settled and pays nothing. The first
 * production run of a job that moves a quarter of a million chips should be a
 * dry run, and this endpoint makes that a query parameter rather than a code
 * change.
 *
 * MAX_CLUBS bounds one invocation so a backlog can never turn a cron tick
 * into a long transaction storm; the response reports what remains and the
 * next tick continues. Three clubs carry rakeback today, so this is headroom
 * rather than a limit.
 *
 * Cadence: Mondays 10:30 UTC via Open Claw (CLAUDE.md section 11 — NOT
 * vercel.json), 20 minutes after the Monday 10:10 auto-settlement fire so the
 * periods it closes are the ones settlement just finished feeding.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { validateCronAuth } from '../../../src/utils/cron-auth';
import { withCronHealth } from '../../../src/lib/cronHealth';
// Sentry: this route is on the allowlist in docs/SENTRY-FREE-TIER-POLICY.md
// (it moves chips). reportApiError sends; flushSentry runs before the lambda
// returns so the event is not frozen with it.
import { reportApiError, flushSentry } from '../../../src/lib/sentryWrap';

/** One tick settles at most this many clubs. Three carry rakeback today. */
const MAX_CLUBS = 50;

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

  const dryRun = req.query?.dry === '1' || req.query?.dry === 'true';
  const started = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ── 1. What is owed, before we touch anything ────────────────────────
    // period_end < today is the same test settle_club_rakeback applies
    // internally; reporting on a different set than the one that settles is
    // how a job comes to claim work it did not do.
    // PAGED, because PostgREST caps a select at 1000 rows and silently
    // returns the first page. The first live dry run reported 1,000 periods
    // and 113,122.34 owed against a real backlog of 2,456 and 281,108.01 —
    // an under-report that would have looked like progress on every tick.
    const PAGE = 1000;
    const MAX_PAGES = 50; // 50k periods is far beyond any real backlog
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data: chunk, error: pendErr } = await admin
        .from('rakeback_periods')
        .select('club_id, rakeback_amount, rakeback_earned, period_end')
        .eq('status', 'pending')
        .lt('period_end', today)
        .order('period_end', { ascending: true })
        .range(page * PAGE, page * PAGE + PAGE - 1);

      if (pendErr) {
        return res.status(500).json({
          status: 'failed',
          stage: 'read_pending',
          error: pendErr.message,
          duration_ms: Date.now() - started,
        });
      }
      rows.push(...(chunk || []));
      if (!chunk || chunk.length < PAGE) break;
    }
    const clubs = [...new Set(rows.map((r) => r.club_id).filter(Boolean))];
    const owed = rows.reduce(
      (sum, r) => sum + Number(r.rakeback_amount ?? r.rakeback_earned ?? 0),
      0
    );

    if (rows.length === 0) {
      return res.status(200).json({
        status: 'ok',
        dry_run: dryRun,
        pending_periods: 0,
        note: 'nothing due',
        duration_ms: Date.now() - started,
      });
    }

    if (dryRun) {
      return res.status(200).json({
        status: 'ok',
        dry_run: true,
        pending_periods: rows.length,
        pending_clubs: clubs.length,
        estimated_payout: Math.round(owed * 100) / 100,
        oldest_period_end: rows.reduce(
          (min, r) => (!min || r.period_end < min ? r.period_end : min),
          null
        ),
        note: 'no money moved - re-run without ?dry=1 to settle',
        duration_ms: Date.now() - started,
      });
    }

    // ── 2. Settle, club by club ──────────────────────────────────────────
    // Per-club so one club's failure cannot abort the rest, and so the
    // response can name exactly which club refused and why.
    let periodsSettled = 0;
    let totalPayout = 0;
    const failures = [];

    for (const clubId of clubs.slice(0, MAX_CLUBS)) {
      const { data, error } = await admin.rpc('settle_club_rakeback', { p_club_id: clubId });
      if (error) {
        failures.push({ club_id: clubId, error: error.message });
        continue;
      }
      if (data?.success) {
        periodsSettled += Number(data.periods_settled || 0);
        totalPayout += Number(data.total_payout || 0);
      } else {
        failures.push({ club_id: clubId, error: data?.error || 'refused' });
      }
    }

    // ── 3. What is left ──────────────────────────────────────────────────
    const { count: remaining } = await admin
      .from('rakeback_periods')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('period_end', today);

    // A club that refuses settlement is money still owed to real players, so
    // it is an operator-visible failure, not a line in a log nobody reads.
    const status = failures.length > 0 ? 500 : 200;
    if (failures.length > 0) {
      await reportApiError(
        new Error(`rakeback-period-settle: ${failures.length} club(s) refused settlement`),
        req,
        { money: true, tags: { stage: 'settle_club_rakeback' }, context: { failures: failures.slice(0, 20), owed, periods_settled: periodsSettled } }
      );
      await flushSentry();
    }

    return res.status(status).json({
      status: failures.length > 0 ? 'partial' : 'ok',
      dry_run: false,
      clubs_processed: Math.min(clubs.length, MAX_CLUBS),
      periods_settled: periodsSettled,
      total_payout: Math.round(totalPayout * 100) / 100,
      periods_remaining: remaining ?? null,
      failures,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    await reportApiError(err, req, { money: true, tags: { stage: 'unhandled' } });
    await flushSentry();
    return res.status(500).json({
      status: 'failed',
      error: err?.message || String(err),
      duration_ms: Date.now() - started,
    });
  }
}

export default withCronHealth('rakeback-period-settle', handler);
