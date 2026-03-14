/**
 * Commander API Route Auth Middleware
 * Wraps an API route handler with automatic Authorization header validation.
 *
 * Usage:
 *   import { withCommanderAuth } from '@/lib/commander/withCommanderAuth';
 *   export default withCommanderAuth(async (req, res) => {
 *     // req.token  = the extracted Bearer token
 *     // req.staffSession = parsed staff session object
 *     // req.venueId = extracted venue_id from staff session
 *     res.json({ success: true });
 *   });
 *
 * Features:
 * - Validates Authorization: Bearer <token> header
 * - Returns 401 if missing/invalid
 * - Parses x-staff-session header into req.staffSession object
 * - Extracts req.venueId from the staff session
 * - Only validates auth — does NOT verify the JWT against Supabase
 *   (that should be done by the handler if needed)
 */

/**
 * @param {Function} handler - (req, res) => Promise<void>
 * @returns {Function} wrapped handler
 */
export function withCommanderAuth(handler) {
  return async function authedHandler(req, res) {
    // 1. Extract and validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required — missing or invalid Bearer token',
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({
        success: false,
        error: 'Authorization required — empty or null token',
      });
    }

    // 2. Parse staff session
    const staffSessionRaw = req.headers['x-staff-session'] || '';
    let staffSession = {};
    try {
      staffSession = staffSessionRaw ? JSON.parse(staffSessionRaw) : {};
    } catch {
      staffSession = {};
    }

    // 3. Attach to request
    req.token = token;
    req.staffSession = staffSession;
    req.venueId = staffSession.venue_id || '';

    // 4. Call the actual handler
    return handler(req, res);
  };
}
