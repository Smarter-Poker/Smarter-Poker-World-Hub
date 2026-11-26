/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DYNAMIC NEWS & ARTICLES SITEMAP GENERATOR — /sitemap-news.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for published Smarter.Poker news articles
 * (/hub/article?id=<uuid>) with real publication/update <lastmod> timestamps
 * and Google News <news:news> annotations for articles published within 48h.
 * Serves at https://smarter.poker/sitemap-news.xml
 */

import {
  buildNewsArticleUrls,
  generateNewsSitemapXml,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const articles = await buildNewsArticleUrls();
  const xml = generateNewsSitemapXml(articles);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, xml);

  return { props: {} };
}

export default function NewsSitemap() {
  return null;
}
