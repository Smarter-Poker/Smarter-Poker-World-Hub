/**
 * Commander Authentication Middleware
 * Reference: IMPLEMENTATION_PHASES.md - Step 1.3
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Get the authenticated user from request
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @returns {object|null} - User object or null
 */
export async function getUser(req, res) {
  try {
    const supabaseServerClient = createPagesServerClient({ req, res });
    const { data: { user } } = await supabaseServerClient.auth.getUser();
    return user;
  } catch (error) {
    console.error('Auth getUser error:', error);
    return null;
  }
}

/**
 * Require authentication - returns 401 if not authenticated
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @returns {object|null} - User object or null (response already sent)
 */
export async function requireAuth(req, res) {
  const user = await getUser(req, res);

  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication Required' }
    });
    return null;
  }

  return user;
}

/**
 * Require staff role at a venue
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @param {string} venueId - Venue ID to check staff membership
 * @param {string[]} allowedRoles - Optional array of allowed roles (default: all staff)
 * @returns {object|null} - Staff object or null (response already sent)
 */
export async function requireStaff(req, res, venueId, allowedRoles = null) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const { data: staff, error } = await supabase
    .from('commander_staff')
    .select('*')
    .eq('venue_id', venueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (error || !staff) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Staff Access Required' }
    });
    return null;
  }

  // Check role if specific roles required
  if (allowedRoles && !allowedRoles.includes(staff.role)) {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: `Requires role: ${allowedRoles.join(' or ')}`
      }
    });
    return null;
  }

  return staff;
}

/**
 * Require manager role at a venue (owner or manager)
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @param {string} venueId - Venue ID to check
 * @returns {object|null} - Staff object or null
 */
export async function requireManager(req, res, venueId) {
  return requireStaff(req, res, venueId, ['owner', 'manager']);
}

/**
 * Require floor staff or higher (owner, manager, or floor)
 * @param {object} req - Next.js request object
 * @param {object} res - Next.js response object
 * @param {string} venueId - Venue ID to check
 * @returns {object|null} - Staff object or null
 */
export async function requireFloor(req, res, venueId) {
  return requireStaff(req, res, venueId, ['owner', 'manager', 'floor']);
}

/**
 * Check if user is staff at any venue (for quick checks)
 * @param {string} userId - User ID to check
 * @returns {boolean} - True if user is staff somewhere
 */
export async function isStaffAnywhere(userId) {
  const { count, error } = await supabase
    .from('commander_staff')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  return !error && count > 0;
}

/**
 * Get all venues where user is staff
 * @param {string} userId - User ID to check
 * @returns {object[]} - Array of venue staff records
 */
