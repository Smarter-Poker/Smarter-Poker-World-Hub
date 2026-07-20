/**
 * Poker API Rate Limiter — RE-EXPORT SHIM
 * ═══════════════════════════════════════════════════════════════
 * This file is a backward-compatible shim. All logic now lives in
 * the canonical rate limiter at src/lib/apiRateLimit.js.
 *
 * Consumers import { applyRateLimit } from '...RateLimiter' — this
 * preserves that exact API signature while delegating internally.
 * ═══════════════════════════════════════════════════════════════
 */

const { rateLimit, applyRateLimit: _applyRateLimit } = require('../apiRateLimit');

// Endpoint-specific limits (preserved from original + expanded)
const ENDPOINT_LIMITS = {
  // ─── Poker Engine ──────────────────────────────────────────
  'poker/engine/action': 120,
  'poker/engine/seat': 30,
  'poker/engine/state': 120,
  'poker/engine/connect': 20,
  'poker/engine/club-connect': 20,
  'poker/engine/tables': 60,
  'poker/engine/tournament': 30,
  'poker/create-live-table': 10,

  // ─── Club Arena — Read / Dashboard (generous) ──────────────
  'club-arena/cashier-info': 60,
  'club-arena/club-analytics': 120,
  'club-arena/club-health': 120,
  'club-arena/club-leaderboard': 120,
  'club-arena/my-hands': 60,
  'club-arena/player-chip-flow': 60,
  'club-arena/player-retention': 60,
  'club-arena/player-sessions': 60,
  'club-arena/public-clubs': 60,
  'club-arena/settlement-history': 60,
  'club-arena/smart-recommendations': 60,
  'club-arena/table-templates': 30,
  'club-arena/waitlist': 30,
  'club-arena/audit-trail': 60,
  'club-arena/lobby-ordering': 30,
  'club-arena/agent-analytics': 60,

  // ─── Club Arena — Write Operations (moderate) ──────────────
  'club-arena/create-table': 10,
  'club-arena/join-club': 10,
  'club-arena/leave-club': 10,
  'club-arena/buyin': 30,
  'club-arena/distribute-chips': 20,
  'club-arena/distribute-promo': 20,
  'club-arena/promo-wallet': 20,
  'club-arena/manage-agent': 20,
  'club-arena/approve-cashout': 20,
  'club-arena/request-cashout': 10,
  'club-arena/marketplace-items': 30,
  'club-arena/marketplace-purchase': 10,
  'club-arena/club-branding': 10,
  'club-arena/accept-tos': 10,
  'club-arena/agent-credit': 20,

  // ─── Club Arena — Destructive / Financial (tight) ──────────
  'club-arena/mint-chips': 10,
  'club-arena/clawback-chips': 10,
  'club-arena/settle-period': 5,
  'club-arena/delete-club': 3,
  'club-arena/create-club': 5,
};

const DEFAULT_LIMIT = 60;

/**
 * Check rate limit for a request.
 * @param {string} identifier - User ID or IP
 * @param {string} endpoint - Endpoint path key
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
function checkRateLimit(identifier, endpoint) {
  const max = ENDPOINT_LIMITS[endpoint] || DEFAULT_LIMIT;
  // Build a minimal req-like object for the canonical rateLimit()
  const fakeReq = {
    headers: {},
    url: `/${endpoint}`,
    socket: { remoteAddress: identifier },
  };
  const result = rateLimit(fakeReq, { max, windowMs: 60000, scope: `:${endpoint}` });
  return {
    allowed: result.ok,
    remaining: result.remaining,
    resetAt: result.reset,
    limit: max,
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
  const max = ENDPOINT_LIMITS[endpoint] || DEFAULT_LIMIT;
  return _applyRateLimit(req, res, { max, windowMs: 60000, scope: `:${endpoint}` });
}

module.exports = { checkRateLimit, applyRateLimit, ENDPOINT_LIMITS };
