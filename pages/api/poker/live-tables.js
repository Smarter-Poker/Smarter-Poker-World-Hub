/**
 * API: /api/poker/live-tables
 * Returns live table data from Smarter.Poker Intelligence.
 * Data is refreshed every 15 minutes by autonomous daemons.
 *
 * DEDUP LAYERS (v2.0 — Pipeline Remediation):
 *   Layer 1: Batch-aware — only latest scrape_batch_id per source wins
 *   Layer 2: Cross-source alias merge — Bravo "Bellagio" + PA "Bellagio Hotel & Casino" → single venue
 *   Layer 3: Bravo priority — real-time Bravo data always wins over PokerAtlas catalog estimates
 *   Layer 4: Game-name dedup — first occurrence per venue wins (ordered by timestamp desc)
 *
 * Query params:
 *   ?venue=slug       — Filter by specific bravo_slug
 *   ?search=term      — Search venue names (fuzzy ilike)
 *   ?list=true        — Return venue name list only (for search dropdown)
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { resolveVenueName } from './venue-dedup';
import { reportApiError } from '../../../src/lib/sentryWrap';

// Decode HTML entities and fix pipe separators in venue names
function cleanVenueName(str) {
    if (!str || typeof str !== 'string') return str || '';
    let result = str.replace(/&amp;amp;/gi, '&amp;');
    result = result
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
    result = result.replace(/\|/g, ' ');
    result = result.replace(/\s{2,}/g, ' ').trim();
    return result;
}

// Normalize venue name for fuzzy matching (strips punctuation, lowercases)
function normalizeForMatch(name) {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/&/g, 'and')
        .replace(/'/g, '')
        .replace(/-/g, ' ')
        .replace(/[^a-z0-9 ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

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
    const safeParam = (v) => Array.isArray(v) ? v[0] : v;
    const venue = safeParam(req.query.venue);
    const search = safeParam(req.query.search);
    const list = safeParam(req.query.list);

    // Mode 1: Return searchable venue list (name + slug only)
    if (list === 'true') {
      const { data, error } = await supabase
        .from('venue_live_tables')
        .select('bravo_slug, venue_name')
        .order('venue_name')
        .limit(10000);

      if (error) {
        console.warn('Live tables list error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Deduplicate by bravo_slug
      const seen = new Set();
      const venues = [];
      for (const row of (data || [])) {
        if (!seen.has(row.bravo_slug)) {
          seen.add(row.bravo_slug);
          venues.push({ slug: row.bravo_slug, name: resolveVenueName(cleanVenueName(row.venue_name)) });
        }
      }

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ venues });
    }

    // Mode 2: Get live games for specific venue(s)
    let query = supabase
      .from('venue_live_tables')
      .select('*')
      .order('scrape_timestamp', { ascending: false });

    if (venue) {
      query = query.eq('bravo_slug', venue);
    } else if (search) {
      // Escape Postgres wildcard characters to prevent pattern injection
      const safeSearch = String(search).replace(/[%_]/g, '\\$&').slice(0, 100);
      query = query.ilike('venue_name', `%${safeSearch}%`);
    }

    const { data, error } = await query.limit(10000);

    if (error) {
      console.warn('Live tables query error:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 1: VENUE-AWARE BATCH FILTERING
    // When a scrape cycle partially fails, some venues don't receive
    // new batch records. Grouping strictly by global `source` drops them.
    // Instead, find the latest batch_id PER VENUE, and discard all
    // older rows for that venue. Also discard games older than 3 hours.
    // ═══════════════════════════════════════════════════════════
    const latestBatchByVenue = {}; // venue key → { batch_id, timestamp }
    for (const row of (data || [])) {
      const key = row.bravo_slug || normalizeForMatch(cleanVenueName(row.venue_name));
      const ts = new Date(row.scrape_timestamp).getTime();
      if (!latestBatchByVenue[key] || ts > latestBatchByVenue[key].timestamp) {
        latestBatchByVenue[key] = { batch_id: row.scrape_batch_id, timestamp: ts };
      }
    }

    // Filter: only keep rows from the latest batch per venue + not too stale
    let dedupedRows = 0;
    let batchFilteredRows = 0;
    // POLICY: Never drop data just because the scraper is down.
    // Retain rows up to 24 hours. The frontend will show a staleness indicator
    // for data older than 3 hours, but the data will ALWAYS be visible.
    const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — last known data always shows
    const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours — after this, flag as stale

    const batchFiltered = (data || []).filter(row => {
      const key = row.bravo_slug || normalizeForMatch(cleanVenueName(row.venue_name));
      const latestBatch = latestBatchByVenue[key];
      const ts = new Date(row.scrape_timestamp).getTime();
      
      // Drop zombie data older than 3 hours
      if (Date.now() - ts > MAX_AGE_MS) {
          batchFilteredRows++;
          return false;
      }

      // If we know the latest batch for this venue, only keep matching rows
      if (latestBatch && row.scrape_batch_id && row.scrape_batch_id !== latestBatch.batch_id) {
        batchFilteredRows++;
        return false;
      }
      return true;
    });

    // ═══════════════════════════════════════════════════════════
    // LAYER 2: CROSS-SOURCE ALIAS MERGE
    // Build a canonical slug resolver so "Bellagio" (Bravo) and 
    // "Bellagio Hotel & Casino" (PokerAtlas) merge into one venue.
    // Uses the alias registry from venue-dedup.js + normalized matching.
    // ═══════════════════════════════════════════════════════════
    
    // First pass: build index of Bravo slugs by normalized venue name
    const bravoSlugsByNormName = {};  // normalized_name → bravo_slug
    const bravoSlugs = new Set();
    for (const row of batchFiltered) {
      if ((row.source || 'bravo') === 'bravo') {
        bravoSlugs.add(row.bravo_slug);
        const normName = normalizeForMatch(cleanVenueName(row.venue_name));
        if (normName && !bravoSlugsByNormName[normName]) {
          bravoSlugsByNormName[normName] = row.bravo_slug;
        }
        // Also index by alias-resolved canonical name
        const canonical = resolveVenueName(cleanVenueName(row.venue_name));
        const normCanonical = normalizeForMatch(canonical);
        if (normCanonical && !bravoSlugsByNormName[normCanonical]) {
          bravoSlugsByNormName[normCanonical] = row.bravo_slug;
        }
      }
    }

    // Resolve each row's canonical slug (PA records may get remapped to a Bravo slug)
    function resolveSlug(row) {
      const slug = row.bravo_slug;
      const src = row.source || 'bravo';
      
      // Bravo records always keep their own slug
      if (src === 'bravo') return slug;
      
      // For PA records, try to find a matching Bravo venue
      const cleanName = cleanVenueName(row.venue_name);
      const canonical = resolveVenueName(cleanName);
      const normName = normalizeForMatch(cleanName);
      const normCanonical = normalizeForMatch(canonical);
      
      // Check if any Bravo venue matches this PA venue's name
      if (normCanonical && bravoSlugsByNormName[normCanonical]) {
        return bravoSlugsByNormName[normCanonical];
      }
      if (normName && bravoSlugsByNormName[normName]) {
        return bravoSlugsByNormName[normName];
      }
      
      // No Bravo match — keep original PA slug
      return slug;
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 3 & 4: GROUP + DEDUP + BRAVO PRIORITY
    // Group by resolved slug, dedup games by name.
    // Bravo data (real-time) always wins over PokerAtlas (catalog).
    // ═══════════════════════════════════════════════════════════
    const grouped = {};
    let crossSourceMerges = 0;
    
    for (const row of batchFiltered) {
      // Skip rows with no game name — these crash .toUpperCase() in the frontend
      if (!row.game_name || typeof row.game_name !== 'string' || !row.game_name.trim()) continue;
      const resolvedSlug = resolveSlug(row);
      const gameName = row.game_name.trim();
      const src = row.source || 'bravo';
      
      // Track cross-source merges for diagnostics
      if (resolvedSlug !== row.bravo_slug) {
        crossSourceMerges++;
      }
      
      if (!grouped[resolvedSlug]) {
        grouped[resolvedSlug] = {
          venue_name: resolveVenueName(cleanVenueName(row.venue_name)),
          bravo_slug: resolvedSlug,
          last_updated: row.scrape_timestamp,
          games: [],
          _latestOriginStamp: new Date(row.scrape_timestamp).getTime(),
          _seenGames: new Set(),
          _hasBravoData: src === 'bravo',
          _hasLiveIndicators: false, // true if any game has waitlist or is bravo-sourced
          _sources: new Set([src]),
        };
      }
      
      const venueData = grouped[resolvedSlug];
      venueData._sources.add(src);
      
      // If this venue already has Bravo data, prefer Bravo's venue name
      if (src === 'bravo' && !venueData._hasBravoData) {
        venueData.venue_name = resolveVenueName(cleanVenueName(row.venue_name));
        venueData._hasBravoData = true;
        // Bravo just arrived — purge all previous PokerAtlas catalog games
        // (PA "tables" are catalog estimates, not actual live counts)
        dedupedRows += venueData.games.length; // count purged PA rows BEFORE clearing
        venueData.games = [];
        venueData._seenGames = new Set();
      }
      
      // If we already have Bravo data for this venue, skip PokerAtlas catalog rows 
      // entirely — they only add noise (tables_running=0 estimates)
      if (venueData._hasBravoData && src === 'pokeratlas') {
        dedupedRows++;
        continue;
      }
      
      // Timestamp-based staleness filter (within same batch)
      const stampDiff = venueData._latestOriginStamp - new Date(row.scrape_timestamp).getTime();
      if (stampDiff > 5 * 60 * 1000) {
        dedupedRows++;
        continue;
      }
      
      // Game-name dedup: first occurrence wins (data ordered by timestamp desc)
      if (!venueData._seenGames.has(gameName)) {
        venueData._seenGames.add(gameName);
        venueData.games.push({
          game: gameName,  // use sanitized variable, never raw row.game_name
          tables_running: row.tables_running || 0,
          players_waiting: row.players_waiting || 0,
          source: src,
          buyin: row.buyin_range || null,
          runs: row.runs_schedule || null,
          data_quality: row.data_quality || null,
        });
        // Track if this venue has real live indicators:
        // Bravo data is always real-time; PA data is only "live" if players are actually waiting
        if (src === 'bravo' || (row.players_waiting && row.players_waiting > 0)) {
          venueData._hasLiveIndicators = true;
        }
      } else {
        dedupedRows++;
      }
    }

    // Separate venues with real-time live data vs catalog-only estimates
    const venuesWithMeta = Object.values(grouped || {});
    const venues = venuesWithMeta.map(({ _seenGames, _latestOriginStamp, _hasBravoData, _hasLiveIndicators, _sources, ...v }) => v);
    
    // LIVE tables: only count from venues with real-time indicators
    // (Bravo-sourced data OR PokerAtlas venues with actual players waiting)
    // This prevents catalog capacity estimates from inflating the "Live Tables" stat
    let totalLiveTables = 0;
    let totalCatalogTables = 0;
    for (const vd of venuesWithMeta) {
      const venueTables = vd.games.reduce((s, g) => s + (g.tables_running || 0), 0);
      if (vd._hasLiveIndicators) {
        totalLiveTables += venueTables;
      } else {
        totalCatalogTables += venueTables;
      }
    }
    // POLICY: Never show 0 tables. If no real-time Bravo data exists,
    // fall back to catalog estimates so venues always have table info.
    const totalTables = totalLiveTables > 0 ? totalLiveTables : totalCatalogTables;
    const dataIsLive = totalLiveTables > 0; // true = real-time Bravo, false = catalog fallback
    const totalPlayersWaiting = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => s + (g.players_waiting || 0), 0), 0
    );

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      metadata: {
        venues_with_live_data: venues.length,
        total_tables_running: totalTables,
        total_players_waiting: totalPlayersWaiting,
        data_source: 'Smarter.Poker Intelligence',
        refresh_interval: '15 minutes',
        last_scrape: data?.[0]?.scrape_timestamp || null,
        dedup_stats: {
          raw_rows: (data || []).length,
          batch_filtered: batchFilteredRows,
          cross_source_merges: crossSourceMerges,
          duplicate_rows_removed: dedupedRows,
          final_venues: venues.length,
          live_tables: totalLiveTables,
          catalog_estimate_tables: totalCatalogTables,
          data_is_live: dataIsLive,
          stale_threshold_hours: 3,
        },
      },
      venues,
    });
  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('Live tables API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
