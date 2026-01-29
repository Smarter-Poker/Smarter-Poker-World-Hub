/**
 * Pass on Waitlist API
 * POST /api/commander/waitlist/:id/pass
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST allowed' }
    });
  }

  const { id } = req.query;
  const { pass_count = 1 } = req.body;

  try {
    // Verify authentication - either player (Bearer) or staff (x-staff-session)
    let authenticatedUserId = null;
    let isStaff = false;

    const authHeader = req.headers.authorization;
    const staffSession = req.headers['x-staff-session'];

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (!authError && user) {
        authenticatedUserId = user.id;
      }
    }

    let staffVenueId = null;
    if (staffSession) {
      try {
        const sessionData = JSON.parse(staffSession);
        const { data: staff } = await supabase
          .from('commander_staff')
          .select('id, venue_id, is_active')
          .eq('id', sessionData.id)
          .eq('is_active', true)
          .single();
        if (staff) {
          isStaff = true;
          staffVenueId = staff.venue_id;
        }
      } catch { /* invalid session format */ }
    }

    if (!authenticatedUserId && !isStaff) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    // Get current entry
    const { data: entry, error: getError } = await supabase
      .from('commander_waitlist')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !entry) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Waitlist entry not found' }
      });
    }

    // Verify staff belongs to the same venue as the waitlist entry
    if (isStaff && staffVenueId && staffVenueId !== entry.venue_id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Staff is not authorized for this venue' }
      });
    }

    // Verify ownership: player can only pass on their own entry, staff can pass on any
    if (!isStaff && entry.player_id && entry.player_id !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only pass on your own waitlist entry' }
      });
    }

    // Use call_count to track passes (each pass follows a call)
    const currentCallCount = entry.call_count || 0;
    const maxPasses = 3;

    // Remove from waitlist if too many calls/passes
    if (currentCallCount >= maxPasses) {
      // Move to history
      await supabase
        .from('commander_waitlist_history')
        .insert({
          venue_id: entry.venue_id,
          player_id: entry.player_id,
          game_type: entry.game_type,
          stakes: entry.stakes,
          wait_time_minutes: Math.round(
            (Date.now() - new Date(entry.created_at).getTime()) / (1000 * 60)
          ),
          was_seated: false,
          signup_method: entry.signup_method
        });

      // Delete entry
      await supabase
        .from('commander_waitlist')
        .delete()
        .eq('id', id);

      return res.status(200).json({
        success: true,
        data: {
          removed: true,
          message: 'Removed from waitlist after maximum passes'
        }
      });
    }

    // Set status back to waiting (player passed on the call)
    const { data: updated, error } = await supabase
      .from('commander_waitlist')
      .update({
        last_called_at: new Date().toISOString(),
        status: 'waiting'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        entry: updated,
        passes_remaining: maxPasses - currentCallCount
      }
    });
  } catch (error) {
    console.error('Pass error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to record pass' }
    });
  }
}
