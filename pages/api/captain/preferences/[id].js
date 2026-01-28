/**
 * Player Preferences by ID API
 * GET /api/captain/preferences/:id - Get preferences by ID
 * PATCH /api/captain/preferences/:id - Update preferences
 * DELETE /api/captain/preferences/:id - Delete preferences
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  try {
    // Get authenticated user
    const supabaseServerClient = createPagesServerClient({ req, res });
    const { data: { user } } = await supabaseServerClient.auth.getUser();

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
      });
    }

    // Get existing preferences
    const { data: existing, error: fetchError } = await supabase
      .from('captain_player_preferences')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Preferences not found' }
      });
    }

    // Verify ownership
    if (existing.player_id !== user.id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Can only modify your own preferences' }
      });
    }

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: existing
      });
    }

    if (req.method === 'PATCH') {
      const {
        preferred_seats,
        left_handed,
        avoid_players,
        table_vibe,
        notification_preferences
      } = req.body;

      // Validate table_vibe if provided
      if (table_vibe && !['action', 'social', 'grinder'].includes(table_vibe)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_VIBE', message: 'table_vibe must be action, social, or grinder' }
        });
      }

      // Build update object with only provided fields
      const updates = { updated_at: new Date().toISOString() };
      if (preferred_seats !== undefined) updates.preferred_seats = preferred_seats;
      if (left_handed !== undefined) updates.left_handed = left_handed;
      if (avoid_players !== undefined) updates.avoid_players = avoid_players;
      if (table_vibe !== undefined) updates.table_vibe = table_vibe;
      if (notification_preferences !== undefined) updates.notification_preferences = notification_preferences;

      const { data: preferences, error } = await supabase
        .from('captain_player_preferences')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: preferences
      });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('captain_player_preferences')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { message: 'Preferences deleted' }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET, PATCH, DELETE allowed' }
    });
  } catch (error) {
    console.error('Preferences API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process preferences' }
    });
  }
}
