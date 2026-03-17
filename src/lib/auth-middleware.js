/**
 * Shared JWT Auth Middleware for Social API routes
 *
 * CONSOLIDATION: This replaces 18 copy-pasted auth blocks across 12 social
 * API route files. All routes now import from this single source of truth.
 *
 * Usage in any API endpoint:
 *   import { requireAuth, optionalAuth } from '../../src/lib/auth-middleware';
 *
 *   export default async function handler(req, res) {
 *     const user = await requireAuth(req, res);
 *     if (!user) return; // 401 already sent
 *     const userId = user.id;
 *     ...
 *   }
 */

import { createClient } from './supabaseServerClient';

let _supabase = null;

function getAuthSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Extract and validate a JWT from the Authorization header.
 * Returns the authenticated user object, or null (after sending 401).
 *
 * Response format matches social API convention: { success: false, error: '...' }
 *
 * @param {object} req - Next.js API request
 * @param {object} res - Next.js API response
 * @param {object} [supabaseClient] - Optional: use caller's Supabase client instead of shared one
 * @returns {Promise<object|null>} user object or null
 */
export async function requireAuth(req, res, supabaseClient) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }

  const sb = supabaseClient || getAuthSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return null;
  }

  return user;
}

/**
 * Optional auth — returns user if token present and valid, null otherwise.
 * Does NOT send a 401 response. Useful for endpoints that behave
 * differently for authenticated vs anonymous users (e.g., GET with
 * personalized data).
 *
 * @param {object} req - Next.js API request
 * @param {object} [supabaseClient] - Optional: use caller's Supabase client
 * @returns {Promise<object|null>} user object or null
 */
export async function optionalAuth(req, supabaseClient) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const sb = supabaseClient || getAuthSupabase();
  const { data: { user } } = await sb.auth.getUser(token);
  return user || null;
}

/**
 * Auth with internal secret fallback — for server-to-server calls.
 * Checks x-internal-secret header against CRON_SECRET first.
 * If matched, trusts the user_id from request body.
 * Otherwise, falls back to JWT auth.
 *
 * @param {object} req - Next.js API request
 * @param {object} res - Next.js API response
 * @returns {Promise<string|null>} verified user ID or null (after sending 401)
 */
export async function requireAuthOrInternal(req, res) {
  const internalSecret = req.headers['x-internal-secret'];
  if (internalSecret && internalSecret === process.env.CRON_SECRET) {
    // Server-to-server call — trust user_id from body
    return req.body.user_id || null;
  }

  const user = await requireAuth(req, res);
  return user ? user.id : null;
}
