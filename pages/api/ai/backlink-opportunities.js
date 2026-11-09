/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  /api/ai/backlink-opportunities - Backlink, Citation & PR Discovery API
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Exposes Smarter.Poker's structured Dead-Tool Replacement matrix, software
 * directory metadata, embeddable widget/badge endpoints, and journalist data
 * hooks for SEO/GEO automation and AI connector workflows.
 */

import { getBacklinkOpportunitiesPayload } from '../../../src/lib/seo/backlinkCatalog.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const payload = getBacklinkOpportunitiesPayload();
  const { category = '' } = req.query || {};

  if (category) {
    const q = String(category).toLowerCase();
    payload.deadToolReplacements = payload.deadToolReplacements.filter(
      (item) =>
        item.category.toLowerCase().includes(q) ||
        item.legacyToolName.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
    );
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(payload);
}
