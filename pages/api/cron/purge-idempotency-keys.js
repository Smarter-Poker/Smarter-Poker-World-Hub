/**
 * Nightly purge of idempotency-key table (> 7 days old)
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 4.1.3 / Plan § 7.1.3. Calls `public.purge_idempotency_keys()` which
 * DELETEs rows from `public.idempotency_keys` older than 7 days and returns
 * the deleted row count.
 *
 * Retention rationale: 7 days is more than enough to catch any realistic
 * retry window (webhooks, network retries, fast-click dedup). Longer
 * retention grows the table unnecessarily since idempotency keys are
 * deterministic and the caller's own logic guarantees non-reuse.
 *
 * Schedule: `30 8 * * *` (30 minutes after ledger-reconcile, same 04:30 ET slot).
 */

import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const config = {
  maxDuration: 60
};

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = getSupabaseAdmin();
  const started = Date.now();

  try {
    const { data, error } = await supabase.rpc("purge_idempotency_keys");

    if (error) {
      console.error("[purge-idempotency-keys] RPC error:", error);
      return res.status(500).json({ error: error.message });
    }

    // RPC returns an integer (rows deleted)
    const deleted = typeof data === "number" ? data : Number(data || 0);
    const elapsedMs = Date.now() - started;

    console.log(
      `[purge-idempotency-keys] deleted=${deleted} elapsed_ms=${elapsedMs}`
    );

    return res.status(200).json({
      ok: true,
      phase: "4.1.3",
      deleted,
      elapsed_ms: elapsedMs,
      run_at: new Date().toISOString()
    });
  } catch (err) {
    console.error("[purge-idempotency-keys] unhandled:", err);
    return res
      .status(500)
      .json({ error: err?.message || "unhandled purge failure" });
  }
}
