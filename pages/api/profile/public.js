/**
 * GET /api/profile/public?username=<username>
 *
 * Returns the display-safe snapshot used by the public Hub profile. Browsers
 * cannot read public.profiles directly: table access is intentionally denied
 * so private columns cannot be harvested. This route performs one server-side
 * lookup and copies only the explicit fields below into the response.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

export const PUBLIC_PROFILE_FIELDS = Object.freeze([
  'id',
  'username',
  'display_name',
  'bio',
  'avatar_url',
  'arena_avatar_url',
  'use_avatar_as_profile_pic',
  'player_number',
  'level',
  'tier',
  'created_at',
  'website',
  'twitter',
  'instagram',
  'favorite_game',
  'favorite_hand',
  'favorite_hand_plo',
  'home_casino',
  'cover_photo_url',
  'cover_photo_position',
]);

const QUERY_FIELDS = [...PUBLIC_PROFILE_FIELDS, 'status'].join(', ');
const INELIGIBLE_STATUSES = new Set(['banned', 'deleted', 'disabled', 'suspended']);
const USERNAME_MAX_LENGTH = 64;
const UNSAFE_USERNAME = /[\u0000-\u001f\u007f/?#]/u;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  _supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  return _supabase;
}

function queryString(value) {
  if (Array.isArray(value)) return null;
  return typeof value === 'string' ? value.trim() : null;
}

export function parsePublicUsername(value) {
  const username = queryString(value);
  if (!username || username.length > USERNAME_MAX_LENGTH || UNSAFE_USERNAME.test(username))
    return null;
  return username;
}

export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function isPublicProfileEligible(row) {
  if (!row?.id || !row?.username) return false;
  const status = typeof row.status === 'string' ? row.status.trim().toLowerCase() : '';
  return !INELIGIBLE_STATUSES.has(status);
}

export function publicProfileSnapshot(row) {
  return Object.fromEntries(PUBLIC_PROFILE_FIELDS.map((field) => [field, row?.[field] ?? null]));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!applyRateLimit(req, res, LIMITS.read)) return;

  const username = parsePublicUsername(req.query?.username);
  if (!username) {
    return res.status(400).json({ success: false, error: 'Valid username required' });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(503).json({ success: false, error: 'Profile temporarily unavailable' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select(QUERY_FIELDS)
      .ilike('username', escapeLikePattern(username))
      .maybeSingle();

    if (error) {
      return res.status(503).json({ success: false, error: 'Profile temporarily unavailable' });
    }
    if (!isPublicProfileEligible(data)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    return res.status(200).json({ success: true, profile: publicProfileSnapshot(data) });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (_reportError) {}
    return res.status(503).json({ success: false, error: 'Profile temporarily unavailable' });
  }
}
