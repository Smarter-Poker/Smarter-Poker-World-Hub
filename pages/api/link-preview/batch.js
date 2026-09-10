// Batch link-preview endpoint — collapses N individual /api/link-preview
// calls into a single POST request, eliminating the N+1 Sentry performance
// alert on pages like /hub/social-media that render many link-cards at once.
//
// POST /api/link-preview/batch
// Body: { urls: string[] }          (max 20 per request)
// Response: { results: Record<string, LinkPreviewResult | null> }
//
// Each value is identical to what the single GET endpoint returns, or null
// if the URL is blocked/invalid. The key is the original URL string.
// Sentry issue #7720346314 — N+1 API Call at /api/link-preview?url=* (2026-09-10).

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');

// SSRF protection (mirrors the single endpoint)
function isBlockedUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) return true;
    const hostname = parsed.hostname.toLowerCase();
    const blocked = [
      '169.254.169.254', 'metadata.google.internal', '100.100.100.200',
      'localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1',
    ];
    if (blocked.includes(hostname)) return true;
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number);
      if (a === 0 || a === 10 || a === 127) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;
    }
    if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/i.test(hostname)) return true;
    if (parts.some((p) => p.startsWith('0') && p.length > 1 && /^\d+$/.test(p))) return true;
    return false;
  } catch {
    return true;
  }
}

const MAX_BATCH = 20;

export default async function handler(req, res) {
  if (!applyCors(req, res, { methods: 'POST', headers: 'Content-Type, Authorization' })) return;
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'Body must be { urls: string[] }' });
  }
  if (urls.length > MAX_BATCH) {
    return res.status(400).json({ error: `Batch limited to ${MAX_BATCH} URLs` });
  }

  // Deduplicate and validate input
  const unique = [...new Set(urls.filter((u) => typeof u === 'string' && u.trim()))];

  // Base URL for internal calls (Vercel sets this automatically in production)
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // Fetch all previews in parallel, delegating to the single-URL endpoint
  // so all caching, SSRF, and fallback logic is reused without duplication.
  const results = await Promise.all(
    unique.map(async (url) => {
      if (isBlockedUrl(url)) return [url, null];
      try {
        const singleRes = await fetch(
          `${baseUrl}/api/link-preview?url=${encodeURIComponent(url)}`,
          { headers: { 'x-internal-batch': '1' } }
        );
        if (!singleRes.ok) return [url, null];
        const data = await singleRes.json();
        return [url, data];
      } catch {
        return [url, null];
      }
    })
  );

  // CDN-cache the batch response for 24h (same policy as the single endpoint)
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, max-age=3600, stale-while-revalidate=86400'
  );

  return res.status(200).json({
    results: Object.fromEntries(results),
  });
}
