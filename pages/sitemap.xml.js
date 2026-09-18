/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC SITEMAP GENERATOR — /sitemap.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Generates a complete XML sitemap for smarter.poker with all public pages.
 * Serves at https://smarter.poker/sitemap.xml
 */

import { POKER_DISCOVERY_SITEMAP_ROUTES } from '../src/lib/poker-near-me/sitemapRoutes';
import { isTriviaPvpReleased } from '../src/lib/trivia/pvpReleaseControl.mjs';
import { areTriviaTournamentsReleased } from '../src/lib/trivia/tournamentReleaseControl.mjs';
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
  // AEO phase 3 (2026-09-18): the same scraped series lives in both
  // tournament_series and poker_series, carrying the same series_uid, and
  // the sitemap offered a URL for each. 23 pairs of byte-identical pages,
  // each declaring itself canonical. The uid is selected so one of them can
  // be dropped.
  'series_uid',
  'is_suppressed',
  'data_quality',
  'source_url',
  'scrape_url',
  'scrape_html_hash',
  'scrape_timestamp',
  'scrape_batch_id',
].join(', ');

// ─── Static Pages ────────────────────────────────────────────────────────────
// PAGES ABOUT THE VIEWER ARE NOT IN THE SITEMAP EITHER (AEO phase 3,
// 2026-09-17). The September sweep took out the routes that redirect a
// signed-out visitor to a login page. It left the ones that load, render
// their chrome, and then show the viewer their own results: training
// progress, streaks, achievements, reports and aggregates; trivia stats and
// achievements; preflop practice stats and achievements; the friends list;
// the avatar picker; the bankroll export; the social page create form;
// /hub/profile, which is a client-side redirect to the viewer's own profile
// and nothing else; and /hub/article, which needs an ?id= query and serves
// an empty shell without one.
//
// Measured on production as OAI-SearchBot with scripts stripped, those
// fifteen pages returned between 0 and 49 words, and several returned no
// <title> and no <h1> at all. There is nothing on any of them an engine
// could cite, because what they show depends entirely on who is looking.
// A sitemap is a list of pages worth indexing, not a list of routes, and
// every entry that cannot be cited spends crawl budget teaching an engine
// nothing.
//
// ACCOUNT-ONLY PAGES ARE NOT IN THE SITEMAP (2026-09-16). Messenger,
// notifications, settings, profile edit, the store cart/orders/wishlist and a
// player's own reels all need a session; a crawler lands on the login page
// and Search Console files each one as an error. A sitemap is a list of pages
// worth indexing, not a list of routes.
const staticPages = [
  // Landing
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  // The entity anchor an AI engine reads to answer "what is Smarter Poker"
  // and "who makes Club Commander" (AEO phase 2, 2026-09-17).
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/terms', priority: '0.3', changefreq: 'yearly' },
  // /privacy was missing (AEO phase 3, 2026-09-18). It is a 524 word page
  // that every hub summary links to in its compliance line, and the URL the
  // app stores read, and it was the one legal document the sitemap did not
  // offer.
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
  // Poker Arena is NOT listed here (discoverability phase 2, 2026-09-17).
  // The arena publishes its own sitemap from what it prerenders, dated from
  // its git history, at https://smarter.poker/hub/club-arena/sitemap.xml
  // (Smarter-Poker-Club-Arena scripts/generate-arena-sitemap.mjs), and
  // public/robots.txt names it beside this one. Two repositories no longer
  // keep one hand-typed list.
  // Club Commander, player side. The pages that need no session and were
  // noindex until 2026-09-16 (see pages/hub/commander/index.js). Pages that
  // show one player's own rewards, services, profile or history stay out.
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
  // /hub/trivia/survival IS NOT LISTED (AEO phase 3, 2026-09-18). It is a
  // deprecated duplicate implementation kept alive for old bookmarks: it
  // declares noindex={true}, canonicals to /hub/trivia/survival-game and
  // redirects there on mount. A sitemap entry says "index this" while the
  // page says "do not", and the crawler believes the page. Survival is
  // described and linked from /hub/trivia, which is indexed.
  { path: '/hub/trivia/survival-game', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/time-attack', priority: '0.7', changefreq: 'weekly' },
  { path: '/hub/trivia/mixed', priority: '0.7', changefreq: 'weekly' },
  // /hub/trivia/pvp and /hub/trivia/tournaments ARE NOT HERE. Both sit
  // behind a server side release gate and redirect to /hub/trivia while it
  // is closed, so the sitemap was inviting a crawler to two 307s. They are
  // added below, by asking the same gate the pages ask, so that enabling
  // either feature puts it back in the sitemap with no second edit here
  // and no chance of the two disagreeing (AEO phase 3, 2026-09-18).
  { path: '/hub/trivia/leaderboard', priority: '0.6', changefreq: 'daily' },

  // A ROUTE THAT ONLY REDIRECTS IS NOT A PAGE (AEO phase 3, 2026-09-17).
  // /hub/training/analyzer is getServerSideProps returning a 307 to the
  // hand-history upload, and /hub/training/play-mode renders
  // CanonicalTrainingRedirect and sends the reader into the arena. A crawler
  // that follows a sitemap entry to a redirect learns the destination it
  // could have reached anyway, and spends a fetch to do it.
  // Hub — Training sub-pages
  // 866 server-rendered words defining 49 terms, and the sitemap never
  // mentioned it. A definitional question is the question an AI engine
  // answers most often, so this is the most quotable page the site owns
  // (AEO phase 3, 2026-09-17).
  { path: '/hub/training/glossary', priority: '0.8', changefreq: 'monthly' },
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

  // Hub — Bankroll Manager sub-pages

  // Hub — Social Pages
  { path: '/hub/social-pages', priority: '0.5', changefreq: 'weekly' },

  // Hub — Home Games (geo index; individual game + state/city pages are added dynamically)
  { path: '/hub/home-games/in', priority: '0.8', changefreq: 'daily' },
  // Every home-games BreadcrumbList nominates this as the 'Home Games'
  // node, yet it was absent from the sitemap entirely (audit M-4).
  { path: '/hub/home-games/near-me', priority: '0.8', changefreq: 'daily' },

  // /horses IS THE STAFF ADMIN CONSOLE, NOT A PRODUCT (AEO phase 3,
  // 2026-09-17). pages/horses/index.js is HorsesAdmin: an email and password
  // form, a roster table and an SQL console, gated on profiles.is_admin. It
  // sat here at priority 0.7. Measured on production as OAI-SearchBot it
  // returned 11 words and no <title> at all, because its head sits below the
  // session gate. A public sitemap is the wrong place to advertise an admin
  // login, and there was never anything on it to index.
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

    // ONE URL PER SERIES (AEO phase 3, 2026-09-18).
    //
    // The same scraped series is held in both tables under the same
    // series_uid, and both were listed: /hub/series/470 and
    // /hub/series/5000692 are the same event, word for word, each with a
    // self canonical. Measured live, 23 pairs. Two URLs for one page split
    // whatever authority the page has and spend the crawl budget twice.
    //
    // tournament_series wins, because its ids are the ones the sitemap has
    // been offering longest and dropping them would discard whatever
    // indexing they already have. A row with no uid cannot be matched to
    // anything, so it is kept as itself.
    const claimedUids = new Set();
    if (results[0].status === 'fulfilled') {
      results[0].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => {
          const uid = typeof row.series_uid === 'string' ? row.series_uid.trim() : '';
          if (uid) claimedUids.add(uid);
          addSeries(row.id);
        });
    } else {
      console.warn('[sitemap] tournament_series detail URLs unavailable:', results[0].reason?.message);
    }
    if (results[1].status === 'fulfilled') {
      results[1].value
        .filter(row => isServableSeriesParentEvidence(row))
        .forEach((row) => {
          const uid = typeof row.series_uid === 'string' ? row.series_uid.trim() : '';
          if (uid && claimedUids.has(uid)) return; // already offered under its other id
          addSeries(toPokerSeriesRouteId(row.id));
        });
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
${sitemapLastmodLine(url.lastmod)}    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;
}

// LASTMOD IS EVIDENCE, NOT A TIMESTAMP OF GENERATION (AEO phase 1, 2026-09-17).
// Every entry used to carry today's date, so the file said that 1,000 pages
// changed every day. Bing's sitemap guidance for AI search says a lastmod set
// to generation time is ignored and the sitemap discounted; AI engines weight
// freshness, so a fake date is worse than none. An entry now carries lastmod
// only when its source has real change evidence (venue verification and scrape
// times through buildPokerVenueSitemapUrls); otherwise the element is omitted,
// which the sitemap protocol permits.
function sitemapLastmodLine(lastmod) {
  if (!lastmod) return '';
  const time = new Date(lastmod).getTime();
  if (!Number.isFinite(time) || time <= 0) return '';
  return `    <lastmod>${new Date(time).toISOString()}</lastmod>\n`;
}

export async function getServerSideProps({ res }) {
  const [homeGameUrls, pokerVenueUrls, pokerEventDetailUrls] = await Promise.all([
    buildHomeGameUrls(),
    buildPokerVenueUrls(),
    buildPokerEventDetailUrls(),
  ]);
  // A page the release gate is currently redirecting is not a page. The
  // gate is read here, from the same functions the pages read, so the
  // sitemap can never advertise a feature that is switched off.
  const releaseGatedPages = [
    ...(isTriviaPvpReleased(process.env)
      ? [{ path: '/hub/trivia/pvp', priority: '0.7', changefreq: 'weekly' }]
      : []),
    ...(areTriviaTournamentsReleased(process.env)
      ? [{ path: '/hub/trivia/tournaments', priority: '0.7', changefreq: 'daily' }]
      : []),
  ];

  const sitemap = generateSitemapXml([
    ...staticPages,
    ...releaseGatedPages,
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
