/**
 * GET /api/internal/pnm-integrity-refresh
 *
 * Daily Open Claw entry point for the Poker Near Me venue-integrity queue.
 * Row-change triggers keep ordinary edits current, but freshness is also a
 * function of elapsed time. This exact refresh makes venues cross the 30-day
 * stale boundary even when their source row has not changed.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { withCronHealth } from '../../../src/lib/cronHealth';
import { syncVenueIntegrityState } from '../../../src/lib/poker-near-me/venueIntegrityState';
import { validateCronAuth } from '../../../src/utils/cron-auth';

export const config = { maxDuration: 300 };

let _supabase = null;

function getSupabase() {
  if (!_supabase) _supabase = createClient();
  return _supabase;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    if (!validateCronAuth(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  } catch (_error) {
    return res.status(500).json({ ok: false, error: 'Cron authentication is not configured' });
  }

  try {
    const result = await syncVenueIntegrityState(getSupabase());
    if (result.source_rows !== result.synced_rows) {
      return res.status(503).json({
        ok: false,
        error: 'Venue integrity refresh did not synchronize every source row',
        ...result,
      });
    }
    return res.status(200).json({
      ok: true,
      ...result,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[pnm-integrity-refresh] failed:', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Venue integrity refresh failed' });
  }
}

export default withCronHealth('pnm-integrity-refresh', handler);
