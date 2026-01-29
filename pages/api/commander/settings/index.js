/**
 * Venue Settings API
 * GET /api/commander/settings - Get venue settings
 * PATCH /api/commander/settings - Update venue settings
 */
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { venue_id } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  if (req.method === 'GET') {
    // Staff can view settings
    const staff = await requireStaff(req, res, venue_id);
    if (!staff) return;
    return getSettings(req, res, venue_id);
  } else if (req.method === 'PATCH') {
    // Only managers can update settings
    const staff = await requireStaff(req, res, venue_id, ['owner', 'manager']);
    if (!staff) return;
    return updateSettings(req, res, venue_id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getSettings(req, res, venueId) {
  try {
    const { data: venue, error } = await supabase
      .from('poker_venues')
      .select(`
        id,
        name,
        commander_enabled,
        commander_tier,
        commission_type,
        accepts_home_games,
        auto_text_enabled,
        waitlist_settings,
        tournament_settings,
        staff_pin_required
      `)
      .eq('id', parseInt(venueId))
      .single();

    if (error) throw error;

    if (!venue) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Venue not found' }
      });
    }

    return res.status(200).json({
      success: true,
      data: { settings: venue }
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch settings' }
    });
  }
}

async function updateSettings(req, res, venueId) {
  try {
    const {
      auto_text_enabled,
      staff_pin_required,
      accepts_home_games,
      waitlist_settings,
      tournament_settings,
      commission_type
    } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (auto_text_enabled !== undefined) updates.auto_text_enabled = auto_text_enabled;
    if (staff_pin_required !== undefined) updates.staff_pin_required = staff_pin_required;
    if (accepts_home_games !== undefined) updates.accepts_home_games = accepts_home_games;
    if (waitlist_settings !== undefined) updates.waitlist_settings = waitlist_settings;
    if (tournament_settings !== undefined) updates.tournament_settings = tournament_settings;
    if (commission_type !== undefined) updates.commission_type = commission_type;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_CHANGES', message: 'No settings to update' }
      });
    }

    const { data: venue, error } = await supabase
      .from('poker_venues')
      .update(updates)
      .eq('id', parseInt(venueId))
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { settings: venue }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update settings' }
    });
  }
}
