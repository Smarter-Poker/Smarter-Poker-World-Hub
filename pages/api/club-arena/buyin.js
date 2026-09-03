/**
 * POST /api/club-arena/buyin — RETIRED (zero-drift phase 5 ruling, 2026-08-31).
 *
 * This endpoint converted diamonds → club chips through orb1_buyin_transaction,
 * which has been a deprecated HARD-FAIL stub since 2026-04-29 ("Walkthrough
 * Round 2: this RPC was a phantom that silently returned success"). Every call
 * here has errored for months; the endpoint only existed to swallow traffic.
 *
 * THE RULING: there is exactly one sanctioned flow for each thing this
 * endpoint pretended to do —
 *   • sitting at a table:        atomic_table_buyin (called by the client flow)
 *   • diamond → chip conversion: fn_atomic_buyin, which now journals the
 *     issuance as a 'mint' against issuance_reserve in chip_ledger
 *     (migration ca_phase5_atomic_buyin_mints_honestly) instead of an
 *     anonymous adjustment.
 *
 * This handler is now an honest 410 so any stale client learns the real
 * destination instead of a mystery 500. It performs no money operations.
 */
export default async function handler(req, res) {
  res.setHeader('Allow', 'POST');
  return res.status(410).json({
    success: false,
    error: 'gone',
    message:
      'This endpoint is retired. Table sits go through the club flow (atomic_table_buyin); ' +
      'diamond-to-chip conversion goes through the cashier flow (fn_atomic_buyin).',
  });
}
