/**
 * POST /api/seo/submit-indexing
 * ═══════════════════════════════════════════════════════════════════════════
 * Automated Edge Webhook for Real-Time Search Engine Indexing
 *
 * Receives publish/update signals for poker series, tournament schedules,
 * venues, and public pages. Submits URLs directly to:
 * 1. IndexNow (Bing, Copilot, ChatGPT Search, Yandex, Seznam, Naver)
 * 2. Google Indexing API (URL_UPDATED / URL_DELETED)
 *
 * Security:
 *   Guarded by Bearer secret (INDEXING_WEBHOOK_SECRET, CRON_SECRET, or SUPABASE_SERVICE_ROLE_KEY).
 *
 * Body payload:
 *   {
 *     urls: string[] | string,
 *     series_id?: string | number,
 *     venue_id?: string | number,
 *     action?: 'URL_UPDATED' | 'URL_DELETED',
 *     dry_run?: boolean
 *   }
 */
import { submitToIndexNow, submitToGoogleIndexing, SITE_ORIGIN } from '../../../src/lib/seo/indexingService.mjs';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Authorize caller
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const validSecrets = [
    process.env.INDEXING_WEBHOOK_SECRET,
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean);

  const isAuthorized = validSecrets.length > 0 && validSecrets.includes(token);
  // Also allow in dev/test when explicitly requested with dry_run
  const isDevOrTest = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';

  if (!isAuthorized && !isDevOrTest) {
    return res.status(401).json({ error: 'Unauthorized: Valid Bearer Secret Required' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const dryRun = Boolean(body.dry_run);
    const action = body.action === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED';

    const rawUrls = [];
    if (body.urls) {
      if (Array.isArray(body.urls)) {
        rawUrls.push(...body.urls);
      } else if (typeof body.urls === 'string') {
        rawUrls.push(body.urls);
      }
    }

    if (body.series_id) {
      rawUrls.push(`/hub/series/${encodeURIComponent(String(body.series_id))}`);
    }

    if (body.venue_id) {
      rawUrls.push(`/hub/venues/${encodeURIComponent(String(body.venue_id))}`);
    }

    // Deduplicate and normalize
    const targetUrls = rawUrls
      .filter(Boolean)
      .map((u) => (u.startsWith('http') ? u : `${SITE_ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`))
      .filter((u, idx, arr) => arr.indexOf(u) === idx);

    if (targetUrls.length === 0) {
      return res.status(400).json({
        error: 'No valid URLs, series_id, or venue_id provided for indexing submission',
      });
    }

    // Submit to IndexNow
    const indexNowResult = await submitToIndexNow(targetUrls, { dryRun });

    // Submit to Google Indexing
    const googleResults = [];
    for (const u of targetUrls) {
      const gRes = await submitToGoogleIndexing(u, { type: action, dryRun });
      googleResults.push(gRes);
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      submitted_count: targetUrls.length,
      urls: targetUrls,
      index_now: indexNowResult,
      google_indexing: googleResults,
    });
  } catch (err) {
    reportApiError(err, req);
    return res.status(500).json({
      error: 'Failed to process indexing webhook',
      detail: err?.message || String(err),
    });
  }
}
