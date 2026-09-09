/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC SITEMAP GENERATOR — /sitemap.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Generates a complete XML sitemap for smarter.poker with all public pages.
 * Serves at https://smarter.poker/sitemap.xml
 */

import { POKER_DISCOVERY_SITEMAP_ROUTES } from '../src/lib/poker-near-me/sitemapRoutes';
import {
  isServableSeriesParentEvidence,
  toPokerSeriesRouteId,
} from '../src/lib/poker-near-me/seriesRouteIdentity.mjs';
import bundledSeriesData from '../data/poker-tour-series-2026.json';
import tourSourceRegistry from '../data/tour-source-registry.json';

const SITE_URL = 'https://smarter.poker';
const SITEMAP_DB_PAGE_SIZE = 1000;
const SERVABLE_SERIES_QUALITIES = ['scraped_verified', 'scraped_inferred', 'manual_research'];
const SITEMAP_SERIES_EVIDENCE_COLUMNS = [
  'id',
  'is_suppressed',
  'data_quality',
  'source_url',
  'scrape_url',
  'scrape_html_hash',
  'scrape_timestamp',
  'scrape_batch_id',
].join(', ');

// ─── Static Pages ────────────────────────────────────────────────────────────
const staticPages = [
  // Landing
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
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
  // Store tabs became real routes on 2026-08-25. VIP outranks the store front
  // page because it is the page that sells the subscription.
  { path: '/hub/vip-membership', priority: '0.9', changefreq: 'weekly' },
  { path: '/hub/merch-store', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/smarter-rewards', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/club-shop', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/bankroll-manager', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/preflop-charts', priority: '0.7', changefreq: 'weekly' },

  { path: '/hub/events-calendar', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/daily-tournaments', priority: '0.7', changefreq: 'daily' },
  // These standalone map/card directories are distinct, self-canonical public
  // surfaces. Keep them discoverable alongside the unified PNM tour/series
  // tabs instead of publishing canonical pages that the sitemap omits.
  { path: '/hub/poker-tours', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/poker-series', priority: '0.8', changefreq: 'daily' },
  { path: '/hub/social-media', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/leaderboards', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/friends', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/club-arena', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/promotions', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/reels', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/lives', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/messenger', priority: '0.4', changefreq: 'weekly' },
  { path: '/hub/notifications', priority: '0.3', changefreq: 'weekly' },
  { path: '/hub/help', priority: '0.5', changefreq: 'monthly' },
  { path: '/hub/settings', priority: '0.3', changefreq: 'monthly' },
  { path: '/hub/profile', priority: '0.4', changefreq: 'weekly' },
  { path: '/hub/profile-edit', priority: '0.3', changefreq: 'monthly' },
  { path: '/hub/avatars', priority: '0.4', changefreq: 'monthly' },
  { path: '/hub/article', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/pages', priority: '0.5', changefreq: 'weekly' },

  // Hub — Trivia
  { path: '/hub/trivia', priority: '0.8', changefreq: 'weekly' },
  { path: '/hub/trivia/endless', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/survival', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/time-attack', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/mixed', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/pvp', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/tournaments', priority: '0.7', changefreq: 'daily' },
  { path: '/hub/trivia/leaderboard', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/trivia/achievements', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/trivia/stats', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/trivia/settings', priority: '0.3', changefreq: 'monthly' },

  // Hub — Training sub-pages
  { path: '/hub/training/achievements', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/training/challenges', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/leaderboard', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/progress', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/training/streaks', priority: '0.5', changefreq: 'daily' },
  { path: '/hub/training/tournaments', priority: '0.6', changefreq: 'daily' },
  { path: '/hub/training/jarvis', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/training/play-mode', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/training/solutions', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/training/analyzer', priority: '0.6', changefreq: 'weekly' },
  { path: '/hub/training/reports', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/training/aggregate', priority: '0.5', changefreq: 'weekly' },

  // Hub — Diamond Store sub-pages
  { path: '/hub/diamond-store/cart', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/diamond-store/orders', priority: '0.4', changefreq: 'weekly' },
  { path: '/hub/diamond-store/wishlist', priority: '0.4', changefreq: 'weekly' },

  // Hub — Preflop Charts sub-pages
  { path: '/hub/preflop-charts/achievements', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/preflop-charts/leaderboard', priority: '0.5', changefreq: 'daily' },
  { path: '/hub/preflop-charts/stats', priority: '0.4', changefreq: 'weekly' },
  { path: '/hub/preflop-charts/tutorial', priority: '0.5', changefreq: 'monthly' },

  // Hub — Reels sub-pages
  { path: '/hub/reels/saved', priority: '0.4', changefreq: 'weekly' },
  { path: '/hub/reels/my-reels', priority: '0.4', changefreq: 'weekly' },

  // Hub — News sub-pages
  { path: '/hub/news/sources', priority: '0.5', changefreq: 'weekly' },

  // Hub — Bankroll Manager sub-pages
  { path: '/hub/bankroll-manager/export', priority: '0.4', changefreq: 'monthly' },

  // Hub — Social Pages
  { path: '/hub/social-pages', priority: '0.5', changefreq: 'weekly' },
  { path: '/hub/social-pages/create', priority: '0.4', changefreq: 'monthly' },

  // Hub — Home Games (geo index; individual game + state/city pages are added dynamically)
  { path: '/hub/home-games/in', priority: '0.8', changefreq: 'daily' },
  // Every home-games BreadcrumbList nominates this as the 'Home Games'
  // node, yet it was absent from the sitemap entirely (audit M-4).
  { path: '/hub/home-games/near-me', priority: '0.8', changefreq: 'daily' },

  // Horses
  { path: '/horses', priority: '0.7', changefreq: 'daily' },
];

// ─── Dynamic Home-Game URLs ──────────────────────────────────────────────────
// Pulled from social_pages at request time. The complete sitemap shares the
// five-minute freshness window declared below, with a 30-minute SWR cushion.
async function buildHomeGameUrls() {
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
      // A null slug produced /hub/home-games/null, which the public API 404s.
      .not('slug', 'is', null);

    if (error || !Array.isArray(data)) return [];

    const { US_STATES_BY_CODE, cityTitleToSlug, isGroupPubliclyVisible } =
      await import('../src/lib/home-games/locationUtils');

    // VISIBILITY (audit M-4): this builder previously applied only
    // `is_public`, while the three geo pages additionally require
    // isGroupPubliclyVisible (is_active, not is_private, and the 45-day
    // auto-hide). The sitemap therefore advertised city URLs that the city
    // page itself 404s — it returns notFound once zero visible games remain —
    // plus detail URLs for deactivated and private groups. Apply the same
    // predicate here so the sitemap can only ever contain URLs that resolve.
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
    // NOTE: `data` is const (destructured above) — bind the filtered set to a
    // new name rather than reassigning it.
    const visibleRows = data.filter(
      (r) => r.linked_entity_id && visibleGroupIds.has(String(r.linked_entity_id))
    );

    const urls = [];
    const seenStates = new Set();
    const seenCities = new Set();

    for (const row of visibleRows) {
      // Individual home-game page (was missing from sitemap before)
      if (row.slug) {
        urls.push({
          path: `/hub/home-games/${row.slug}`,
          priority: '0.7',
          changefreq: 'weekly',
        });
      }
      const code = String(row.location_state || '').toUpperCase();
      if (!US_STATES_BY_CODE[code]) continue;

      // State-level geo page
      const stateSlug = code.toLowerCase();
      if (!seenStates.has(stateSlug)) {
        seenStates.add(stateSlug);
        urls.push({
          path: `/hub/home-games/in/${stateSlug}`,
          priority: '0.7',
          changefreq: 'daily',
        });
      }

      // City-level geo page
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

// Physical venue + state/city discovery URLs. Use the exact resilient public
// directory projection consumed by discovery and location pages so sitemap
// routes cannot drift from integrity filtering or the checked fallback data.
async function buildPokerVenueUrls() {
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
      import('../src/lib/poker-near-me/venueDirectoryServer'),
      import('../src/lib/poker-near-me/sitemapRoutes'),
      import('../data/poker-venue-directory-snapshot.json'),
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

async function fetchAllSitemapRows({ supabase, table, select, orderBy, applyFilters }) {
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

// Index every public detail contract behind the two event directories. A
// nonempty API fallback bundle and the route-keyed tour registry keep their
// resolvable detail routes discoverable during a database outage; database
// rows extend that baseline without silently truncating at PostgREST's default
// 1,000-row limit.
async function buildPokerEventDetailUrls() {
  const urls = new Map();
  const addSeries = (rawId) => {
    const id = Number(rawId);
    if (!Number.isSafeInteger(id) || id <= 0) return;
    const path = `/hub/series/${id}`;
    urls.set(path, { path, priority: '0.7', changefreq: 'daily' });
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
  // The public series API assigns IDs to this exact bundle before suppression,
  // so preserve its original index. If the bundle is empty, add no fallback
  // IDs: source-registry array positions are not persistent route identities.
  bundledSeries.forEach((series, index) => {
    if (!series?.is_suppressed) addSeries(index + 1);
  });

  for (const [registryCode, tour] of Object.entries(tourSourceRegistry?.tours || {})) {
    if (tour?.is_active === false) continue;
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
        select: 'tour_code',
        orderBy: 'tour_code',
        applyFilters: (query) => query.eq('is_active', true),
      }),
    ]);

    if (results[0].status === 'fulfilled') {
      results[0].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => addSeries(row.id));
    } else {
      console.warn('[sitemap] tournament_series detail URLs unavailable:', results[0].reason?.message);
    }
    if (results[1].status === 'fulfilled') {
      results[1].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => addSeries(toPokerSeriesRouteId(row.id)));
    } else {
      console.warn('[sitemap] poker_series detail URLs unavailable:', results[1].reason?.message);
    }
    if (results[2].status === 'fulfilled') {
      results[2].value.forEach((row) => addTour(row.tour_code));
    } else {
      console.warn('[sitemap] tour detail URLs unavailable:', results[2].reason?.message);
    }
  } catch (err) {
    console.warn('[sitemap] event detail URL build failed:', err.message);
    return Array.from(urls.values());
  }

  return Array.from(urls.values());
}

function generateSitemapXml(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls
  .map(
    (url) => `  <url>
    <loc>${SITE_URL}${url.path}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
}

export async function getServerSideProps({ res }) {
  const [homeGameUrls, pokerVenueUrls, pokerEventDetailUrls] = await Promise.all([
    buildHomeGameUrls(),
    buildPokerVenueUrls(),
    buildPokerEventDetailUrls(),
  ]);
  const sitemap = generateSitemapXml([
    ...staticPages,
    ...homeGameUrls,
    ...pokerVenueUrls,
    ...pokerEventDetailUrls,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.write(sitemap);
  res.end();

  return { props: {} };
}

export default function Sitemap() {
  return null;
}
