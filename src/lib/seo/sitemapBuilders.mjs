/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  SHARED SITEMAP URL BUILDERS AND XML GENERATION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Centralized helpers used by:
 *   - /sitemap.xml (Comprehensive Index and Root Sitemap)
 *   - /sitemap-venues.xml (Dedicated Physical Poker Venues and Geo Discovery)
 *   - /sitemap-series.xml (Dedicated Poker Tournament Series and Major Tours)
 *
 * Enforces real-evidence <lastmod> semantics:
 *   - Never stamps generation time
 *   - Omits <lastmod> when source change evidence is absent
 */

import { POKER_DISCOVERY_SITEMAP_ROUTES } from '../poker-near-me/sitemapRoutes.js';
import { GLOSSARY_TERMS, glossaryTermPath } from '../../content/glossary/terms.js';
import { isTriviaPvpReleased } from '../trivia/pvpReleaseControl.mjs';
import { areTriviaTournamentsReleased } from '../trivia/tournamentReleaseControl.mjs';
import {
  canonicalSeriesRouteId,
  isServableSeriesParentEvidence,
  toPokerSeriesRouteId,
  tournamentSeriesIdFromPointerUid,
} from '../poker-near-me/seriesRouteIdentity.mjs';
import bundledSeriesData from '../../../data/poker-tour-series-2026.json' with { type: 'json' };
import { AS_OF as COMPARE_AS_OF, compareRoutes } from '../../content/compare/pages.js';
import tourSourceRegistry from '../../../data/tour-source-registry.json' with { type: 'json' };
import { LESSONS } from '../../content/learn/lessons.js';
import { LEARN_PATH, lessonPath } from '../learn/learnSite.js';

export const SITE_URL = 'https://smarter.poker';
export const SITEMAP_DB_PAGE_SIZE = 1000;
export const SERVABLE_SERIES_QUALITIES = ['scraped_verified', 'scraped_inferred', 'manual_research'];
export const SITEMAP_SERIES_EVIDENCE_COLUMNS = [
  'id',
  'series_uid',
  'is_suppressed',
  'data_quality',
  'source_url',
  'scrape_url',
  'scrape_html_hash',
  'scrape_timestamp',
  'scrape_batch_id',
].join(', ');

export const LEARN_PAGES = [
  { path: LEARN_PATH, priority: '0.8', changefreq: 'monthly' },
  ...LESSONS.map((l) => ({ path: lessonPath(l.slug), priority: '0.7', changefreq: 'monthly' })),
];

