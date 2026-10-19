/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  TOURNAMENTS & SERIES SITEMAP -- /sitemap-tournaments.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all poker tournament series, festivals,
 * and major tour detail routes with real evidence scrape lastmod timestamps.
 * Serves at https://smarter.poker/sitemap-tournaments.xml
 */

import {
  buildPokerEventDetailUrls,
  generateSitemapXml,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const pokerEventDetailUrls = await buildPokerEventDetailUrls();

  const sitemap = generateSitemapXml([
    ...pokerEventDetailUrls,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function TournamentsSitemap() {
  return null;
}
