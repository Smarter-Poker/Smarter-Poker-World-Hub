/**
 * API: /api/poker/game-trends
 * Analyzes game type trends from venue_live_tables data.
 * Compares current snapshot against a cached previous snapshot
 * stored in scraper_watchdog_state to show real trend arrows.
 *
 * COUNTING: trends sum tables_running, not rows. One row describing a game with
 * 9 tables is 9 tables, and a duplicate row is not an extra table.
 *
 * FRESHNESS: only the latest scrape_batch_id per source, within the retention
 * window, is counted. Simulator rows (scrape_batch_id LIKE 'sim-%') are modelled,
 * not observed, and are excluded — otherwise a dead scraper renders as a
 * perfectly flat, "stable" market.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { gameShortLabel } from '../../../src/components/poker-near-me/normalize-game';
import { reportApiError } from '../../../src/lib/sentryWrap';

const MAX_AGE_MS = 24 * 60 * 60 * 1000;        // retention window
const FRESH_WINDOW_MS = 30 * 60 * 1000;        // slowest daemon cadence (bravo, 1800s)
const SNAPSHOT_INTERVAL_MIN = 30;

// Supabase caps a query at 1000 rows regardless of .limit(); page with .range().
const PAGE_SIZE = 1000;
const MAX_PAGES = 12;

async function fetchAllPages(buildQuery) {
  let rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await buildQuery().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return { rows, error, truncated: false };
    if (!data || data.length === 0) return { rows, error: null, truncated: false };
    rows = rows.concat(data);
    if (data.length < PAGE_SIZE) return { rows, error: null, truncated: false };
  }
  console.warn(`game-trends: hit the ${MAX_PAGES * PAGE_SIZE}-row page ceiling — trends are partial`);
  return { rows, error: null, truncated: true };
}

function isSimulatedRow(row) {
  return typeof row?.scrape_batch_id === 'string' && row.scrape_batch_id.startsWith('sim-');
}

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
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const supabase = getSupabase();
    
    // Get current snapshot (latest batch per source, within the retention window)
    const cutoffIso = new Date(Date.now() - MAX_AGE_MS).toISOString();
    const { rows: currentData, error: currentErr, truncated } = await fetchAllPages(() => supabase
      .from('venue_live_tables')
      .select('game_name, source, tables_running, bravo_slug, scrape_batch_id, scrape_timestamp')
      .gte('scrape_timestamp', cutoffIso)
      .order('scrape_timestamp', { ascending: false }));

    if (currentErr) {
      console.warn('Game trends: live tables query failed:', currentErr.message);
      try { reportApiError(new Error(`game-trends live tables query failed: ${currentErr.message}`), req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({
        success: false,
        degraded: true,
        error: 'Live tables query failed',
        trends: [],
        total_tables_now: 0,
        total_games_now: 0,
        has_historical_data: false,
        has_fresh_data: false,
        analyzed_at: new Date().toISOString(),
      });
    }

    // Keep only the latest batch per source and drop simulator rows.
    const latestBatchBySource = {};   // source -> { batch_id, ts }
    let newestStamp = null;
    for (const row of currentData) {
      if (isSimulatedRow(row)) continue;
      const src = row.source || 'bravo';
      const ts = new Date(row.scrape_timestamp).getTime();
      if (!Number.isFinite(ts)) continue;
      if (newestStamp === null || ts > newestStamp) newestStamp = ts;
      if (!latestBatchBySource[src] || ts > latestBatchBySource[src].ts) {
        latestBatchBySource[src] = { batch_id: row.scrape_batch_id, ts };
      }
    }

    let simulatedRowsExcluded = 0;
    let staleRowsExcluded = 0;
    const seenGameRows = new Set();   // dedup key: source|slug|game
    const currentCounts = {};         // game -> tables (summed, not row count)
    let totalTablesNow = 0;
    for (const row of currentData) {
      if (isSimulatedRow(row)) { simulatedRowsExcluded++; continue; }
      const src = row.source || 'bravo';
      const latest = latestBatchBySource[src];
      if (latest && row.scrape_batch_id && row.scrape_batch_id !== latest.batch_id) {
        staleRowsExcluded++;
        continue;
      }
      if (!row.game_name) continue;
      const dedupKey = `${src}|${row.bravo_slug || ''}|${row.game_name}`;
      if (seenGameRows.has(dedupKey)) continue;
      seenGameRows.add(dedupKey);

      const game = gameShortLabel(row.game_name || 'Unknown');
      const tables = Number(row.tables_running) || 0;
      currentCounts[game] = (currentCounts[game] || 0) + tables;
      totalTablesNow += tables;
    }

    // Is the pipeline actually alive? A dead scraper reporting "stable" for every
    // game is indistinguishable from a flat market without this flag.
    const dataAgeMinutes = newestStamp === null ? null : Math.round((Date.now() - newestStamp) / 60000);
    const hasFreshData = newestStamp !== null && (Date.now() - newestStamp) <= FRESH_WINDOW_MS;

    // --- HISTORICAL COMPARISON ---
    // Load previous snapshot from scraper_watchdog_state
    let previousCounts = {};
    let prevSnapshotData = null;
    let hasHistoricalData = false;
    try {
      const { data: prevSnap } = await supabase
        .from('scraper_watchdog_state')
        .select('value')
        .eq('key', 'game_trends_snapshot')
        .maybeSingle();
      if (prevSnap?.value) {
        prevSnapshotData = JSON.parse(prevSnap.value);
        // Snapshots written before the row-count -> tables-summed fix have
        // incomparable units. Ignore them rather than publishing a bogus delta;
        // the next capture writes a unit-tagged snapshot.
        previousCounts = prevSnapshotData.unit === 'tables' ? (prevSnapshotData.counts || {}) : {};

        // We consider it "historical" if we have prior counts AND they aren't from just right now.
        // To avoid locking in 'stable' if the system just started, we require a minimum data payload.
        const currentTotal = Object.keys(currentCounts || {}).length;
        const prevTotal = Object.keys(previousCounts || {}).length;
        hasHistoricalData = prevTotal > 0 && currentTotal > 0 && prevTotal >= Math.min(5, currentTotal / 2);
      }
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

    // ── Snapshot capture ────────────────────────────────────────────────
    // This endpoint is a cacheable public GET, so the baseline must not be
    // advanced by an unconditional read-then-write: two concurrent serverless
    // instances both saw age>=30m and both saved, collapsing 'previous' onto
    // 'current' so every trend reported 'stable'.
    //
    // The write is now a CONDITIONAL UPDATE whose predicate (updated_at older
    // than the interval) is evaluated by Postgres under row lock, so exactly one
    // concurrent request can win. It is also skipped entirely when the data is
    // stale or empty — a dead scraper must not overwrite a good baseline.
    let snapshotSaved = false;
    if (hasFreshData && Object.keys(currentCounts).length > 0) {
      const nowIso = new Date().toISOString();
      const staleBefore = new Date(Date.now() - SNAPSHOT_INTERVAL_MIN * 60 * 1000).toISOString();
      const snapshotValue = JSON.stringify({ counts: currentCounts, unit: 'tables', saved_at: nowIso });
      try {
        const { data: updated, error: updErr } = await supabase
          .from('scraper_watchdog_state')
          .update({ value: snapshotValue, updated_at: nowIso })
          .eq('key', 'game_trends_snapshot')
          .lt('updated_at', staleBefore)
          .select('key');
        if (updErr) {
          console.warn('[Supabase] game_trends_snapshot conditional update failed:', updErr.message);
        } else if (updated && updated.length > 0) {
          snapshotSaved = true;
        } else if (!prevSnapshotData) {
          // No baseline row exists yet — create it once.
          const { error: insErr } = await supabase
            .from('scraper_watchdog_state')
            .upsert({ key: 'game_trends_snapshot', value: snapshotValue, updated_at: nowIso }, { onConflict: 'key' });
          if (insErr) {
            console.warn('[Supabase] game_trends_snapshot seed insert failed:', insErr.message);
          } else {
            snapshotSaved = true;
          }
        }
      } catch (snapErr) { console.warn('[App] Handled exception:', snapErr?.message || snapErr); }
    }

    // Build trend analysis
    const allGames = new Set([...Object.keys(currentCounts || {}), ...Object.keys(previousCounts || {})]);
    const trends = [];
    
    allGames.forEach(game => {
      const current = currentCounts[game] || 0;
      const previous = previousCounts[game] || 0;
      const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
      
      trends.push({
        game,
        current_tables: current,
        previous_tables: previous,
        change_pct: change,
        trend: previous === 0 ? (hasHistoricalData ? 'new' : 'stable') : (change > 10 ? 'up' : (change < -10 ? 'down' : 'stable')),
      });
    });

    // Sort by current table count descending
    trends.sort((a, b) => b.current_tables - a.current_tables);

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      trends: trends.slice(0, 20),
      // Tables actually running (summed tables_running), and distinct game types.
      total_tables_now: totalTablesNow,
      total_games_now: Object.keys(currentCounts).length,
      has_historical_data: hasHistoricalData,
      has_fresh_data: hasFreshData,
      data_age_minutes: dataAgeMinutes,
      truncated,
      excluded: {
        simulated_rows: simulatedRowsExcluded,
        stale_batch_rows: staleRowsExcluded,
      },
      snapshot_saved: snapshotSaved,
      analyzed_at: new Date().toISOString(),
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Game trends error:', err);
    res.status(500).json({ error: err.message });
  }
}
