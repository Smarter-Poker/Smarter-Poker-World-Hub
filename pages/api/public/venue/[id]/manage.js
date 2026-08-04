import { getServerUserWithFallback } from '../../../../../src/lib/serverAuth';
/**
 * Venue Management API
 * For claimed/verified venue owners to update their venue info
 *
 * GET: Get venue management data
 * PATCH: Update venue info
 */

import { supabase } from '../../../../../src/lib/supabase';
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    // NEVER shared-cache this endpoint. Every response is per-manager and
    // authenticated: it carries the full venue row, every manager's profile
    // (including email), and venue_verification_log rows containing IP
    // addresses and user agents. Under `public, s-maxage=60` a CDN would hand
    // one manager's payload to the next visitor of the same URL — or hand a
    // cached 403 to a legitimate manager.
    res.setHeader('Cache-Control', 'private, no-store');

    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const id = safeQ(req.query.id);

      if (!id) {
          return res.status(400).json({ success: false, error: 'Venue ID required' });
      }

      // Get auth user
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const token = authHeader.replace('Bearer ', '');
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;

      if (authErr || !user) {
          return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }

      // Check if user is a manager of this venue
      const { data: manager, error: managerError } = await getSupabase()
          .from('venue_managers')
          .select('*')
          .eq('venue_id', parseInt(id))
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle();

      if (managerError || !manager) {
          return res.status(403).json({
              success: false, error: 'Not authorized',
              message: 'You do not have permission to manage this venue.'
          });
      }

      if (req.method === 'GET') {
          return handleGet(req, res, id, user, manager);
      } else if (req.method === 'PATCH') {
          return handlePatch(req, res, id, user, manager);
      }

      return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (err) {
    try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handleGet(req, res, venueId, user, manager) {
    try {
        // Get venue with all editable fields
        const { data: venue, error: venueError } = await getSupabase()
            .from('poker_venues')
            .select('*')
            .eq('id', parseInt(venueId))
            .maybeSingle();

        if (venueError || !venue) {
            return res.status(404).json({ success: false, error: 'Venue not found' });
        }

        // Get other managers
        const { data: managers } = await getSupabase()
            .from('venue_managers')
            .select(`
                id, role, is_active, created_at,
                user:profiles(id, username, avatar_url, email)
            `)
            .eq('venue_id', parseInt(venueId))
            .eq('is_active', true)
                .limit(100);

        // Get recent activity
        const { data: activity } = await getSupabase()
            .from('venue_verification_log')
            .select('*')
            .eq('venue_id', parseInt(venueId))
            .order('created_at', { ascending: false })
            .limit(20);

        // Get tournament schedules
        const { data: tournaments } = await getSupabase()
            .from('venue_tournament_schedules')
            .select('*')
            .eq('venue_id', parseInt(venueId))
            .order('start_time');

        return res.status(200).json({
            venue,
            manager: {
                role: manager.role,
                permissions: {
                    can_edit_info: manager.can_edit_info,
                    can_edit_hours: manager.can_edit_hours,
                    can_edit_games: manager.can_edit_games,
                    can_post_updates: manager.can_post_updates,
                    can_respond_reviews: manager.can_respond_reviews,
                    can_manage_promotions: manager.can_manage_promotions,
                    can_view_analytics: manager.can_view_analytics,
                    can_invite_staff: manager.can_invite_staff
                }
            },
            managers: managers || [],
            activity: activity || [],
            tournaments: tournaments || []
        });

    } catch (error) {
        console.warn('Venue manage GET error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

// ── PATCH field model ────────────────────────────────────────────────────
//
// Two problems this table solves.
//
// 1. COLUMN-NAME DRIFT. The old whitelist wrote `zip`, `has_food` and
//    `description` straight into poker_venues, but the public read path for
//    the same table selects `zip_code`, `has_food_service` and `about`.
//    Postgres rejects an UPDATE that names any unknown column, so one stale
//    field in the payload killed the ENTIRE save and the owner got a generic
//    500 naming nothing. Incoming names are now mapped to the real columns.
//    Only exact synonyms are aliased — `has_parking` is deliberately NOT
//    mapped to `has_valet` (valet is a different, paid service; silently
//    turning "we have parking" into "we have valet" would publish a false
//    amenity). It falls through to `unknown_fields` instead, and the rest of
//    the payload still saves.
//
// 2. UNGATED FIELDS. Permission checks only covered name/address/city/state/
//    phone/website/description, hours and games/stakes — so `zip`,
//    `amenities`, `social_links`, `image_url`, `gallery_images` and
//    `has_tournaments` could be rewritten by any active manager regardless of
//    their can_edit_* flags. Every writable field now sits in exactly one
//    permission bucket; a field with no bucket is not writable at all.

// Incoming field name -> real poker_venues column.
const FIELD_ALIASES = {
    zip: 'zip_code',
    has_food: 'has_food_service',
    description: 'about',
};

// Real column -> the venue_managers permission flag that gates it.
const FIELD_PERMISSIONS = {
    // can_edit_info
    name: 'can_edit_info',
    address: 'can_edit_info',
    city: 'can_edit_info',
    state: 'can_edit_info',
    zip_code: 'can_edit_info',
    phone: 'can_edit_info',
    website: 'can_edit_info',
    about: 'can_edit_info',
    tagline: 'can_edit_info',
    amenities: 'can_edit_info',
    social_links: 'can_edit_info',
    image_url: 'can_edit_info',
    gallery_images: 'can_edit_info',
    profile_photo_url: 'can_edit_info',
    cover_photo_url: 'can_edit_info',
    has_food_service: 'can_edit_info',
    has_hotel: 'can_edit_info',
    has_valet: 'can_edit_info',
    // can_edit_hours
    hours: 'can_edit_hours',
    hours_json: 'can_edit_hours',
    hours_weekday: 'can_edit_hours',
    hours_weekend: 'can_edit_hours',
    // can_edit_games
    games_offered: 'can_edit_games',
    stakes_cash: 'can_edit_games',
    stakes_tournament: 'can_edit_games',
    has_tournaments: 'can_edit_games',
};

const PERMISSION_ERRORS = {
    can_edit_info: 'No permission to edit venue info',
    can_edit_hours: 'No permission to edit hours',
    can_edit_games: 'No permission to edit games',
};

// Pull the offending column out of an "unknown column" error. Postgres raises
// 42703 ('column "x" of relation "poker_venues" does not exist'); PostgREST
// raises PGRST204 ("Could not find the 'x' column of 'poker_venues' in the
// schema cache") when the payload key isn't in its schema cache at all.
function missingColumnFromError(err) {
    const text = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`;
    const m = text.match(/column "([^"]+)"/) || text.match(/'([^']+)' column/);
    return m ? m[1] : null;
}

/**
 * UPDATE that survives column drift. If the table turns out not to have one of
 * the columns we sent, that single key is dropped and the update is retried,
 * instead of the whole save dying with an opaque 500. Every dropped column is
 * returned so the caller can be told exactly what did not persist.
 */
async function updateVenueTolerant(venueId, payload) {
    const attempt = { ...payload };
    const dropped = [];

    for (let i = 0; i < 8; i++) {
        const { data, error } = await getSupabase()
            .from('poker_venues')
            .update(attempt)
            .eq('id', venueId)
            .select()
            .maybeSingle();

        if (!error) return { venue: data, dropped };

        const isUnknownColumn = error.code === '42703' || error.code === 'PGRST204';
        const col = isUnknownColumn ? missingColumnFromError(error) : null;
        if (!col || !(col in attempt)) return { error, dropped };

        delete attempt[col];
        dropped.push(col);
        console.warn(`[venue-manage] poker_venues has no column "${col}" — dropped from update`);

        if (Object.keys(attempt).filter((k) => k !== 'updated_at').length === 0) {
            return { error: null, venue: null, dropped, nothingLeft: true };
        }
    }

    return { error: new Error('Too many unknown columns in update payload'), dropped };
}

async function handlePatch(req, res, venueId, user, manager) {
    try {
        const updates = req.body || {};

        // Map incoming names onto real columns; anything with no mapping is
        // not writable through this endpoint.
        const filteredUpdates = {};
        const ignoredFields = [];
        const requiredPermissions = new Set();

        for (const field of Object.keys(updates)) {
            if (updates[field] === undefined) continue;
            const column = FIELD_ALIASES[field] || field;
            const permission = FIELD_PERMISSIONS[column];
            if (!permission) {
                ignoredFields.push(field);
                continue;
            }
            filteredUpdates[column] = updates[field];
            requiredPermissions.add(permission);
        }

        if (Object.keys(filteredUpdates).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid fields to update',
                // Name them: the old handler said only "No valid fields" and
                // left the owner guessing which key was wrong.
                unknown_fields: ignoredFields,
            });
        }

        // Permission gate — every field in the write set, not just a subset.
        for (const permission of requiredPermissions) {
            if (!manager[permission]) {
                return res.status(403).json({
                    success: false,
                    error: PERMISSION_ERRORS[permission] || 'No permission to edit this venue',
                    fields: Object.keys(filteredUpdates).filter(
                        (c) => FIELD_PERMISSIONS[c] === permission
                    ),
                });
            }
        }

        // Add updated_at
        filteredUpdates.updated_at = new Date().toISOString();

        // Update venue
        const { venue, error: updateError, dropped, nothingLeft } =
            await updateVenueTolerant(parseInt(venueId), filteredUpdates);

        if (updateError) {
            console.warn('Error updating venue:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to update venue' });
        }

        if (nothingLeft) {
            return res.status(400).json({
                success: false,
                error: 'None of the submitted fields exist on this venue',
                unsupported_fields: dropped,
                unknown_fields: ignoredFields,
            });
        }

        // Log the update
        const { error: err_venue_verification_log_hb4g1 } = await getSupabase()
          .from('venue_verification_log')
          .insert({
                venue_id: parseInt(venueId),
                action: 'info_updated',
                performed_by: user.id,
                details: {
                    // Log what actually persisted, not what was submitted.
                    fields_updated: Object.keys(filteredUpdates || {})
                        .filter(f => f !== 'updated_at' && !dropped.includes(f)),
                    fields_dropped: dropped,
                }
            });
        if (err_venue_verification_log_hb4g1) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_hb4g1.message);

        return res.status(200).json({
            success: true,
            venue,
            // Surfaced so the owner is told what did NOT save instead of
            // seeing a success toast over a partially-applied update.
            ...(dropped.length ? { unsupported_fields: dropped } : {}),
            ...(ignoredFields.length ? { unknown_fields: ignoredFields } : {}),
            message: dropped.length || ignoredFields.length
                ? 'Venue updated. Some fields could not be saved.'
                : 'Venue updated successfully'
        });

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Venue manage PATCH error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
