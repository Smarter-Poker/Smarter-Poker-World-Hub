/**
 * Captain Authentication Middleware
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
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
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
    .from('captain_staff')
    .select('*')
    .eq('venue_id', venueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (error || !staff) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Staff access required' }
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
    .from('captain_staff')
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
    .from('captain_staff')
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
    .from('captain_staff')
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