export const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
  { path: '/legal/official-rules', priority: '0.3', changefreq: 'yearly' },

  // Hub — Core
  { path: '/hub', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/poker-near-me/lobby', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/poker-near-me/in', priority: '0.8', changefreq: 'daily' },
  ...POKER_DISCOVERY_SITEMAP_ROUTES,
  { path: '/hub/home-games', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/training', priority: '0.9', changefreq: 'weekly' },
  { path: '/hub/news', priority: '0.9', changefreq: 'hourly' },
  { path: '/hub/video-library', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/diamond-store', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership', priority: '0.9', changefreq: 'weekly' },
  { path: '/hub/vip-membership/monthly', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership/yearly', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership/lifetime', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership/gift/monthly', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership/gift/yearly', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/vip-membership/gift/lifetime', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/merch-store', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/smarter-rewards', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/club-shop', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/bankroll-manager', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/preflop-charts', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/poker-tools', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/training/icm-calculator', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/training/equity-calculator', priority: '0.8', changefreq: 'weekly' },
  { path: '/tools/poker-odds-calculator', priority: '0.9', changefreq: 'weekly' },
  { path: '/tools/icm-calculator', priority: '0.9', changefreq: 'weekly' },
  { path: '/tools/preflop-ranges', priority: '0.9', changefreq: 'weekly' },

  { path: '/hub/events-calendar', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/daily-tournaments', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/tournaments/this-weekend', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/poker-tours', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/poker-series', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/social-media', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/leaderboards', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/commander', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/commander/venues', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/commander/tournaments', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/commander/home-games', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/commander/leagues', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/commander/faq', priority: '0.6', changefreq: 'monthly' },
  { path: '/hub/commander/responsible-gaming', priority: '0.5', changefreq: 'monthly' },
  { path: '/hub/promotions', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/reels', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/lives', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/help', priority: '0.5', changefreq: 'monthly' },
  { path: '/hub/pages', priority: '0.5', changefreq: 'weekly' },

  // Hub — Trivia
  { path: '/hub/trivia', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/trivia/endless', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/survival-game', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/time-attack', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/mixed', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/leaderboard', priority: '0.6', changefreq: 'daily' },

  // Hub — Training sub-pages
  { path: '/hub/training/challenges', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/leaderboard', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/tournaments', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/hand-history-upload', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/training/jarvis', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/training/solutions', priority: '0.6', changefreq: 'weekly' },

  // Hub — Preflop Charts sub-pages
  { path: '/hub/preflop-charts/leaderboard', priority: '0.5', changefreq: 'daily' },
  { path: '/hub/preflop-charts/tutorial', priority: '0.5', changefreq: 'monthly' },

  // Hub — News sub-pages
  { path: '/hub/news/sources', priority: '0.5', changefreq: 'weekly' },

  // Hub — Social Pages
  { path: '/hub/social-pages', priority: '0.5', changefreq: 'weekly' },

  // Hub — Home Games
  { path: '/hub/home-games/in', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/home-games/near-me', priority: '0.8', changefreq: 'daily' },
];

export const GLOSSARY_PAGES = [
  { path: '/glossary', priority: '0.8', changefreq: 'monthly' },
  ...GLOSSARY_TERMS.map((t) => ({ path: glossaryTermPath(t.slug), priority: '0.6', changefreq: 'monthly' })),
];

export const COMPARE_PAGES = compareRoutes().map((path) => ({
  path,
  priority: '0.7',
  changefreq: 'monthly',
  lastmod: COMPARE_AS_OF,
}));

export function getReleaseGatedPages() {
  return [
    ...(isTriviaPvpReleased(process.env)
      ? [{ path: '/hub/trivia/pvp', priority: '0.7', changefreq: 'weekly' }]
      : []),
    ...(areTriviaTournamentsReleased(process.env)
      ? [{ path: '/hub/trivia/tournaments', priority: '0.7', changefreq: 'daily' }]
      : []),
  ];
}

export function sitemapLastmodLine(lastmod) {
  if (!lastmod) return '';
  const time = new Date(lastmod).getTime();
  if (!Number.isFinite(time) || time <= 0) return '';
  return `    <lastmod>${new Date(time).toISOString()}</lastmod>\n`;
}

export function generateSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls
  .map(
    (url) => `  <url>
    <loc>${SITE_URL}${url.path}</loc>
${sitemapLastmodLine(url.lastmod)}    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
}

export function generateSitemapIndexXml(sitemaps) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
              http://www.sitemaps.org/schemas/sitemap/0.9/siteindex.xsd">
${sitemaps
  .map(
    (s) => `  <sitemap>
    <loc>${s.loc.startsWith('http') ? s.loc : `${SITE_URL}${s.loc}`}</loc>
${sitemapLastmodLine(s.lastmod)}  </sitemap>`
  )
  .join('\n')}
</sitemapindex>`;
}

export async function fetchAllSitemapRows({ supabase, table, select, orderBy, applyFilters }) {
  const rows = [];
  for (let from = 0; ; from += SITEMAP_DB_PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(select)
      .order(orderBy, { ascending: true })
      .range(from, from + SITEMAP_DB_PAGE_SIZE - 1);
    if (applyFilters) query = applyFilters(query);

    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < SITEMAP_DB_PAGE_SIZE) break;
  }
  return rows;
}

export async function buildHomeGameUrls() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('social_pages')
      .select('slug, location_state, location_city, linked_entity_id')
      .eq('page_type', 'home_game')
      .eq('is_public', true)
      .not('slug', 'is', null);

    if (error || !Array.isArray(data)) return [];

    const { US_STATES_BY_CODE, cityTitleToSlug, isGroupPubliclyVisible } =
      await import('../home-games/locationUtils.js');

    const groupIds = data
      .map((r) => r.linked_entity_id)
      .filter(Boolean)
      .map(String);
    const visibleGroupIds = new Set();
    const CHUNK = 200;
    for (let i = 0; i < groupIds.length; i += CHUNK) {
      const { data: groups } = await supabase
        .from('commander_home_groups')
        .select(
          'id, is_active, is_private, last_activity_at, created_at, visibility_override_until'
        )
        .in('id', groupIds.slice(i, i + CHUNK));
      for (const g of groups || []) {
        if (isGroupPubliclyVisible(g)) visibleGroupIds.add(String(g.id));
      }
    }
    const visibleRows = data.filter(
      (r) => r.linked_entity_id && visibleGroupIds.has(String(r.linked_entity_id))
    );

    const urls = [];
    const seenStates = new Set();
    const seenCities = new Set();

    for (const row of visibleRows) {
      if (row.slug) {
        urls.push({
          path: `/hub/home-games/${row.slug}`,
          priority: '0.7',
          changefreq: 'weekly',
        });
      }
      const code = String(row.location_state || '').toUpperCase();
      if (!US_STATES_BY_CODE[code]) continue;

      const stateSlug = code.toLowerCase();
      if (!seenStates.has(stateSlug)) {
        seenStates.add(stateSlug);
        urls.push({
          path: `/hub/home-games/in/${stateSlug}`,
          priority: '0.7',
          changefreq: 'daily',
        });
      }

      if (row.location_city) {
        const citySlug = cityTitleToSlug(row.location_city);
        const key2 = `${stateSlug}/${citySlug}`;
        if (citySlug && !seenCities.has(key2)) {
          seenCities.add(key2);
          urls.push({
            path: `/hub/home-games/in/${stateSlug}/${citySlug}`,
            priority: '0.6',
            changefreq: 'daily',
          });
        }
      }
    }

    return urls;
  } catch (err) {
    console.warn('[sitemap] home-game URL build failed:', err.message);
    return [];
  }
}

export async function buildPokerVenueUrls() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const [
      { createClient },
      { buildSnapshotVenueDirectory, fetchVenueDirectoryResilient },
      { buildPokerVenueSitemapUrls },
      snapshotModule,
    ] = await Promise.all([
      import('@supabase/supabase-js'),
      import('../poker-near-me/venueDirectoryServer.js'),
      import('../poker-near-me/sitemapRoutes.js'),
      import('../../../data/poker-venue-directory-snapshot.json', { with: { type: 'json' } }),
    ]);
    const snapshotData = snapshotModule.default || snapshotModule;
    const fallbackVenues = snapshotData.venues || [];
    const fallbackMetadata = snapshotData.metadata || {};
    const params = { limit: 1000 };
    const directory = url && key
      ? await fetchVenueDirectoryResilient({
          supabase: createClient(url, key),
          params,
          fallbackVenues,
          fallbackMetadata,
          onFallback: (error) => console.warn('[sitemap] using checked venue snapshot:', error.message),
        })
      : buildSnapshotVenueDirectory({
          params,
          venues: fallbackVenues,
          metadata: fallbackMetadata,
        });

    return buildPokerVenueSitemapUrls(directory.data);
  } catch (err) {
    console.warn('[sitemap] poker venue URL build failed:', err.message);
    return [];
  }
}

