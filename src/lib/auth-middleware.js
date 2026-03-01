/**
 * Shared JWT Auth Middleware
 * 
 * Usage in any API endpoint:
 *   import { requireAuth } from '../../src/lib/auth-middleware';
 *   
 *   export default async function handler(req, res) {
 *     const user = await requireAuth(req, res);
 *     if (!user) return; // 401 already sent
 *     const userId = user.id;
 *     ...
 *   }
 */

import { createClient } from '@supabase/supabase-js';

let _supabase = null;

function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return _supabase;
}

/**
 * Extract JWT from Authorization header or Supabase cookie.
 * Returns the authenticated user or null (and sends 401).
 */
export async function requireAuth(req, res) {
  // Try Bearer token first
  let token = req.headers.authorization?.replace('Bearer ', '');
  
  // Fallback: try Supabase auth cookie
  if (!token) {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/sb-[^=]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        token = parsed?.[0] || parsed?.access_token;
      } catch {}
    }
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const sb = getSupabase();
  const { data: { user }, error } = await sb.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  return user;
}

/**
 * Optional auth — returns user if authenticated, null if not.
 * Does NOT send a 401 response.
 */
export async function optionalAuth(req) {
  let token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    const cookies = req.headers.cookie || '';
    const match = cookies.match(/sb-[^=]+-auth-token=([^;]+)/);
    if (match) {
      try {
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        token = parsed?.[0] || parsed?.access_token;
      } catch {}
    }
  }
  if (!token) return null;

  const sb = getSupabase();
  const { data: { user } } = await sb.auth.getUser(token);
  return user || null;
}
