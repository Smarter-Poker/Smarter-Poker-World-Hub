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
  buildStaticCoreUrls,
  buildWireEditionUrls,
} from '../src/lib/seo/sitemapBuilders.mjs';
import { createClient } from '../src/lib/supabaseServerClient';

export async function getServerSideProps({ req, res }) {
  const releaseGatedPages = getReleaseGatedPages();
  const today = new Date().toISOString().slice(0, 10);

  let wireCampaignRows = [];
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('newsletter_campaigns')
      .select('id, subject, status, completed_at, created_at, article_ids')
      .in('status', ['sent', 'partial'])
      .order('created_at', { ascending: true })
      .limit(200);
    if (Array.isArray(data)) {
      wireCampaignRows = data;
    }
  } catch (_err) {
    wireCampaignRows = [];
  }

  const wireEditionUrls = await buildWireEditionUrls(wireCampaignRows);
  const staticCoreUrls = typeof buildStaticCoreUrls === 'function' ? buildStaticCoreUrls(today) : [];

  const sitemap = generateSitemapXml([
    ...staticCoreUrls,
    ...releaseGatedPages,
    ...wireEditionUrls,
  ]);

  res.setHeader('Content-Type', 'text/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  sendSitemapXmlResponse(req, res, sitemap);

  return { props: {} };
}

export default function CoreSitemap() {
  return null;
}
