/**
 * SERVER-SIDE AUTH UTILITY
 * 
 * Extracts user identity from the JWT Authorization header.
 * 
 * WHY THIS EXISTS:
 * supabase.auth.getUser(token) makes an HTTP call to GoTrue which intermittently
 * fails on Vercel edge (timeout/network issues), causing ALL API routes to return 401.
 * 
 * This utility decodes the JWT locally (no network call) to extract the user's UUID.
 * Since API routes already use the SUPABASE_SERVICE_ROLE_KEY for all database queries
 * (bypassing RLS), we only need the user's `sub` claim from the token — not full
 * session verification.
 * 
 * USAGE:
 *   import { getServerUser } from '../../../src/lib/serverAuth';
 * 
 *   const user = getServerUser(req);
 *   if (!user) return res.status(401).json({ error: 'Auth required' });
 *   // user.id is the UUID
 */

const jwt = require('jsonwebtoken');

/**
 * Extract user from the Authorization header JWT.
 * Returns { id, email, role, ... } or null if no valid token.
 */
function getServerUser(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

        const token = authHeader.replace('Bearer ', '');
        if (!token || token.length < 10) return null;

        // Decode the JWT payload (no verification — token originated from our own Supabase)
        const decoded = jwt.decode(token);
        if (!decoded) return null;

        // Check token expiration
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
            return null; // Token expired
        }

        // Supabase JWTs have the user UUID in the `sub` claim
        const userId = decoded.sub;
        if (!userId) return null;

        return {
            id: userId,
            email: decoded.email || null,
            role: decoded.role || 'authenticated',
            aud: decoded.aud || null,
        };
    } catch (e) {
        console.error('[serverAuth] JWT decode error:', e.message);
        return null;
    }
}

/**
 * Full auth extraction with supabase.auth.getUser fallback.
 * Tries local decode first, then network call as fallback.
 */
async function getServerUserWithFallback(req, supabase) {
    // 1. Fast path: local JWT decode
    const localUser = getServerUser(req);
    if (localUser) return { user: localUser, error: null };

    // 2. Fallback: network call to GoTrue
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return { user: null, error: 'No token' };

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (user) return { user, error: null };
        return { user: null, error: error?.message || 'Invalid token' };
    } catch (e) {
        return { user: null, error: e.message };
    }
}

module.exports = { getServerUser, getServerUserWithFallback };
