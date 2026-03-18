/**
 * Poker API Rate Limiter
 * In-memory rate limiting for poker/club-arena endpoints.
 * Prevents abuse without external dependencies.
 */

const WINDOW_MS = 60 * 1000; // 1 minute window
const DEFAULT_LIMIT = 60;     // 60 requests per minute

const ENDPOINT_LIMITS = {
  // Game actions (already rate-limited by AntiCheat, this is backup)
  'poker/engine/action': 120,
  'poker/engine/seat': 30,
  'poker/engine/state': 120,
  'poker/engine/connect': 20,
  'poker/engine/club-connect': 20,
  'poker/engine/tables': 60,
  'poker/engine/tournament': 30,
  // Club management (lower limits)
  'club-arena/create-club': 5,
  'club-arena/create-table': 10,
  'club-arena/join-club': 10,
  'club-arena/distribute-chips': 20,
  'club-arena/mint-chips': 10,
  'club-arena/clawback-chips': 10,
  'club-arena/approve-cashout': 20,
  'club-arena/request-cashout': 10,
  'club-arena/manage-agent': 20,
  'club-arena/settle-period': 5,
  'club-arena/delete-club': 3,
};

// In-memory store: { key: { count, resetAt } }
const store = new Map();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a request.
 * @param {string} identifier - User ID or IP
 * @param {string} endpoint - Endpoint path key
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
function checkRateLimit(identifier, endpoint) {
  const limit = ENDPOINT_LIMITS[endpoint] || DEFAULT_LIMIT;
  const key = `${identifier}:${endpoint}`;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(key, entry);
  }

  entry.count++;

  if (entry.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit,
    };
  }

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
    limit,
  };
}

/**
 * Apply rate limit headers and check.
 * Returns true if request should proceed, false if rate limited.
 * @param {Object} req - Next.js request
 * @param {Object} res - Next.js response
 * @param {string} endpoint - Endpoint key
 * @returns {boolean}
 */
function applyRateLimit(req, res, endpoint) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
  // BUG #259 FIX: Never trust client-supplied x-user-id for rate limiting.
  // Attackers could send different x-user-id values to get separate rate limit buckets.
  // Use IP as the identifier. Authenticated userId can be passed explicitly as 4th arg.
  const userId = ip;

  const result = checkRateLimit(userId, endpoint);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

  if (!result.allowed) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    });
    return false;
  }

  return true;
}

module.exports = { checkRateLimit, applyRateLimit, ENDPOINT_LIMITS };
