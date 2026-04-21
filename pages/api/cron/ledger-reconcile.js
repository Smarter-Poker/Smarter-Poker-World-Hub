/**
 * Nightly Ledger Reconciliation
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 4.1.2 / Plan § 7.1.2 — every night at 04:00 ET (08:00 UTC) calls the
 * `public.reconcile_ledger_nightly()` SECURITY DEFINER function which:
 *
 *   1. For every `public.wallets` row, sums the `chip_ledger` credits and
 *      debits and compares against the stored `wallets.balance`.
 *   2. For every `public.clubs.chip_pool`, sums the club-treasury ledger
 *      entries and compares against the stored `clubs.chip_pool`.
 *   3. Inserts a row into `public.ledger_reconcile_log` for every entity
 *      with severity = 'ok' | 'warn' | 'critical' based on |drift|.
 *
 * Severity thresholds (set inside the SQL function):
 *   drift = 0        → ok      (exact match)
 *   |drift| ≤ $1.00  → warn    (cent rounding across many rows)
 *   else             → critical
 *
 * The function returns a single-row summary: (total_checked, ok_count,
 * warn_count, critical_count, worst_drift). This handler surfaces that
 * summary as JSON for observability and logs CRITICAL-level messages when
 * the critical_count is non-zero so Vercel's log stream picks them up.
 *
 * Alerting: this cron does NOT page anyone directly. The `ledger_reconcile_log`
 * table is what the audit dashboard reads; a critical-count > 0 here means
 * a human must review the `critical` rows for that run_date. A follow-up
 * Phase-4 task (§ 7.1.8 audit dashboard) will consume this data.
 *
 * Schedule: `0 8 * * *` (04:00 America/New_York during DST, 03:00 EST).
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { reportApiError } from '../../../src/lib/sentryWrap';

export const config = {
  maxDuration: 300 // 5 min — RPC scans every wallet + club.chip_pool row
};

export default async function handler(req, res) {
  // Require CRON_SECRET for both Vercel's cron invocation and manual GETs.
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getSupabaseAdmin();
  const started = Date.now();

  try {
    // Call the SECURITY DEFINER reconciliation function.
    const { data, error } = await supabase.rpc("reconcile_ledger_nightly");

    if (error) {
      console.warn("[ledger-reconcile] RPC error:", error);
      return res.status(500).json({ error: error.message });
    }

    // The function returns TABLE (single row). supabase-js surfaces that as
    // data[0] when using rpc() against a SETOF.
    const summary = Array.isArray(data) ? data[0] : data;
    const totalChecked = Number(summary?.total_checked || 0);
    const okCount = Number(summary?.ok_count || 0);
    const warnCount = Number(summary?.warn_count || 0);
    const criticalCount = Number(summary?.critical_count || 0);
    const worstDrift = Number(summary?.worst_drift || 0);
    const elapsedMs = Date.now() - started;

    const payload = {
      ok: true,
      phase: "4.1.2",
      run_at: new Date().toISOString(),
      elapsed_ms: elapsedMs,
      total_checked: totalChecked,
      ok_count: okCount,
      warn_count: warnCount,
      critical_count: criticalCount,
      worst_drift: worstDrift
    };

    if (criticalCount > 0) {
      console.warn(
        `[ledger-reconcile] CRITICAL: ${criticalCount} entities with drift > $1.00; worst = $${worstDrift.toFixed(2)}`
      );
    } else if (warnCount > 0) {
      console.warn(
        `[ledger-reconcile] WARN: ${warnCount} entities with sub-dollar drift; worst = $${worstDrift.toFixed(2)}`
      );
    } else {
      console.log(
        `[ledger-reconcile] clean run: ${totalChecked} entities, all ok`
      );
    }

    return res.status(200).json(payload);
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn("[ledger-reconcile] unhandled error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "unhandled reconcile failure" });
  }
}
