// @ts-nocheck
import { getMlbSupabase } from '../../../utils/supabase/mlb';
import { wrapEdgeHandler } from '../../../src/lib/wrapEdgeHandler';

async function edgeHandler(req: Request) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const queryDays = url.searchParams.get('days');
    const days = queryDays ? parseInt(queryDays as string, 10) : null;
    const mlbDb = getMlbSupabase();

    let cutoffDate: string | null = null;
    if (days && !isNaN(days)) {
      cutoffDate = new Date(Date.now() - days * 86400000).toISOString();
    }

    const { data: statsRaw, error } = await mlbDb.rpc('get_mlb_validation_stats', {
      cutoff: cutoffDate,
    } as any);
    const stats = statsRaw as any;

    if (error) {
      console.error('RPC get_mlb_validation_stats failed:', error.message);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!stats || !stats.all || stats.all.count === 0) {
      return new Response(JSON.stringify({ stats: null }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        },
      });
    }

    if (days && !isNaN(days)) {
      stats.activeDays = days;
    } else {
      stats.activeDays = null;
    }

    // CLV digest (2026-07-05): weekly closing-line-value per market and per book from
    // clv_weekly (written nightly by the engine's clv_report stage; 'book:'-prefixed
    // rows are the per-book split). Additive — a failure here never blocks the page.
    try {
      const { data: clvRows } = await mlbDb
        .from('clv_weekly')
        .select('week_start, market, n, avg_clv_pts, avg_clv_cents, beat_close_pct')
        .order('week_start', { ascending: false })
        .limit(200);
      if (clvRows && clvRows.length > 0) {
        const markets = clvRows.filter((r: any) => !String(r.market).startsWith('book:'));
        const books = clvRows
          .filter((r: any) => String(r.market).startsWith('book:'))
          .map((r: any) => ({ ...r, book: String(r.market).slice(5) }));
        stats.clv = { markets, books };
      }
    } catch (clvErr: any) {
      console.warn('[MLB validation] clv_weekly fetch skipped:', clvErr?.message);
    }

    return new Response(JSON.stringify({ stats }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch (err: any) {
    console.error('Error fetching validation stats:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export default wrapEdgeHandler(edgeHandler);
