/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  XML SITEMAP INDEX -- /sitemap_index.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Master Sitemap Index partitioning the domain into specialized sub-sitemaps
 * for granular Google Search Console crawling, status diagnostics, and rapid
 * indexation of core landers, venues, tournaments, comparisons, learning,
 * videos, and the Poker Arena.
 * Serves at https://smarter.poker/sitemap_index.xml
 */

import {
  generateSitemapIndexXml,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';
import { AS_OF as COMPARE_AS_OF } from '../src/content/compare/pages.js';

export async function getServerSideProps({ req, res }) {
  const sitemaps = [
    { loc: '/sitemap-core.xml' },
    { loc: '/sitemap-venues.xml' },
    { loc: '/sitemap-tournaments.xml' },
    { loc: '/sitemap-series.xml' },
    { loc: '/sitemap-compare.xml', lastmod: COMPARE_AS_OF },
    { loc: '/sitemap-learn.xml' },
    { loc: '/sitemap-videos.xml' },
    { loc: '/hub/club-arena/sitemap.xml' },
  ];

  const xml = generateSitemapIndexXml(sitemaps);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, xml);

  return { props: {} };
}

export default function SitemapIndex() {
  return null;
}