export async function getStaffVenues(userId) {
  const { data, error } = await supabase
    .from('commander_staff')
    .select(`
      *,
      poker_venues (
        id,
        name,
        city,
        state
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    console.error('getStaffVenues error:', error);
    return [];
  }

  return data || [];
}

/**
 * Verify PIN and return staff info
 * @param {string} venueId - Venue ID
 * @param {string} pinCode - PIN code to verify
 * @returns {object|null} - Staff object or null
 */
export async function verifyPin(venueId, pinCode) {
  const { data: staff, error } = await supabase
    .from('commander_staff')
    .select(`
      *,
      profiles (
        id,
        display_name,
        avatar_url
      )
    `)
    .eq('venue_id', venueId)
    .eq('pin_code', pinCode)
    .eq('is_active', true)
    .single();

  if (error || !staff) {
    return null;
  }

  return staff;
}

/**
 * Verify staff via x-staff-session header
 * Supports TWO auth flows:
 *   1. PIN-based terminal auth: session has `id` (commander_staff row ID)
 *   2. Owner email/password login: session has `user_id` + `role: 'owner'`
 *
 * @param {object} req - Next.js request object
 * @returns {object} - { staff } on success, { error: { status, code, message } } on failure
 */
export async function verifyStaffSession(req) {
  const staffSession = req.headers['x-staff-session'];
  if (!staffSession) {
    return { error: { status: 401, code: 'AUTH_REQUIRED', message: 'Staff Authentication Required' } };
  }

  let sessionData;
  try {
    sessionData = JSON.parse(staffSession);
  } catch {
    return { error: { status: 401, code: 'INVALID_SESSION', message: 'Invalid Session Format' } };
  }

  // Path 1: PIN-based staff terminal — session contains staff row `id`
  if (sessionData.id) {
    const { data: staff, error: staffError } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role, is_active')
      .eq('id', sessionData.id)
      .eq('is_active', true)
      .single();

    if (staffError || !staff) {
      return { error: { status: 401, code: 'INVALID_STAFF', message: 'Staff Member Not Found Or Inactive' } };
    }

    return { staff };
  }

  // Path 2: Owner login — session contains `user_id` + `role` + `venue_id`
  if (sessionData.user_id && sessionData.venue_id) {
    // First try: look up commander_staff row by user_id
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, venue_id, role, is_active')
      .eq('user_id', sessionData.user_id)
      .eq('venue_id', sessionData.venue_id)
      .eq('is_active', true)
      .single();

    if (staff) {
      return { staff };
    }

    // Fallback for owners: verify via subscription (owners may not have commander_staff rows)
    if (sessionData.role === 'owner') {
      const { data: sub } = await supabase
        .from('commander_subscriptions')
        .select('id, venue_id, owner_id, status')
        .eq('owner_id', sessionData.user_id)
        .eq('venue_id', sessionData.venue_id)
        .in('status', ['active', 'trialing'])
        .single();

      if (sub) {
        // Return a synthetic staff object for the owner
        return {
          staff: {
            id: sessionData.user_id,
            venue_id: sub.venue_id,
            role: 'owner',
            is_active: true,
          }
        };
      }
    }
  }

  return { error: { status: 401, code: 'INVALID_STAFF', message: 'Staff Member Not Found Or Inactive' } };
}

/**
 * Verify staff session and require manager role (owner or manager)
 * @param {object} req - Next.js request object
 * @param {number|string} venueId - Optional venue ID to check membership
 * @returns {object} - { staff } on success, { error } on failure
 */
export async function verifyManagerSession(req, venueId = null) {
  const result = await verifyStaffSession(req);
  if (result.error) return result;

  if (venueId && result.staff.venue_id !== parseInt(venueId)) {
    return { error: { status: 403, code: 'FORBIDDEN', message: 'Not Authorized For This Venue' } };
  }

  if (!['owner', 'manager'].includes(result.staff.role)) {
    return { error: { status: 403, code: 'FORBIDDEN', message: 'Manager Role Required' } };
  }

  return result;
}

// Default permissions by role
export const DEFAULT_PERMISSIONS = {
  owner: {
    manage_staff: true,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: true,
    view_analytics: true,
    send_notifications: true
  },
  manager: {
    manage_staff: true,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: true,
    view_analytics: true,
    send_notifications: true
  },
  floor: {
    manage_staff: false,
    manage_games: true,
    manage_waitlist: true,
    manage_settings: false,
    view_analytics: false,
    send_notifications: true
  },
  brush: {
    manage_staff: false,
    manage_games: false,
    manage_waitlist: true,
    manage_settings: false,
    view_analytics: false,
    send_notifications: true
  },
  dealer: {
    manage_staff: false,
    manage_games: false,
    manage_waitlist: false,
    manage_settings: false,
    view_analytics: false,
    send_notifications: false
  }
};

/**
 * Get effective permissions for a staff member
 * @param {object} staff - Staff record
 * @returns {object} - Merged permissions
 */
export function getEffectivePermissions(staff) {
  return {
    ...DEFAULT_PERMISSIONS[staff.role] || {},
    ...(staff.permissions || {})
  };
}

/**
 * Guard: require staff auth or send 401. Returns staff or null.
 * Usage: const staff = await guardStaff(req, res); if (!staff) return;
 */
export async function guardStaff(req, res) {
  const result = await verifyStaffSession(req);
  if (result.error) {
    res.status(result.error.status || 401).json({ success: false, error: result.error });
    return null;
  }
  return result.staff;
}

/**
 * Guard: require manager auth or send 401/403. Returns staff or null.
 */
export async function guardManager(req, res) {
  const result = await verifyManagerSession(req);
  if (result.error) {
    res.status(result.error.status || 401).json({ success: false, error: result.error });
    return null;
  }
  return result.staff;
}

/**
 * Guard: require Supabase user auth or send 401. Returns user or null.
 * For player-facing endpoints (not staff).
 */
export async function guardUser(req, res) {
  const user = await getUser(req, res);
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication Required' } });
    return null;
  }
  return user;
}

/**
 * Guard: require staff auth only for write methods (POST/PUT/PATCH/DELETE).
 * GET requests pass through. Returns staff for writes, true for reads.
 */
export async function guardWriteStaff(req, res) {
  if (req.method === 'GET') return true;
  return guardStaff(req, res);
}
