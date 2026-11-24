/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE POKER TOOLS & SOLVERS SITEMAP -- /sitemap-tools.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all 52 interactive browser-native poker math
 * calculators, GTO preflop range matrices, and webmaster embed widgets.
 * Serves at https://smarter.poker/sitemap-tools.xml
 */

import {
  generateSitemapXml,
  sendSitemapXmlResponse,
  TOOLS_PAGES,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const sitemap = generateSitemapXml(TOOLS_PAGES);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function ToolsSitemap() {
  return null;
}
