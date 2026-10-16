/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC VENUES SITEMAP GENERATOR — /sitemap-venues.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all physical poker card rooms, casinos,
 * state & city location discovery routes, and home games.
 * Serves at https://smarter.poker/sitemap-venues.xml
 */

import {
  buildHomeGameUrls,
  buildPokerVenueUrls,
  generateSitemapXml,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ res }) {
  const [homeGameUrls, pokerVenueUrls] = await Promise.all([
    buildHomeGameUrls(),
    buildPokerVenueUrls(),
  ]);

  const sitemap = generateSitemapXml([
    ...homeGameUrls,
    ...pokerVenueUrls,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.write(sitemap);
  res.end();

  return { props: {} };
}

export default function VenuesSitemap() {
  return null;
}
