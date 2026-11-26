/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENTS, FREEROLLS & SERIES GUIDES SITEMAP -- /sitemap-tournaments.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for recurring tournament schedules, freerolls,
 * weekend schedules, event calendars, and major series strategy guides.
 * Individual /hub/series/[id] and /hub/tours/[code] detail URLs live in
 * /sitemap-series.xml to keep child sitemaps cleanly deduplicated.
 * Serves at https://smarter.poker/sitemap-tournaments.xml
 */

import {
  SERIES_GUIDE_PAGES,
  generateSitemapXml,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';

const TOURNAMENT_HUB_PAGES = [
  { path: '/freerolls', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/daily-tournaments', priority: '0.85', changefreq: 'daily' },
  { path: '/hub/tournaments/this-weekend', priority: '0.9', changefreq: 'daily' },
  { path: '/hub/events-calendar', priority: '0.85', changefreq: 'daily' },
  { path: '/hub/poker-series', priority: '0.85', changefreq: 'daily' },
  { path: '/hub/poker-tours', priority: '0.85', changefreq: 'daily' },
  { path: '/hub/commander/tournaments', priority: '0.8', changefreq: 'daily' },
];

export async function getServerSideProps({ req, res }) {
  const sitemap = generateSitemapXml([
    ...TOURNAMENT_HUB_PAGES,
    ...SERIES_GUIDE_PAGES,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function TournamentsSitemap() {
  return null;
}
