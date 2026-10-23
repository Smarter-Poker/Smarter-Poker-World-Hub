/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  STRATEGY LESSONS & GLOSSARY SITEMAP -- /sitemap-learn.xml
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dedicated segmented sitemap for all poker strategy lessons, structured
 * syllabus modules, and comprehensive poker glossary terms.
 * Serves at https://smarter.poker/sitemap-learn.xml
 */

import {
  generateSitemapXml,
  GLOSSARY_PAGES,
  LEARN_PAGES,
  sendSitemapXmlResponse,
} from '../src/lib/seo/sitemapBuilders.mjs';

export async function getServerSideProps({ req, res }) {
  const sitemap = generateSitemapXml([
    ...LEARN_PAGES,
    ...GLOSSARY_PAGES,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function LearnSitemap() {
  return null;
}
