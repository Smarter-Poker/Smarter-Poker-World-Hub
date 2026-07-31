/**
 * API: /api/poker/live-tables
 * Returns live table data from Smarter.Poker Intelligence.
 * Refresh cadence is driven by the daemons: pokeratlas-live-daemon 15 min,
 * bravo-live-daemon 30 min (SCRAPE_INTERVAL=1800). The response reports the
 * ACTUAL age of the newest row rather than a hardcoded freshness promise.
 *
 * DEDUP LAYERS (v2.0 — Pipeline Remediation):
 *   Layer 1: Batch-aware — only latest scrape_batch_id per source wins
 *   Layer 2: Cross-source alias merge — Bravo "Bellagio" + PA "Bellagio Hotel & Casino" → single venue
 *   Layer 3: Bravo priority — real-time Bravo data always wins over PokerAtlas catalog estimates
 *   Layer 4: Game-name dedup — first occurrence per venue wins (ordered by timestamp desc)
 *
 * PROVENANCE: rows written by bravo-simulator-daemon.py carry
 * scrape_batch_id LIKE 'sim-%'. They are MODELLED, not scraped. They are
 * tagged is_simulated on every game, never counted as live tables, never
 * allowed to purge real PokerAtlas rows, and counted separately in metadata.
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

// POLICY: Never drop data just because the scraper is down.
// Retain rows up to 24 hours, but ALWAYS tell the client how old they are.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;          // 24 hours — last known data always shows
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000;   // 3 hours — after this, flagged is_stale

// Supabase project-level cap is 1000 rows per query; .limit(n>1000) is
// silently truncated. Paginate with .range() instead (same pattern as
// events-calendar.js / daily-tournaments.js).
const PAGE_SIZE = 1000;
const MAX_PAGES = 12; // 12,000-row ceiling

// Rows written by bravo-simulator-daemon.py use scrape_batch_id 'sim-<uuid>'.
// They are modelled estimates, NOT scraped observations.
function isSimulatedRow(row) {
    return typeof row?.scrape_batch_id === 'string' && row.scrape_batch_id.startsWith('sim-');
}

/**
 * Fetch every row for a query by paging with .range().
 * `buildQuery` must return a FRESH query builder on each call.
 * Returns { rows, error, truncated } — truncated:true means the page
 * ceiling was hit and the result set is incomplete (never silent).
 */
