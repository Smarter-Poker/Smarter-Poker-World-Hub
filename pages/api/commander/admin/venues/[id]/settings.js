/**
 * Venue Settings API
 * GET /api/commander/admin/venues/[id]/settings - Get venue settings
 * PUT /api/commander/admin/venues/[id]/settings - Update venue settings
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authorization required' }
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
      });
    }

    // Verify user has admin access to this venue
    const { data: staffRole } = await supabase
      .from('commander_staff')
      .select('role')
      .eq('user_id', user.id)
      .eq('venue_id', id)
      .in('role', ['owner', 'manager'])
      .single();

    if (!staffRole) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required for this venue' }
      });
    }

    if (req.method === 'GET') {
      const { data: venue, error } = await supabase
        .from('poker_venues')
        .select('*, waitlist_settings, tournament_settings')
        .eq('id', id)
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { venue }
      });
    }

    if (req.method === 'PUT') {
      const {
        comp_rate,
        auto_text_enabled,
        waitlist_settings,
        display_settings,
        tournament_settings
      } = req.body;

      const updates = {};

      if (comp_rate !== undefined) updates.comp_rate = comp_rate;
      if (auto_text_enabled !== undefined) updates.auto_text_enabled = auto_text_enabled;
      if (waitlist_settings !== undefined) updates.waitlist_settings = waitlist_settings;
      if (tournament_settings !== undefined) updates.tournament_settings = tournament_settings;

      // Store display_settings in a JSON field or waitlist_settings
      if (display_settings !== undefined) {
        updates.waitlist_settings = {
          ...(waitlist_settings || {}),
          display: display_settings
        };
      }

      updates.updated_at = new Date().toISOString();

      const { data: venue, error } = await supabase
        .from('poker_venues')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log the settings change
      await supabase.from('commander_audit_log').insert({
        venue_id: id,
        user_id: user.id,
        action_type: 'venue_settings_updated',
        action_category: 'settings',
        description: 'Venue settings updated',
        changes: updates
      });

      return res.status(200).json({
        success: true,
        data: { venue }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and PUT allowed' }
    });
  } catch (error) {
    console.error('Venue settings error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
