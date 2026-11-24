/**
 * W3C OpenSearch Browser Address-Bar Autocomplete Suggestions Endpoint
 * GET /api/search/suggest?q=...
 */
import {
  OPENSEARCH_SUGGESTION_INDEX,
  buildOpenSearchSuggestPayload,
} from '../seo/outreach-generator.js';

export { OPENSEARCH_SUGGESTION_INDEX, buildOpenSearchSuggestPayload };

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { q = '' } = req.query || {};
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json(buildOpenSearchSuggestPayload(q));
}
