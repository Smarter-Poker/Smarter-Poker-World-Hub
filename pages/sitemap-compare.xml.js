/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  APP & CLUB COMPARISONS SITEMAP -- /sitemap-compare.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all poker app comparisons, platform versus
 * teardowns, and venue comparative analyses with deterministic lastmod.
 * Serves at https://smarter.poker/sitemap-compare.xml
 */

import {
  COMPARE_PAGES,
  generateSitemapXml,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ res }) {
  const sitemap = generateSitemapXml([
    ...COMPARE_PAGES,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.write(sitemap);
  res.end();

  return { props: {} };
}

export default function CompareSitemap() {
  return null;
}
