/**
 * Join-by-code - passthrough proxy to the canonical commander handler.
 *
 * HISTORY
 * -------
 * 2026-07-25: this file previously held a stale POST-only reimplementation of
 * the commander join-by-code route. Because Next.js filesystem routes take
 * precedence over vercel.json rewrites, it SHADOWED the real
 * commander.smarter.poker handler: GET lookups 405'd, POST returned a
 * different shape than the client expects, and the join bypassed the
 * join_home_group RPC's validation and rate limiting. It was reduced to a
 * forwarding proxy. (The file must remain until repo tooling can delete it -
 * deleting it would let the vercel.json rewrite do this forwarding natively.)
 *
 * 2026-08-12 audit: the forwarding proxy itself was the least-defended
 * endpoint in the repo. Five HIGH findings, all fixed below.
 *
 *   1. METHOD PASSTHROUGH (§7.1). `method: req.method` forwarded DELETE /
 *      PATCH / PUT / OPTIONS / HEAD verbatim despite the docblock claiming
 *      GET+POST only. Now an explicit allowlist with a 405 + Allow header.
 *
 *   2. COOKIE FORWARDING (§7.2). The entire smarter.poker cookie jar was
 *      copied into a server-to-server request to a DIFFERENT origin,
 *      bypassing the browser's own SameSite/Domain scoping. `Authorization`
 *      is already forwarded and is the credential the upstream actually
 *      uses, so the cookie header is simply dropped.
 *
 *   3. DROPPED IDEMPOTENCY KEY (§7.3). The client generates an
 *      `X-Idempotency-Key` for joins, but the header allowlist silently
 *      discarded it - making the documented idempotency guarantee fiction
 *      and allowing a double-tap to produce two join attempts.
 *
 *   4. NO RATE LIMIT (§7.4). This was the ONLY endpoint in the repo with no
 *      limiter, in front of an invite-code oracle over a 6-8 character
 *      space. Now LIMITS.auth (10/min).
 *
 *   5. UNVALIDATED CODE (§7.5). `code` was interpolated unchecked: an array
 *      became "a,b" and a missing value became the literal string
 *      "undefined", both of which were faithfully forwarded upstream. There
 *      was no SSRF (encodeURIComponent pins the path segment), but the
 *      upstream was doing lookups on garbage. Now shape-validated.
 *
 * Also relays upstream Retry-After / WWW-Authenticate so the client can see
 * upstream rate-limit and auth signals instead of a bare status code (§7.7).
 */
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

const ALLOWED_METHODS = ['GET', 'POST'];

// Invite codes are short alphanumeric tokens (documented as 6-8 chars; the
// bound is deliberately loose so a future length change does not 400 every
// join, but strict enough to reject junk before it reaches the upstream).
const CODE_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;

export default async function handler(req, res) {
  // (4) Invite-code oracle - rate limit before doing any work.
  if (!applyRateLimit(req, res, LIMITS.auth)) return;

  // (1) Explicit method allowlist.
  if (!ALLOWED_METHODS.includes(req.method)) {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} is not supported.` },
    });
  }

  // (5) Validate the code before it is used for anything.
  const rawCode = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!CODE_PATTERN.test(code)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CODE', message: 'That invite code is not valid.' },
    });
  }

  const target = `https://commander.smarter.poker/api/home-games/join/${encodeURIComponent(code)}`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    // (2) Authorization only - the cookie jar is deliberately NOT forwarded.
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;
    if (req.headers['x-staff-session']) headers['x-staff-session'] = req.headers['x-staff-session'];
    // (3) Preserve the client's idempotency key.
    if (req.headers['x-idempotency-key']) {
      headers['X-Idempotency-Key'] = req.headers['x-idempotency-key'];
    }

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');

    // (§7.7) Relay signals the client needs to behave correctly. Without
    // these an upstream 429 looks identical to a generic failure.
    for (const h of ['retry-after', 'www-authenticate']) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    return res.send(text);
  } catch (err) {
    console.warn('join-by-code proxy error:', err?.message || err);
    return res.status(502).json({
      success: false,
      error: { code: 'UPSTREAM_ERROR', message: 'Could not reach the join service. Please try again.' },
    });
  }
}
