/**
 * IndexNow Instant Search Submission Manifest Endpoint
 * GET /api/seo/indexnow
 */
import {
  INDEXNOW_PRIORITY_URLS,
  buildIndexNowPayload,
} from './outreach-generator.js';

export { INDEXNOW_PRIORITY_URLS, buildIndexNowPayload };

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json(buildIndexNowPayload());
}
