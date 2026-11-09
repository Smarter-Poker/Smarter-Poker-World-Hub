/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  GET /api/seo/outreach-generator
 *  Automated Backlink Outreach, 404 Replacement & Multilingual Snippet API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Query Parameters:
 * - campaign: 'unlinked-brand' | 'competitor-404' | 'cardroom-awards' |
 *             'cpa-tax-w2g' | 'dealer-schools' | 'edu-quant-clubs' |
 *             'podcast-show-notes' | 'multilingual' (optional, returns all if omitted)
 * - lang: 'en' | 'es' | 'pt' | 'de' | 'fr' | 'it' | 'ja' (default: 'en')
 * - target: Target site/room/publication name for template personalization
 */

import { generateOutreachPackage } from '../../../src/lib/seo/outreachEngine.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { campaign = '', lang = 'en', target = 'Your Publication' } = req.query || {};
  const payload = generateOutreachPackage({ campaign, lang, target });

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(payload);
}
