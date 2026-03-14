/**
 * Commander API Route Auth Middleware
 * Wraps an API route handler with automatic Authorization header validation
 * and full Supabase JWT verification.
 *
 * Usage:
 *   import { withCommanderAuth } from '@/lib/commander/withCommanderAuth';
 *   export default withCommanderAuth(async (req, res) => {
 *     // req.token     = the verified Bearer token
 *     // req.user      = the authenticated Supabase user object
 *     // req.staff     = the commander_staff row { venue_id, role, ... }
 *     // req.venueId   = shortcut for req.staff.venue_id
 *     res.json({ success: true });
 *   });
 *
 * Features:
 * - Validates Authorization: Bearer <token> header
 * - Returns 401 if missing/invalid/null/undefined
 * - Verifies JWT via supabase.auth.getUser(token)
 * - Checks commander_staff table for active staff membership
 * - Returns 403 if user is not active staff
 * - Attaches req.token, req.user, req.staff, req.venueId
 *
 * Options:
 *   withCommanderAuth(handler, { skipStaffCheck: true })
 *   — Skips the commander_staff lookup (for routes that only need user auth)
 */
import { createClient } from '../supabaseServerClient';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * @param {Function} handler - (req, res) => Promise<void>
 * @param {Object} [options]
 * @param {boolean} [options.skipStaffCheck] - Skip commander_staff lookup
 * @returns {Function} wrapped handler
 */
export function withCommanderAuth(handler, options = {}) {
  return async function authedHandler(req, res) {
    try {
      // 1. Extract and validate Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          error: 'Authorization required — missing or invalid Bearer token',
        });
      }

      const token = authHeader.replace('Bearer ', '').trim();
      if (!token || token === 'null' || token === 'undefined' || token === '') {
        return res.status(401).json({
          success: false,
          error: 'Authorization required — empty or null token',
        });
      }

      // 2. Verify JWT via Supabase
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      // 3. Attach token and user
      req.token = token;
      req.user = user;

      // 4. Check commander_staff (unless skipped)
      if (!options.skipStaffCheck) {
        const { data: staff } = await supabase
          .from('commander_staff')
          .select('id, venue_id, role, is_active, display_name')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (!staff) {
          return res.status(403).json({
            success: false,
            error: 'Staff access required — no active staff record found',
          });
        }

        req.staff = staff;
        req.venueId = staff.venue_id || '';
      }

      // 5. Parse x-staff-session header (for backward compatibility)
      const staffSessionRaw = req.headers['x-staff-session'] || '';
      try {
        req.staffSession = staffSessionRaw ? JSON.parse(staffSessionRaw) : {};
      } catch {
        req.staffSession = {};
      }

      // 6. Call the actual handler
      return await handler(req, res);
    } catch (err) {
      console.error('[withCommanderAuth]', err);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
