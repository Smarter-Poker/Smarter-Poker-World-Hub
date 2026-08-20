/**
 * Player tournament API - catch-all passthrough proxy to the canonical
 * commander app (2026-08-19).
 *
 * WHY THIS EXISTS
 * ---------------
 * The player-facing tournament pages (/hub/commander/tournaments,
 * /hub/commander/tournament/[id]/{clock,my-status,register},
 * /hub/my-tournaments) fetch /api/commander/tournaments/* on smarter.poker.
 * The local implementations of those routes were deleted and the rewrite to
 * commander.smarter.poker was removed, so every fetch 404'd. The fetches are
 * wrapped in .catch(() => ({ ok: false })), so the failure was silent:
 * players saw permanently empty tournament lists, dead clocks, and dead
 * my-status pages. This file restores the routes as a thin proxy.
 *
 * The real handlers live on https://commander.smarter.poker, whose own
 * next.config rewrites /api/commander/:path* to /api/:path* - so the
 * canonical upstream base is https://commander.smarter.poker/api/tournaments.
 *
 * ROUTES COVERED (optional catch-all; undefined path = the list endpoint)
 *   GET    /api/commander/tournaments?status=active
 *   GET    /api/commander/tournaments/my
 *   GET    /api/commander/tournaments/:id
 *   GET    /api/commander/tournaments/:id/clock
 *   GET    /api/commander/tournaments/:id/entries
 *   POST   /api/commander/tournaments/:id/entries
 *   DELETE /api/commander/tournaments/:id/entries   ({ entry_id } in body)
 *   POST   /api/commander/tournaments/:id/story
 *   GET    /api/commander/tournaments/:id/my-chips   (own entry + alternates queue position)
 *   POST   /api/commander/tournaments/:id/my-chips
 *
 * Follows the hardened proxy pattern from
 * pages/api/commander/home-games/join/[code].js:
 *   - explicit method allowlist (405 + Allow otherwise)
 *   - rate limited (read limit for GET, write limit for mutations)
 *   - forwards Authorization + Content-Type ONLY; the cookie jar and
 *     x-staff-session are deliberately NOT forwarded (player-only surface)
 *   - path segments shape-validated and encoded before interpolation
 *   - 10s upstream timeout via AbortController
 *   - upstream status + body returned unchanged; Retry-After and
 *     WWW-Authenticate relayed so 429/401 signals survive the hop
 *   - 502 UPSTREAM_UNREACHABLE on network failure/timeout
 *
 * Pure fetch proxy - no Supabase client needed.
 */
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const UPSTREAM_BASE = 'https://commander.smarter.poker/api/tournaments';
const ALLOWED_METHODS = ['GET', 'POST', 'DELETE'];
const BODY_METHODS = ['POST', 'DELETE'];
const UPSTREAM_TIMEOUT_MS = 10_000;

// Path segments are uuids or short route words (my, clock, entries, story,
// my-chips). Loose enough to survive new sub-routes, strict enough to reject
// junk before it reaches the upstream.
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} is not supported.` },
    });
  }

  // Optional catch-all: undefined = /api/commander/tournaments (list endpoint).
  const rawPath = req.query.path;
  const segments = rawPath === undefined ? [] : Array.isArray(rawPath) ? rawPath : [rawPath];
  for (const seg of segments) {
    if (typeof seg !== 'string' || !SEGMENT_PATTERN.test(seg)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PATH', message: 'That tournament path is not valid.' },
      });
    }
  }

  // Preserve the original query string exactly (req.url is the raw request
  // URL in pages API routes, so it never contains the synthetic `path` param).
  const qIndex = (req.url || '').indexOf('?');
  const queryString = qIndex >= 0 ? req.url.slice(qIndex) : '';

  const suffix = segments.map(encodeURIComponent).join('/');
  const target = `${UPSTREAM_BASE}${suffix ? `/${suffix}` : ''}${queryString}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    // Authorization (player JWT) only - cookies and x-staff-session are
    // deliberately NOT forwarded across origins from this player surface.
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;

    // Next parses JSON bodies into objects, but leaves text/* and unparsed
    // bodies as strings or Buffers. Re-stringifying those would double-encode
    // the payload, so pass them through untouched.
    let body;
    if (BODY_METHODS.includes(req.method)) {
      const raw = req.body;
      body = (typeof raw === 'string' || Buffer.isBuffer(raw))
        ? raw
        : JSON.stringify(raw || {});
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');

    // Relay signals the client needs to behave correctly (429 backoff, 401).
    for (const h of ['retry-after', 'www-authenticate']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    return res.send(text);
  } catch (err) {
    console.warn('tournaments proxy error:', err?.message || err);
    return res.status(502).json({
      success: false,
      error: { code: 'UPSTREAM_UNREACHABLE', message: 'Tournament Service Unreachable' },
    });
  } finally {
    clearTimeout(timeout);
  }
}
