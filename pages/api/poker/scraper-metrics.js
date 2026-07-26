/**
 * API: /api/poker/scraper-metrics
 * Returns recent cycle performance metrics from scraper_metrics table.
 * Used by the ScraperHealthDashboard to show performance trends.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

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

  try {
    const supabase = getSupabase();
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('scraper_metrics')
      .select('*')
      .gte('cycle_start', since)
      .order('cycle_start', { ascending: true })
      .limit(500);

    if (error) {
      // Table may not exist yet
      console.warn('scraper_metrics query failed:', error.message);
      return res.status(200).json({ metrics: [], message: 'Metrics table not available yet' });
    }

    // Group by source
    const bravo = (data || []).filter(m => m.source === 'bravo');
    const pokeratlas = (data || []).filter(m => m.source === 'pokeratlas');

    // Calculate summaries
    const summarize = (rows) => {
      if (rows.length === 0) return { cycles: 0, avg_duration: 0, total_errors: 0, avg_records: 0 };
      const totalDuration = rows.reduce((s, r) => s + (r.duration_seconds || 0), 0);
      // Column is `errors` (see 20260329_scraper_infrastructure.sql) — reading
      // r.error_count always yielded undefined, so totals were permanently 0.
      const totalErrors = rows.reduce((s, r) => s + (r.errors || 0), 0);
      const totalRecords = rows.reduce((s, r) => s + (r.records_saved || 0), 0);
      return {
        cycles: rows.length,
        avg_duration: Math.round(totalDuration / rows.length),
        total_errors: totalErrors,
        avg_records: Math.round(totalRecords / rows.length),
        last_cycle: rows[rows.length - 1],
      };
    };

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({
      period_hours: hours,
      since,
      bravo: {
        summary: summarize(bravo),
        history: bravo.map(m => ({
          time: m.cycle_start,
          duration: m.duration_seconds,
          records: m.records_saved,
          venues: m.venues_scraped,
          errors: m.errors || 0,
        })),
      },
      pokeratlas: {
        summary: summarize(pokeratlas),
        history: pokeratlas.map(m => ({
          time: m.cycle_start,
          duration: m.duration_seconds,
          records: m.records_saved,
          venues: m.venues_scraped,
          errors: m.errors || 0,
        })),
      },
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Scraper metrics error:', err);
    return res.status(500).json({ error: err.message });
  }
}