export async function buildPokerEventDetailUrls() {
  const urls = new Map();
  const offeredSeriesIds = new Set();
  const addSeries = (rawId, evidenceRow = null) => {
    const canonicalId = canonicalSeriesRouteId(rawId);
    const id = Number(canonicalId);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    offeredSeriesIds.add(String(id));
    const path = `/hub/series/${id}`;
    let lastmod = null;
    if (evidenceRow?.scrape_timestamp) {
      const time = new Date(evidenceRow.scrape_timestamp).getTime();
      if (Number.isFinite(time) && time > 0) {
        lastmod = new Date(time).toISOString();
      }
    }
    urls.set(path, { path, priority: '0.7', changefreq: 'daily', ...(lastmod ? { lastmod } : {}) });
  };
  const addTour = (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]+$/.test(code)) return;
    const path = `/hub/tours/${encodeURIComponent(code)}`;
    urls.set(path, { path, priority: '0.7', changefreq: 'daily' });
  };

  const bundledSeries = Array.isArray(bundledSeriesData)
    ? bundledSeriesData
    : (bundledSeriesData?.series_2026 || []);
  bundledSeries.forEach((series, index) => {
    if (!series?.is_suppressed) addSeries(index + 1);
  });

  const claimedTourNames = new Set();
  const tourNameKey = (name) => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [registryCode, tour] of Object.entries(tourSourceRegistry?.tours || {})) {
    if (tour?.is_active === false) continue;
    const key = tourNameKey(tour?.tour_name);
    if (key) claimedTourNames.add(key);
    addTour(tour?.tour_code || registryCode);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Array.from(urls.values());

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key);
    const results = await Promise.allSettled([
      fetchAllSitemapRows({
        supabase,
        table: 'tournament_series',
        select: SITEMAP_SERIES_EVIDENCE_COLUMNS,
        orderBy: 'id',
        applyFilters: (query) => query
          .or('is_suppressed.is.null,is_suppressed.eq.false')
          .in('data_quality', SERVABLE_SERIES_QUALITIES),
      }),
      fetchAllSitemapRows({
        supabase,
        table: 'poker_series',
        select: SITEMAP_SERIES_EVIDENCE_COLUMNS,
        orderBy: 'id',
        applyFilters: (query) => query
          .or('is_suppressed.is.null,is_suppressed.eq.false')
          .in('data_quality', SERVABLE_SERIES_QUALITIES),
      }),
      fetchAllSitemapRows({
        supabase,
        table: 'tour_source_registry',
        select: 'tour_code, tour_name',
        orderBy: 'tour_code',
        applyFilters: (query) => query.eq('is_active', true),
      }),
    ]);

    const claimedUids = new Set();
    if (results[0].status === 'fulfilled') {
      results[0].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => {
          const uid = typeof row.series_uid === 'string' ? row.series_uid.trim() : '';
          if (uid) claimedUids.add(uid);
          addSeries(row.id, row);
        });
    } else {
      console.warn('[sitemap] tournament_series detail URLs unavailable:', results[0].reason?.message);
    }
    if (results[1].status === 'fulfilled') {
      results[1].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => {
          const uid = typeof row.series_uid === 'string' ? row.series_uid.trim() : '';
          const pointsAt = tournamentSeriesIdFromPointerUid(uid);
          if (pointsAt !== null && offeredSeriesIds.has(String(pointsAt))) return;
          if (uid && claimedUids.has(uid)) return;
          if (uid) claimedUids.add(uid);
          addSeries(toPokerSeriesRouteId(row.id), row);
        });
    } else {
      console.warn('[sitemap] poker_series detail URLs unavailable:', results[1].reason?.message);
    }
    if (results[2].status === 'fulfilled') {
      results[2].value.forEach((row) => {
        const key = tourNameKey(row.tour_name);
        if (key && claimedTourNames.has(key)) return;
        if (key) claimedTourNames.add(key);
        addTour(row.tour_code);
      });
    } else {
      console.warn('[sitemap] tour detail URLs unavailable:', results[2].reason?.message);
    }
  } catch (err) {
    console.warn('[sitemap] event detail URL build failed:', err.message);
    return Array.from(urls.values());
  }

  return Array.from(urls.values());
}
