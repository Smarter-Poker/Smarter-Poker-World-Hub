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
 *   Layer 3: Evidence priority; current observed data wins over current
 *            modeled data, and stale counts yield to current evidence
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
import {
  normalizeForMatch,
  normalizeVenueName,
  resolveVenueName,
} from '../../../src/lib/poker-near-me/venueMatching';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  PNM_TRUTH_CONTRACT_VERSION,
  activityRowBasis,
  activityRowWins,
  isCurrentActivityRow,
  latestActivityRowsByVenueAndBasis,
} from '../../../src/lib/poker-near-me/dataTruth';

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
const MAX_PAGES = 50; // 50,000-row safety ceiling

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
      const listNow = Date.now();
      const listCutoffIso = new Date(listNow - MAX_AGE_MS).toISOString();
      const { rows, error, truncated } = await fetchAllPages(() => supabase
        .from('venue_live_tables')
        .select('id, bravo_slug, venue_name, scrape_timestamp, scrape_batch_id, source, data_quality, observation_kind')
        .gte('scrape_timestamp', listCutoffIso)
        .lte('scrape_timestamp', new Date(listNow).toISOString())
        .order('venue_name')
        .order('id', { ascending: true }));

      if (error) {
        console.warn('Live tables list error:', error);
        return res.status(500).json({ error: 'Database query failed' });
      }
      if (truncated) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(503).json({
          error: 'Live table directory exceeded the safe query window',
          venues: [],
          truncated: true,
        });
      }

      // Summarize every retained basis for a venue. A stale observation must
      // not make a fresh modeled row look live, and it must not hide catalog
      // identity in the search list.
      const bySlug = new Map();
      for (const row of rows) {
        if (!row.bravo_slug) continue;
        const basis = activityRowBasis(row);
        if (basis === 'unqualified') continue;
        const isCurrent = isCurrentActivityRow(row, {
          now: listNow,
          maxCurrentAgeMs: STALE_THRESHOLD_MS,
        });
        const existing = bySlug.get(row.bravo_slug);
        if (!existing) {
          bySlug.set(row.bravo_slug, {
            slug: row.bravo_slug,
            name: resolveVenueName(cleanVenueName(row.venue_name)),
            _hasCurrentObserved: basis === 'observed' && isCurrent,
            _hasCurrentEstimated: basis === 'estimated' && isCurrent,
            _hasCatalog: basis === 'catalog',
            _hasRetainedActivity: basis === 'observed' || basis === 'estimated',
          });
        } else {
          if (basis === 'observed' && isCurrent) existing._hasCurrentObserved = true;
          if (basis === 'estimated' && isCurrent) existing._hasCurrentEstimated = true;
          if (basis === 'catalog') existing._hasCatalog = true;
          if (basis === 'observed' || basis === 'estimated') existing._hasRetainedActivity = true;
        }
      }
      const venues = Array.from(bySlug.values()).map((item) => {
        const dataMode = item._hasCurrentObserved
          ? (item._hasCurrentEstimated ? 'mixed' : 'live')
          : item._hasCurrentEstimated
            ? 'estimated'
            : item._hasCatalog
              ? 'catalog'
              : 'none';
        return {
          slug: item.slug,
          name: item.name,
          data_mode: dataMode,
          is_simulated: dataMode === 'estimated',
          has_simulated_data: item._hasCurrentEstimated,
          has_catalog_data: item._hasCatalog,
          live_count_known: item._hasCurrentObserved || item._hasCurrentEstimated,
          is_stale: item._hasRetainedActivity
            && !item._hasCurrentObserved
            && !item._hasCurrentEstimated,
        };
      });

      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ venues, truncated, rows_scanned: rows.length });
    }

    // Mode 2: Get live games for specific venue(s)
    // Push the 24h retention window into the query so the page ceiling is spent
    // on rows we will actually keep (previously the newest 1000 rows won and
    // whole regions silently vanished).
    const responseNow = Date.now();
    const cutoffIso = new Date(responseNow - MAX_AGE_MS).toISOString();
    const responseNowIso = new Date(responseNow).toISOString();
    const buildQuery = () => {
      let q = supabase
        .from('venue_live_tables')
        .select('*')
        .gte('scrape_timestamp', cutoffIso)
        .lte('scrape_timestamp', responseNowIso)
        .order('scrape_timestamp', { ascending: false })
        .order('id', { ascending: false });

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
    if (truncated) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({
        error: 'Live table activity exceeded the safe query window',
        metadata: { truncated: true, contract_version: PNM_TRUTH_CONTRACT_VERSION },
        venues: [],
      });
    }

    // ══════════════════════════════════════════════════════════
    // LAYER 1: VENUE- AND PROVENANCE-AWARE BATCH FILTERING
    // When a scrape cycle partially fails, some venues don't receive
    // new batch records. Grouping strictly by global `source` drops them.
    // Instead, find the latest batch_id per venue and provenance class.
    // ═══════════════════════════════════════════════════════════
    // Keep the newest observed and modeled batch independently for each venue.
    // A newer estimate must never suppress an older valid observation.
    let dedupedRows = 0;
    const batchFiltered = latestActivityRowsByVenueAndBasis(data || []);
    const batchFilteredRows = Math.max(0, (data || []).length - batchFiltered.length);

    // ═══════════════════════════════════════════════════════════
    // LAYER 2: CROSS-SOURCE ALIAS MERGE
    // Build a canonical slug resolver so "Bellagio" (Bravo) and 
    // "Bellagio Hotel & Casino" (PokerAtlas) merge into one venue.
    // Uses the alias registry from venue-dedup.js + normalized matching.
    // ═══════════════════════════════════════════════════════════
    
    // First pass: build index of Bravo slugs by normalized venue name
    const bravoSlugsByIdentity = {};  // normalized identity → unique bravo_slug
    const indexBravoIdentity = (identity, slug) => {
      if (!identity || !slug) return;
      if (!Object.prototype.hasOwnProperty.call(bravoSlugsByIdentity, identity)) {
        bravoSlugsByIdentity[identity] = slug;
      } else if (bravoSlugsByIdentity[identity] !== slug) {
        // Never guess when two distinct Bravo rooms collapse to one generic
        // identity key. Keeping the PA slug is safer than merging live counts
        // into the wrong venue.
        bravoSlugsByIdentity[identity] = null;
      }
    };
    for (const row of batchFiltered) {
      if ((row.source || 'bravo') === 'bravo') {
        const normName = normalizeForMatch(cleanVenueName(row.venue_name));
        if (normName) indexBravoIdentity(`exact:${normName}`, row.bravo_slug);
        // Also index by alias-resolved canonical name
        const canonical = resolveVenueName(cleanVenueName(row.venue_name));
        const normCanonical = normalizeForMatch(canonical);
        if (normCanonical) indexBravoIdentity(`exact:${normCanonical}`, row.bravo_slug);
        const coreCanonical = normalizeVenueName(canonical);
        if (coreCanonical) indexBravoIdentity(`core:${coreCanonical}`, row.bravo_slug);
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
      const coreCanonical = normalizeVenueName(canonical);

      // Check if any uniquely identified Bravo venue matches this PA venue.
      // Exact aliases are preferred; generic core matches are a final fallback.
      const identities = [
        normCanonical ? `exact:${normCanonical}` : null,
        normName ? `exact:${normName}` : null,
        coreCanonical ? `core:${coreCanonical}` : null,
      ].filter(Boolean);
      for (const identity of identities) {
        if (bravoSlugsByIdentity[identity]) return bravoSlugsByIdentity[identity];
      }
      
      // No Bravo match — keep original PA slug
      return slug;
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER 3 & 4: GROUP + DEDUP + EVIDENCE PRIORITY
    // Group by resolved slug, dedup games by name.
    // Observed evidence wins over a model, and a model wins over a catalog
    // listing for the same game. Catalog games remain visible when neither
    // count-bearing source covers them.
    // ═══════════════════════════════════════════════════════════
    const grouped = {};
    let crossSourceMerges = 0;
    
    for (const row of batchFiltered) {
      // Skip rows with no game name — these crash .toUpperCase() in the frontend
      if (!row.game_name || typeof row.game_name !== 'string' || !row.game_name.trim()) continue;
      const resolvedSlug = resolveSlug(row);
      const gameName = row.game_name.trim();
      const src = row.source || 'bravo';
      const basis = activityRowBasis(row);
      const isSim = basis === 'estimated';
      const isCatalog = basis === 'catalog';
      // Only genuinely scraped Bravo rows carry real-time authority.
      const isRealBravo = basis === 'observed';

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
          _hasLiveIndicators: false, // true if any game has waitlist or is real scraped bravo
          _hasSimulatedData: false,
          _hasRealData: false,
          _sources: new Set([src]),
        };
      }

      const venueData = grouped[resolvedSlug];
      venueData._sources.add(src);
      const rowStamp = new Date(row.scrape_timestamp).getTime();
      const currentStamp = new Date(venueData.last_updated).getTime();
      if (Number.isFinite(rowStamp) && (!Number.isFinite(currentStamp) || rowStamp > currentStamp)) {
        venueData.last_updated = row.scrape_timestamp;
      }
      if (isRealBravo) {
        venueData.venue_name = resolveVenueName(cleanVenueName(row.venue_name));
      }

      // Dedup within the normalized game only. An observation replaces an
      // estimate for that game, while estimates for other games remain valid
      // supplements. The input is newest-first, so equal-basis duplicates keep
      // the newest row.
      const gameKey = gameName.toLowerCase().replace(/\s+/g, ' ').trim();
      const existingIndex = venueData.games.findIndex((game) => game._gameKey === gameKey);
      const existing = existingIndex >= 0 ? venueData.games[existingIndex] : null;
      const gameEntry = {
          _gameKey: gameKey,
          game: gameName,  // use sanitized variable, never raw row.game_name
          // A PokerAtlas catalog row is game identity, not a zero-table
          // observation. Keep the count unknown all the way to the client.
          tables_running: isCatalog ? null : Math.max(0, Number(row.tables_running) || 0),
          players_waiting: isCatalog ? null : Math.max(0, Number(row.players_waiting) || 0),
          source: src,
          buyin: row.buyin_range || null,
          runs: row.runs_schedule || null,
          // PROVENANCE: simulator rows are modelled, not observed. The row's own
          // data_quality says 'scraped_verified' — do not repeat that claim.
          is_simulated: isSim,
          observation_kind: basis,
          data_quality: isSim
            ? 'modeled_estimate'
            : isCatalog
              ? (row.data_quality || 'catalog_verified')
              : (row.data_quality || null),
          live_count_known: !isCatalog,
          scraped_at: row.scrape_timestamp || null,
          age_minutes: Number.isFinite(rowStamp) ? Math.round((responseNow - rowStamp) / 60000) : null,
      };
      if (existing && !activityRowWins(existing, gameEntry, {
        now: responseNow,
        maxCurrentAgeMs: STALE_THRESHOLD_MS,
      })) {
        dedupedRows++;
        continue;
      }
      if (existingIndex >= 0) {
        venueData.games[existingIndex] = gameEntry;
        dedupedRows++;
      } else {
        venueData.games.push(gameEntry);
      }
    }

    // Separate count-bearing activity from catalog identity. Catalog rows can
    // carry game names and schedules, but never a current table/waiting count.
    const venuesWithMeta = Object.values(grouped || {});
    const now = responseNow;

    // STALENESS: emit a per-venue signal the frontend can actually key off.
    // Previously STALE_THRESHOLD_MS was computed and never used, so a 20-hour-old
    // row rendered identically to a 2-minute-old one.
    let newestStamp = null;
    let oldestStamp = null;
    let newestCatalogStamp = null;
    for (const vd of venuesWithMeta) {
      vd.games = vd.games.map(({ _gameKey, ...game }) => game);
      const activityGames = vd.games.filter((game) => game.observation_kind !== 'catalog');
      const activityStamps = activityGames
        .map(g => new Date(g.scraped_at).getTime())
        .filter(t => Number.isFinite(t) && now - t >= 0);
      const catalogStamps = vd.games
        .filter((game) => game.observation_kind === 'catalog')
        .map(g => new Date(g.scraped_at).getTime())
        .filter(t => Number.isFinite(t) && now - t >= 0);
      const venueActivityNewest = activityStamps.length ? Math.max(...activityStamps) : null;
      const venueCatalogNewest = catalogStamps.length ? Math.max(...catalogStamps) : null;
      vd.last_activity_updated = venueActivityNewest === null
        ? null
        : new Date(venueActivityNewest).toISOString();
      vd.last_catalog_updated = venueCatalogNewest === null
        ? null
        : new Date(venueCatalogNewest).toISOString();
      if (venueActivityNewest !== null) {
        vd.age_minutes = Math.round((now - venueActivityNewest) / 60000);
        if (newestStamp === null || venueActivityNewest > newestStamp) newestStamp = venueActivityNewest;
        if (oldestStamp === null || venueActivityNewest < oldestStamp) oldestStamp = venueActivityNewest;
      } else {
        vd.age_minutes = null;
      }
      if (venueCatalogNewest !== null) {
        vd.catalog_age_minutes = Math.round((now - venueCatalogNewest) / 60000);
        if (newestCatalogStamp === null || venueCatalogNewest > newestCatalogStamp) {
          newestCatalogStamp = venueCatalogNewest;
        }
      } else {
        vd.catalog_age_minutes = null;
      }

      // Freshness is a per-game claim, not a venue-wide claim. If one modeled
      // game was just refreshed, a different four-hour-old observed game must
      // remain diagnostic-only instead of leaking into the published total.
      const lastKnownSimulated = activityGames.reduce((sum, game) => (
        sum + (game.observation_kind === 'estimated' ? (game.tables_running || 0) : 0)
      ), 0);
      const lastKnownObserved = activityGames.reduce((sum, game) => (
        sum + (game.observation_kind === 'observed' ? (game.tables_running || 0) : 0)
      ), 0);
      vd.games = vd.games.map((game) => {
        if (game.observation_kind === 'catalog') return game;
        if (isCurrentActivityRow(game, {
          now,
          maxCurrentAgeMs: STALE_THRESHOLD_MS,
        })) return game;
        return {
          ...game,
          last_known_tables_running: game.tables_running || 0,
          last_known_players_waiting: game.players_waiting || 0,
          tables_running: 0,
          players_waiting: 0,
          live_count_known: false,
          is_stale: true,
        };
      });
      const currentActivityGames = vd.games.filter((game) => (
        game.observation_kind !== 'catalog'
        && game.live_count_known !== false
        && game.is_stale !== true
      ));
      vd._hasSimulatedData = currentActivityGames.some((game) => game.observation_kind === 'estimated');
      vd._hasRealData = currentActivityGames.some((game) => game.observation_kind === 'observed');
      vd._hasCatalogData = vd.games.some((game) => game.observation_kind === 'catalog');
      vd._hasLiveIndicators = vd._hasRealData;
      vd.is_stale = activityGames.length > 0 && currentActivityGames.length === 0;
      vd.is_simulated = vd._hasSimulatedData && !vd._hasRealData;
      vd.has_simulated_data = vd._hasSimulatedData;
      vd.has_catalog_data = vd._hasCatalogData;
      vd.has_stale_activity = activityGames.length > currentActivityGames.length;

      // Per-venue provenance split, pre-summed.
      // Consumers were doing `v.games.reduce((s, g) => s + (g.tables_running || 0), 0)`
      // with no is_simulated check and rendering the result as "LIVE NOW: N Tables".
      // Publishing the split (and a per-venue data_mode mirroring the top-level
      // one) means a consumer no longer has to reconstruct provenance from the
      // per-game flags to label the number honestly.
      const vSim = currentActivityGames.reduce((s, g) => (
        s + (g.observation_kind === 'estimated' ? (g.tables_running || 0) : 0)
      ), 0);
      const vReal = currentActivityGames.reduce((s, g) => (
        s + (g.observation_kind === 'observed' ? (g.tables_running || 0) : 0)
      ), 0);
      vd.tables_running_last_known = activityGames.length > 0
        ? lastKnownObserved + lastKnownSimulated
        : null;
      vd.live_count_known = currentActivityGames.length > 0;
      vd.tables_running_observed = vReal;
      vd.tables_running_simulated = vSim;
      vd.tables_running_total = vd.live_count_known ? vReal + vSim : null;
      vd.data_mode = !vd.live_count_known
        ? (vd._hasCatalogData ? 'catalog' : 'none')
        : vd._hasRealData
          ? (vd._hasSimulatedData ? 'mixed' : 'live')
          : vd._hasSimulatedData
            ? 'estimated'
            : 'none';
      // Do not let a fresh catalog refresh masquerade as the timestamp of an
      // older observed/modelled count. The compatibility field follows the
      // evidence mode currently being presented.
      vd.last_updated = vd.data_mode === 'catalog'
        ? vd.last_catalog_updated
        : (vd.last_activity_updated || vd.last_catalog_updated);
    }

    const venues = venuesWithMeta.map(({
      _hasLiveIndicators,
      _hasSimulatedData,
      _hasRealData,
      _hasCatalogData,
      _sources,
      ...v
    }) => v);

    // Count observed and modeled activity independently. Catalog rows are
    // counted only as listed venues/games because their live table count is
    // unknown by definition.
    let totalLiveTables = 0;
    let totalSimulatedTables = 0;
    let simulatedVenueCount = 0;
    let staleVenueCount = 0;
    let catalogVenueCount = 0;
    let catalogGameCount = 0;
    let venuesWithObservedEvidence = 0;
    let venuesWithEstimatedEvidence = 0;
    for (const vd of venuesWithMeta) {
      const catalogGames = vd.games.filter((game) => game.observation_kind === 'catalog');
      if (catalogGames.length > 0) {
        catalogVenueCount++;
        catalogGameCount += catalogGames.length;
      }
      if (vd.is_stale) {
        staleVenueCount++;
        continue;
      }
      const currentGames = vd.games.filter((game) => (
        game.live_count_known !== false && game.is_stale !== true
      ));
      const simGames = currentGames.filter((game) => game.observation_kind === 'estimated');
      const realGames = currentGames.filter((game) => game.observation_kind === 'observed');
      const simTables = simGames.reduce((s, g) => s + (g.tables_running || 0), 0);
      const realTables = realGames.reduce((s, g) => s + (g.tables_running || 0), 0);
      totalSimulatedTables += simTables;
      totalLiveTables += realTables;
      if (simGames.length > 0) {
        simulatedVenueCount++;
        venuesWithEstimatedEvidence++;
      }
      if (realGames.length > 0) venuesWithObservedEvidence++;
    }

    const dataIsLive = venuesWithObservedEvidence > 0;

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLISHING POLICY (owner decision, 2026-08-01)
    // The Bravo live scraper is intentionally not being run. "Cash Games
    // Running" is published from bravo-simulator-daemon.py, which models each
    // venue's per-game, per-hour, per-weekday activity from qualified saved
    // observations in game_live_history.
    //
    // So a modelled table is a publishable number, not something to hide — but
    // it must never be dressed up as an observation. The split is:
    //   total_tables_live      - observed by a real scrape (0 while Bravo is off)
    //   total_tables_simulated - modelled from historical observation
    //   total_tables_running   - what the UI shows: live when we have it,
    //                            otherwise the modelled estimate
    //   data_mode              - 'live' | 'mixed' | 'estimated' | 'none'
    //   data_is_live           - stays strictly honest (true only for observed)
    //
    // Counting only live here is what made the page read 0 tables while the
    // list underneath it was full of games.
    // ─────────────────────────────────────────────────────────────────────────
    const liveWaiting = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => (
        s + (g.observation_kind === 'observed'
          && g.live_count_known !== false
          && g.is_stale !== true ? (g.players_waiting || 0) : 0)
      ), 0), 0
    );
    const simulatedWaiting = venues.reduce(
      (sum, v) => sum + v.games.reduce((s, g) => (
        s + (g.observation_kind === 'estimated'
          && g.live_count_known !== false
          && g.is_stale !== true ? (g.players_waiting || 0) : 0)
      ), 0), 0
    );

    const dataMode = venuesWithObservedEvidence > 0
      ? (venuesWithEstimatedEvidence > 0 ? 'mixed' : 'live')
      : (venuesWithEstimatedEvidence > 0
        ? 'estimated'
        : catalogVenueCount > 0
          ? 'catalog'
          : 'none');

    // Live wins when present; otherwise publish the modelled estimate.
    const totalTablesPublished = dataMode === 'catalog'
      ? null
      : totalLiveTables > 0
        ? totalLiveTables + totalSimulatedTables
        : totalSimulatedTables;
    const totalPlayersWaiting = dataMode === 'catalog'
      ? null
      : totalLiveTables > 0
        ? liveWaiting + simulatedWaiting
        : simulatedWaiting;

    const dataAgeMinutes = newestStamp === null ? null : Math.round((now - newestStamp) / 60000);
    const oldestDataAgeMinutes = oldestStamp === null ? null : Math.round((now - oldestStamp) / 60000);
    const venuesWithCurrentActivity = venuesWithMeta.filter((venueData) => (
      !venueData.is_stale && venueData.tables_running_total > 0
    ));
    const observedVenueCount = venuesWithCurrentActivity.filter((venueData) => (
      venueData.tables_running_observed > 0
    )).length;
    const estimatedVenueCount = venuesWithCurrentActivity.filter((venueData) => (
      venueData.tables_running_simulated > 0
    )).length;

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.status(200).json({
      metadata: {
        contract_version: PNM_TRUTH_CONTRACT_VERSION,
        venues_with_live_data: observedVenueCount,
        venues_with_activity_rows: venues.length,
        venues_with_current_activity: venuesWithCurrentActivity.length,
        venues_with_estimated_activity: estimatedVenueCount,
        venues_with_observed_evidence: venuesWithObservedEvidence,
        venues_with_estimated_evidence: venuesWithEstimatedEvidence,
        catalog_venue_count: catalogVenueCount,
        catalog_game_count: catalogGameCount,
        catalog_live_counts_known: false,
        live_count_known: venuesWithObservedEvidence > 0 || venuesWithEstimatedEvidence > 0,
        // What the UI displays. Live when observed, otherwise the modelled
        // estimate. Never back-filled with catalog capacity. Read data_mode
        // (and per-game is_simulated) to label it correctly.
        total_tables_running: totalTablesPublished,
        // The honest split behind that single number.
        total_tables_live: totalLiveTables,
        // Catalog rows have no current table count. Null is intentional and
        // must not be normalized to zero by clients.
        total_tables_catalog: null,
        total_tables_simulated: totalSimulatedTables,
        total_players_waiting: totalPlayersWaiting,
        total_players_waiting_live: liveWaiting,
        total_players_waiting_simulated: simulatedWaiting,
        // 'live' | 'mixed' | 'estimated' | 'catalog' | 'none'
        data_mode: dataMode,
        estimated: dataMode === 'estimated',
        // Promoted out of dedup_stats: this qualifies the number above it.
        // Strictly observation-only — an estimate never sets this true.
        data_is_live: dataIsLive,
        simulated_venue_count: simulatedVenueCount,
        stale_venue_count: staleVenueCount,
        data_age_minutes: dataAgeMinutes,
        oldest_data_age_minutes: oldestDataAgeMinutes,
        stale: dataAgeMinutes === null
          ? catalogVenueCount === 0
          : (now - newestStamp) > STALE_THRESHOLD_MS,
        stale_threshold_hours: STALE_THRESHOLD_MS / 3600000,
        truncated,
        data_source: 'Smarter.Poker Intelligence',
        // Slowest feed in the pipeline: bravo-live-daemon SCRAPE_INTERVAL=1800s.
        // (pokeratlas-live-daemon runs at 900s.) Was wrongly advertised as 15 minutes.
        refresh_interval: '30 minutes',
        // Derived from the actual newest row, not a hardcoded freshness promise.
        last_scrape: newestStamp === null ? null : new Date(newestStamp).toISOString(),
        last_catalog_scrape: newestCatalogStamp === null ? null : new Date(newestCatalogStamp).toISOString(),
        dedup_stats: {
          raw_rows: (data || []).length,
          batch_filtered: batchFilteredRows,
          cross_source_merges: crossSourceMerges,
          duplicate_rows_removed: dedupedRows,
          final_venues: venues.length,
          live_tables: totalLiveTables,
          published_tables: totalTablesPublished,
          data_mode: dataMode,
          catalog_estimate_tables: null,
          catalog_venues: catalogVenueCount,
          catalog_games: catalogGameCount,
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
