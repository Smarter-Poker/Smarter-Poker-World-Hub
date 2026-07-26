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
      const { data: authData, error: authError } = await getSupabase().auth.getUser(token);
      const user = authData?.user;

      if (authError || !user) {
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

async function handlePatch(req, res, venueId, user, manager) {
    try {
        const updates = req.body;

        // Validate permissions for different update types
        const updateFields = Object.keys(updates || {});
        const infoFields = ['name', 'address', 'city', 'state', 'phone', 'website', 'description'];
        const hoursFields = ['hours', 'hours_json'];
        const gamesFields = ['games_offered', 'stakes_cash', 'stakes_tournament'];

        // Check permissions
        if (updateFields.some(f => infoFields.includes(f)) && !manager.can_edit_info) {
            return res.status(403).json({ success: false, error: 'No permission to edit venue info' });
        }
        if (updateFields.some(f => hoursFields.includes(f)) && !manager.can_edit_hours) {
            return res.status(403).json({ success: false, error: 'No permission to edit hours' });
        }
        if (updateFields.some(f => gamesFields.includes(f)) && !manager.can_edit_games) {
            return res.status(403).json({ success: false, error: 'No permission to edit games' });
        }

        // Whitelist allowed fields
        const allowedFields = [
            'name', 'address', 'city', 'state', 'zip', 'phone', 'website',
            'description', 'hours', 'hours_json',
            'games_offered', 'stakes_cash', 'stakes_tournament',
            'has_tournaments', 'has_food', 'has_hotel', 'has_parking',
            'amenities', 'social_links', 'image_url', 'gallery_images'
        ];

        const filteredUpdates = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                filteredUpdates[field] = updates[field];
            }
        }

        if (Object.keys(filteredUpdates || {}).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update' });
        }

        // Add updated_at
        filteredUpdates.updated_at = new Date().toISOString();

        // Update venue
        const { data: venue, error: updateError } = await getSupabase()
            .from('poker_venues')
            .update(filteredUpdates)
            .eq('id', parseInt(venueId))
            .select()
            .maybeSingle();

        if (updateError) {
            console.warn('Error updating venue:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to update venue' });
        }

        // Log the update
        const { error: err_venue_verification_log_hb4g1 } = await getSupabase()
          .from('venue_verification_log')
          .insert({
                venue_id: parseInt(venueId),
                action: 'info_updated',
                performed_by: user.id,
                details: {
                    fields_updated: Object.keys(filteredUpdates || {}).filter(f => f !== 'updated_at')
                }
            });
        if (err_venue_verification_log_hb4g1) console.warn('[Supabase] Silent mutation failed in venue_verification_log:', err_venue_verification_log_hb4g1.message);

        return res.status(200).json({
            success: true,
            venue,
            message: 'Venue updated successfully'
        });

    } catch (error) {
        try { reportApiError(error, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn('Venue manage PATCH error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
