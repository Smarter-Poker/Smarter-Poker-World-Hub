/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE POKER TOOLS & SOLVERS SITEMAP -- /sitemap-tools.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all interactive browser-native poker math
 * calculators, GTO preflop range matrices, GTO leak finder, top 150 hand-vs-hand
 * equity pages, and webmaster embed widgets.
 * Serves at https://smarter.poker/sitemap-tools.xml
 */

import {
  generateSitemapXml,
  sendSitemapXmlResponse,
  TOOLS_PAGES,
} from '../src/lib/seo/sitemapBuilders.mjs';
import {
  TOOL_HAND_MATCHUPS,
  TOOL_MATCHUPS_AS_OF,
} from '../src/content/tools/handMatchups.js';

const EXTRA_TOOL_ROUTES = [
  {
    path: '/tools/gto-leak-finder',
    priority: '0.9',
    changefreq: 'weekly',
    lastmod: TOOL_MATCHUPS_AS_OF,
  },
].filter((entry) => !TOOLS_PAGES.some((existing) => existing.path === entry.path));

export const TOOLS_SITEMAP_URLS = [
  ...TOOLS_PAGES,
  ...EXTRA_TOOL_ROUTES,
  ...TOOL_HAND_MATCHUPS.map((matchup) => ({
    path: matchup.path,
    priority: '0.85',
    changefreq: 'monthly',
    lastmod: TOOL_MATCHUPS_AS_OF,
  })),
];

export async function getServerSideProps({ req, res }) {
  const sitemap = generateSitemapXml(TOOLS_SITEMAP_URLS);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function ToolsSitemap() {
  return null;
}
