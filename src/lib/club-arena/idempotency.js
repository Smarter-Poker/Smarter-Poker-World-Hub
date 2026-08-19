/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ORB-1 Idempotency Guard
 *
 * In-memory TTL cache to prevent laggy mobile-network double-charges.
 * All ORB-1 POST routes (buyin, request-cashout, transfer-chips) MUST
 * call checkIdempotency() at the top of their handler.
 *
 * Client sends: X-Idempotency-Key header (UUID)
 * Server:       If key seen within TTL → return cached response.
 *               Otherwise → proceed, then cache the response via cacheResponse().
 *
 * NOTE: In-memory Map is scoped per serverless instance. This is sufficient
 * for preventing rapid double-taps from the same client on the same instance.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const TTL_MS = 5 * 60 * 1000; // 5 minutes

/** @type {Map<string, { status: number, body: object, expiresAt: number }>} */
const cache = new Map();

// Lazy reaper — cleans expired entries every 60s
let _reaperStarted = false;
function ensureReaper() {
  if (_reaperStarted) return;
  _reaperStarted = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (now >= entry.expiresAt) cache.delete(key);
    }
  }, 60_000).unref();
}

/**
 * Check for a duplicate request via X-Idempotency-Key.
 * If the key is missing → reject with 400.
 * If the key was already seen → replay cached response and return true.
 * Otherwise → return false (caller should proceed).
 *
 * @param {import('next').NextApiRequest} req
 * @param {import('next').NextApiResponse} res
 * @returns {boolean} true if request was handled (duplicate or missing key), false if new
 */
function checkIdempotency(req, res) {
  ensureReaper();

  const key = req.headers['x-idempotency-key'];
  if (!key || typeof key !== 'string' || key.length < 8) {
    res.status(400).json({ success: false, error: 'X-Idempotency-Key header required' });
    return true; // handled
  }

  const cached = cache.get(key);
  if (cached) {
    if (cached.status === 'processing') {
      res.status(409).json({ success: false, error: 'Duplicate request is currently processing. Please wait.' });
      return true; // handled
    }
    if (Date.now() < cached.expiresAt) {
      res.status(cached.status).json(cached.body);
      return true; // replayed
    }
  }

  // Eagerly lock this key synchronously to prevent same-millisecond race conditions
  cache.set(key, { status: 'processing', body: null, expiresAt: Date.now() + TTL_MS });

  // Auto-cache the response when the route completes successfully
  const originalJson = res.json;
  res.json = function (body) {
    const status = res.statusCode || 200;
    // 2026-08-19 audit 5: caching 5xx made a transient failure permanent for the
    // TTL. A retry with the same key replayed "Purchase failed" even though the
    // original request had committed. Client errors (4xx) ARE cached: those are
    // deterministic answers ("already own this", "sold out") worth replaying.
    if (status < 500) {
      cacheResponse(req, status, body);
    } else {
      try { cache.delete(key); } catch (_e) { /* best effort */ }
    }
    return originalJson.call(this, body);
  };

  return false; // new request — proceed
}

/**
 * Cache a successful (or meaningful) response for replay.
 *
 * @param {import('next').NextApiRequest} req
 * @param {number} status  HTTP status code
 * @param {object} body    JSON response body
 */
function cacheResponse(req, status, body) {
  const key = req.headers['x-idempotency-key'];
  if (!key) return;
  cache.set(key, { status, body, expiresAt: Date.now() + TTL_MS });
}

module.exports = { checkIdempotency, cacheResponse };
