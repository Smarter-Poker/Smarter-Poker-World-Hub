/**
 * Admin auth middleware.
 * All /api/admin/* endpoints MUST call this before executing.
 * 
 * Validates either:
 *   1. ADMIN_SECRET header matches env var (for cron/scripts)
 *   2. Bearer JWT belongs to a known admin user
 * 
 * Usage:
 *   import { requireAdmin } from '../../../src/lib/adminAuth';
 *   const auth = await requireAdmin(req, res);
 *   if (!auth) return;
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Admin user IDs - should be in env var in production
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);

export async function requireAdmin(req, res) {
  // Method 1: Admin secret header (for cron jobs, scripts)
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret && process.env.ADMIN_SECRET && adminSecret === process.env.ADMIN_SECRET) {
    return { method: 'secret' };
  }

  // Method 2: Bearer JWT for known admin user
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) {
      if (ADMIN_USER_IDS.includes(user.id)) {
        return { method: 'jwt', userId: user.id };
      }
    }
  }

  res.status(401).json({ error: 'Admin access required' });
  return null;
}
