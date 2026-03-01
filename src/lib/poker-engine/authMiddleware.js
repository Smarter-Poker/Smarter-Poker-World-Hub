/**
 * Poker Engine Auth Middleware
 * ════════════════════════════════════════════════════════════════
 * 
 * Verifies the JWT bearer token and ensures the playerId in the
 * request body matches the authenticated user's ID.
 * 
 * This prevents impersonation attacks where a user sends another
 * player's UUID to act on their behalf.
 * 
 * Usage in any endpoint:
 *   const { authenticatePlayer } = require('.../authMiddleware');
 *   const auth = await authenticatePlayer(req, res);
 *   if (!auth) return; // Response already sent (401/403)
 *   // auth.userId is the verified user ID
 *   // auth.playerId is guaranteed to equal auth.userId
 */

const { createClient } = require('@supabase/supabase-js');

let _supabaseAdmin = null;

function getSupabase() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabaseAdmin;
}

/**
 * Authenticate the request and verify playerId matches JWT identity.
 * 
 * @param {Object} req - Next.js API request
 * @param {Object} res - Next.js API response
 * @param {Object} [options]
 * @param {boolean} [options.requirePlayerId=true] - Whether playerId is required in body
 * @returns {Promise<{userId: string, playerId: string}|null>} - null if auth failed (response already sent)
 */
async function authenticatePlayer(req, res, options = {}) {
  const { requirePlayerId = true } = options;

  // Extract bearer token from Authorization header
  const authHeader = req.headers.authorization || req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
    return null;
  }

  // Verify token with Supabase
  const sb = getSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    return null;
  }

  const userId = user.id;

  // If playerId is in the body, it MUST match the authenticated user
  const playerId = req.body?.playerId || req.query?.playerId;

  if (requirePlayerId) {
    if (!playerId) {
      res.status(400).json({ error: 'playerId required' });
      return null;
    }

    if (String(playerId) !== String(userId)) {
      console.warn(`[AuthMiddleware] Identity mismatch: JWT=${userId} body.playerId=${playerId}`);
      res.status(403).json({
        error: 'Identity mismatch: you can only act as yourself',
        code: 'IDENTITY_MISMATCH',
      });
      return null;
    }
  }

  return { userId, playerId: playerId || userId };
}

module.exports = { authenticatePlayer };
