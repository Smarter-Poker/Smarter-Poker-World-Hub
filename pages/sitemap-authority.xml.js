/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  QUANTITATIVE AUTHORITY, RESEARCH & GEO HUBS SITEMAP -- /sitemap-authority.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all poker authority hubs: /learn/*, /research/*,
 * /poker-rooms/*, /rules/*, /games/*, /compare/*, /authors/*, and /facts.
 * Serves at https://smarter.poker/sitemap-authority.xml
 */

import {
  AUTHORITY_PAGES,
  generateSitemapXml,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const sitemap = generateSitemapXml(AUTHORITY_PAGES);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function AuthoritySitemap() {
  return null;
}