async function fetchAllPages(buildQuery) {
    let rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await buildQuery().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) return { rows, error, truncated: false };
        if (!data || data.length === 0) return { rows, error: null, truncated: false };
        rows = rows.concat(data);
        if (data.length < PAGE_SIZE) return { rows, error: null, truncated: false };
    }
    // Filled every page — more rows almost certainly exist beyond the ceiling.
    console.warn(`[live-tables] Result set hit the ${MAX_PAGES * PAGE_SIZE}-row page ceiling; response is TRUNCATED`);
    return { rows, error: null, truncated: true };
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
      // Apply the SAME retention window as Mode 2 so the dropdown cannot offer
      // venues whose only rows are days old (selecting one returned an empty view).
      const listCutoffIso = new Date(Date.now() - MAX_AGE_MS).toISOString();
      const { rows, error, truncated } = await fetchAllPages(() => supabase
        .from('venue_live_tables')
        .select('bravo_slug, venue_name, scrape_timestamp, scrape_batch_id')
        .gte('scrape_timestamp', listCutoffIso)
        .order('venue_name'));

      if (error) {
        console.warn('Live tables list error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }

      // Deduplicate by bravo_slug; a venue is flagged simulated only when
      // EVERY retained row for it came from the simulator.
      const bySlug = new Map();
      for (const row of rows) {
        if (!row.bravo_slug) continue;
        const sim = isSimulatedRow(row);
        const existing = bySlug.get(row.bravo_slug);
        if (!existing) {
          bySlug.set(row.bravo_slug, {
            slug: row.bravo_slug,
            name: resolveVenueName(cleanVenueName(row.venue_name)),
            is_simulated: sim,
          });
        } else if (!sim) {
          existing.is_simulated = false;
        }
      }
      const venues = Array.from(bySlug.values());

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ venues, truncated, rows_scanned: rows.length });
    }

    // Mode 2: Get live games for specific venue(s)
    // Push the 24h retention window into the query so the page ceiling is spent
    // on rows we will actually keep (previously the newest 1000 rows won and
    // whole regions silently vanished).
    const cutoffIso = new Date(Date.now() - MAX_AGE_MS).toISOString();
    const buildQuery = () => {
      let q = supabase
        .from('venue_live_tables')
        .select('*')
        .gte('scrape_timestamp', cutoffIso)
        .order('scrape_timestamp', { ascending: false });

      if (venue) {
        q = q.eq('bravo_slug', venue);
      } else if (search) {
        // Escape Postgres wildcard characters to prevent pattern injection
        const safeSearch = String(search).replace(/[%_]/g, '\\$&').slice(0, 100);
        q = q.ilike('venue_name', `%${safeSearch}%`);
      }
      return q;
    };

    const { rows: data, error, truncated } = await fetchAllPages(buildQuery);

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
      const isSim = isSimulatedRow(row);
      // Only genuinely scraped Bravo rows carry real-time authority.
      const isRealBravo = src === 'bravo' && !isSim;

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
          _hasBravoData: isRealBravo,
          _hasLiveIndicators: false, // true if any game has waitlist or is real scraped bravo
          _hasSimulatedData: false,
          _hasRealData: false,
          _sources: new Set([src]),
        };
      }

      const venueData = grouped[resolvedSlug];
      venueData._sources.add(src);

      // If this venue already has real Bravo data, prefer Bravo's venue name.
      // Simulator rows must NEVER trigger this purge — they would delete genuine
      // scraped PokerAtlas rows in favour of modelled ones.
      if (isRealBravo && !venueData._hasBravoData) {
        venueData.venue_name = resolveVenueName(cleanVenueName(row.venue_name));
        venueData._hasBravoData = true;
        // Real Bravo just arrived — purge all previous PokerAtlas catalog games
        // (PA "tables" are catalog estimates, not actual live counts)
        dedupedRows += venueData.games.length; // count purged PA rows BEFORE clearing
        venueData.games = [];
        venueData._seenGames = new Set();
      }

      // If we already have REAL Bravo data for this venue, skip PokerAtlas catalog rows
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
        const rowStamp = new Date(row.scrape_timestamp).getTime();
        venueData.games.push({
          game: gameName,  // use sanitized variable, never raw row.game_name
          tables_running: row.tables_running || 0,
          players_waiting: row.players_waiting || 0,
          source: src,
          buyin: row.buyin_range || null,
          runs: row.runs_schedule || null,
          // PROVENANCE: simulator rows are modelled, not observed. The row's own
          // data_quality says 'scraped_verified' — do not repeat that claim.
          is_simulated: isSim,
          data_quality: isSim ? 'modeled_estimate' : (row.data_quality || null),
          scraped_at: row.scrape_timestamp || null,
          age_minutes: Number.isFinite(rowStamp) ? Math.round((Date.now() - rowStamp) / 60000) : null,
        });
        if (isSim) {
          venueData._hasSimulatedData = true;
        } else {
          venueData._hasRealData = true;
        }
        // Track if this venue has real live indicators:
        // Real scraped Bravo data is real-time; PA data is only "live" if players are
        // actually waiting. Simulated rows are NEVER a live indicator.
        if (!isSim && (src === 'bravo' || (row.players_waiting && row.players_waiting > 0))) {
          venueData._hasLiveIndicators = true;
        }
      } else {
        dedupedRows++;
      }
    }

    // Separate venues with real-time live data vs catalog-only estimates
    const venuesWithMeta = Object.values(grouped || {});
    const now = Date.now();

    // STALENESS: emit a per-venue signal the frontend can actually key off.
    // Previously STALE_THRESHOLD_MS was computed and never used, so a 20-hour-old
    // row rendered identically to a 2-minute-old one.
    let newestStamp = null;
    let oldestStamp = null;
    for (const vd of venuesWithMeta) {
      const stamps = vd.games
        .map(g => new Date(g.scraped_at).getTime())
        .filter(t => Number.isFinite(t));
      const venueNewest = stamps.length ? Math.max(...stamps) : new Date(vd.last_updated).getTime();
      if (Number.isFinite(venueNewest)) {
        vd.age_minutes = Math.round((now - venueNewest) / 60000);
        vd.is_stale = (now - venueNewest) > STALE_THRESHOLD_MS;
        if (newestStamp === null || venueNewest > newestStamp) newestStamp = venueNewest;
        if (oldestStamp === null || venueNewest < oldestStamp) oldestStamp = venueNewest;
      } else {
        vd.age_minutes = null;
        vd.is_stale = true;
      }
      vd.is_simulated = vd._hasSimulatedData && !vd._hasRealData;
      vd.has_simulated_data = vd._hasSimulatedData;
    }

    const venues = venuesWithMeta.map(({ _seenGames, _latestOriginStamp, _hasBravoData, _hasLiveIndicators, _hasSimulatedData, _hasRealData, _sources, ...v }) => v);

    // LIVE tables: only count from venues with real-time indicators
    // (real scraped Bravo data OR PokerAtlas venues with actual players waiting).
    // Simulated tables are counted in their own bucket and NEVER as live.
    let totalLiveTables = 0;
    let totalCatalogTables = 0;
    let totalSimulatedTables = 0;
    let simulatedVenueCount = 0;
    let staleVenueCount = 0;
    for (const vd of venuesWithMeta) {
      if (vd.is_stale) staleVenueCount++;
      const simTables = vd.games.reduce((s, g) => s + (g.is_simulated ? (g.tables_running || 0) : 0), 0);
      const realTables = vd.games.reduce((s, g) => s + (g.is_simulated ? 0 : (g.tables_running || 0)), 0);
      totalSimulatedTables += simTables;
      if (vd._hasSimulatedData) simulatedVenueCount++;
      if (vd._hasLiveIndicators) {
        totalLiveTables += realTables;
      } else {
        totalCatalogTables += realTables;
      }
    }

    // Catalog capacity is how many tables a room HAS, not how many are dealing.
    // It is reported in its own field; total_tables_running stays at 0 when there
    // is no live data rather than publishing capacity as a live count.
    const dataIsLive = totalLiveTables > 0;
    const totalPlayersWaiting = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => s + (g.is_simulated ? 0 : (g.players_waiting || 0)), 0), 0
    );

    const dataAgeMinutes = newestStamp === null ? null : Math.round((now - newestStamp) / 60000);
    const oldestDataAgeMinutes = oldestStamp === null ? null : Math.round((now - oldestStamp) / 60000);

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      metadata: {
        venues_with_live_data: venues.length,
        // Live = observed by a real scrape. Never back-filled with catalog capacity.
        total_tables_running: totalLiveTables,
        total_tables_catalog: totalCatalogTables,
        total_tables_simulated: totalSimulatedTables,
        total_players_waiting: totalPlayersWaiting,
        // Promoted out of dedup_stats: this qualifies the number above it.
        data_is_live: dataIsLive,
        simulated_venue_count: simulatedVenueCount,
        stale_venue_count: staleVenueCount,
        data_age_minutes: dataAgeMinutes,
        oldest_data_age_minutes: oldestDataAgeMinutes,
        stale: dataAgeMinutes === null ? true : (now - newestStamp) > STALE_THRESHOLD_MS,
        stale_threshold_hours: STALE_THRESHOLD_MS / 3600000,
        truncated,
        data_source: 'Smarter.Poker Intelligence',
        // Slowest feed in the pipeline: bravo-live-daemon SCRAPE_INTERVAL=1800s.
        // (pokeratlas-live-daemon runs at 900s.) Was wrongly advertised as 15 minutes.
        refresh_interval: '30 minutes',
        // Derived from the actual newest row, not a hardcoded freshness promise.
        last_scrape: newestStamp === null ? null : new Date(newestStamp).toISOString(),
        dedup_stats: {
          raw_rows: (data || []).length,
          batch_filtered: batchFilteredRows,
          cross_source_merges: crossSourceMerges,
          duplicate_rows_removed: dedupedRows,
          final_venues: venues.length,
          live_tables: totalLiveTables,
          catalog_estimate_tables: totalCatalogTables,
          simulated_tables: totalSimulatedTables,
          data_is_live: dataIsLive,
          truncated,
          stale_threshold_hours: STALE_THRESHOLD_MS / 3600000,
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
