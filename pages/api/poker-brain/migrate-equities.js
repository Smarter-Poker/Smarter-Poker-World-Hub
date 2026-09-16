/**
 * Poker Brain -- Historical Equity Migration API (RETIRED)
 * POST /api/poker-brain/migrate-equities
 *
 * 2026-08-15 CHECK 13: this endpoint queried pb_hands.low_equity and updated
 * pb_hands.schema_version / pb_hands.equity_needs_recompute — none of those
 * columns has ever existed on pb_hands (real equity lives in the single
 * `equity` numeric column), and no client-side recompute module reads the
 * flags it claimed to set. Every invocation 42703'd on the first query, so
 * the migration has never processed a single hand. There is nothing to
 * migrate; the endpoint is retired rather than given phantom columns.
 */
import { reportApiError } from '../../../src/lib/sentryWrap';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    return res.status(410).json({
      error: 'Gone',
      message:
        'The historical equity migration is retired: pb_hands never carried ' +
        'the schema_version/low_equity columns this migration targeted, so ' +
        'there is no legacy data to migrate.',
    });
  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
