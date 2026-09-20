/**
 * API: /api/poker/scraper-metrics
 * Returns recent cycle performance metrics from scraper_metrics table.
 * Used by the ScraperHealthDashboard to show performance trends.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { buildScraperMetricBucket } from '../../../src/lib/poker-near-me/scraperMetrics';
import { authorizePokerOpsRead } from '../../../src/lib/poker-near-me/opsReadAuth';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  try {
    const supabase = getSupabase();
    const access = await authorizePokerOpsRead(req, supabase);
    res.setHeader('Vary', 'Authorization, x-cron-secret, x-admin-secret');
    res.setHeader('Cache-Control', 'private, no-store');
    if (!access.authorized) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const hoursParam = Array.isArray(req.query.hours) ? req.query.hours[0] : req.query.hours;
    const parsedHours = Number.parseInt(hoursParam, 10);
    const hours = Math.min(Math.max(Number.isFinite(parsedHours) ? parsedHours : 24, 1), 168);
    const responseNow = Date.now();
    const since = new Date(responseNow - hours * 60 * 60 * 1000).toISOString();
    const nowIso = new Date(responseNow).toISOString();

    const fetchSourceMetrics = (source) => supabase
      .from('scraper_metrics')
      .select('*')
      .eq('source', source)
      .gte('cycle_start', since)
      .lte('cycle_start', nowIso)
      // Bound each source independently. A noisy catalog engine must not push
      // the model or live engine out of one shared 500-row result window.
      .order('cycle_start', { ascending: false })
      .limit(500);
    const [bravoResult, simulatorResult, pokeratlasResult] = await Promise.all([
      fetchSourceMetrics('bravo'),
      fetchSourceMetrics('bravo-simulator'),
      fetchSourceMetrics('pokeratlas'),
    ]);
    const error = bravoResult.error || simulatorResult.error || pokeratlasResult.error;

    if (error) {
      // Table may not exist yet
      console.warn('scraper_metrics query failed:', error.message);
      return res.status(200).json({
        period_hours: hours,
        since,
        contract_version: '2026-09-06.2',
        bravo: buildScraperMetricBucket([]),
        bravo_simulator: buildScraperMetricBucket([]),
        pokeratlas: buildScraperMetricBucket([]),
        message: 'Metrics table not available yet',
      });
    }

    return res.status(200).json({
      period_hours: hours,
      since,
      contract_version: '2026-09-06.2',
      bravo: buildScraperMetricBucket(bravoResult.data || []),
      bravo_simulator: buildScraperMetricBucket(simulatorResult.data || []),
      pokeratlas: buildScraperMetricBucket(pokeratlasResult.data || []),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('Scraper metrics error:', err);
    return res.status(500).json({ error: 'Metrics unavailable' });
  }
}
