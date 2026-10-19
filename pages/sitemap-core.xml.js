/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  CORE & TOOL PAGES SITEMAP -- /sitemap-core.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for smarter.poker core landing, legal,
 * interactive poker tools & calculators, and primary hub features.
 * Serves at https://smarter.poker/sitemap-core.xml
 */

import {
  generateSitemapXml,
  getReleaseGatedPages,
  sendSitemapXmlResponse,
  STATIC_PAGES,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const releaseGatedPages = getReleaseGatedPages();

  const sitemap = generateSitemapXml([
    ...STATIC_PAGES,
    ...releaseGatedPages,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function CoreSitemap() {
  return null;
}
