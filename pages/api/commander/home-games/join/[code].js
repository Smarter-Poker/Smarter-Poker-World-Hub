/**
 * 2026-07-25 audit fix — passthrough proxy.
 *
 * This file previously held a stale POST-only reimplementation of the
 * commander join-by-code route. Because Next.js filesystem routes take
 * precedence over vercel.json rewrites, it SHADOWED the real
 * commander.smarter.poker handler: GET lookups 405'd, POST returned a
 * different shape than the client expects, and the join bypassed the
 * join_home_group RPC's validation/rate limiting.
 *
 * It now forwards both GET and POST to the canonical commander handler,
 * preserving auth headers and status codes. (The file itself must remain
 * until repo tooling can delete it — deleting it would let the rewrite in
 * vercel.json do this same forwarding natively.)
 */
export default async function handler(req, res) {
  const { code } = req.query;
  const target = `https://commander.smarter.poker/api/home-games/join/${encodeURIComponent(code)}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['x-staff-session']) headers['x-staff-session'] = req.headers['x-staff-session'];
    if (req.headers.cookie) headers.cookie = req.headers.cookie;

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body || {}) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err) {
    console.warn('join-by-code proxy error:', err?.message || err);
    return res.status(502).json({
      success: false,
      error: { code: 'UPSTREAM_ERROR', message: 'Could not reach the join service. Please try again.' },
    });
  }
}
