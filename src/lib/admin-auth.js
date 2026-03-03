/**
 * Admin Auth Middleware
 * 
 * Protects admin endpoints. Requires EITHER:
 *   1. x-admin-secret header matching ADMIN_ROUTE_SECRET env var
 *   2. Bearer token for a user with role 'admin' or 'superadmin' in profiles
 *
 * Usage:
 *   import { requireAdminAuth } from '../../../src/lib/admin-auth';
 *   const authResult = await requireAdminAuth(req, res);
 *   if (!authResult.authorized) return; // Response already sent
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function requireAdminAuth(req, res) {
  // Method 1: Admin secret header (for internal/cron calls)
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret && process.env.ADMIN_ROUTE_SECRET && adminSecret === process.env.ADMIN_ROUTE_SECRET) {
    return { authorized: true, method: 'admin_secret' };
  }

  // Method 2: JWT for platform admin
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Admin authentication required' });
    return { authorized: false };
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: 'Invalid token' });
      return { authorized: false };
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
      res.status(403).json({ error: 'Platform admin role required' });
      return { authorized: false };
    }

    return { authorized: true, method: 'jwt', userId: user.id };
  } catch (err) {
    res.status(500).json({ error: 'Auth check failed' });
    return { authorized: false };
  }
}
