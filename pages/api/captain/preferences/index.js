/**
 * Player Preferences API
 * GET /api/captain/preferences - Get current user's preferences
 * POST /api/captain/preferences - Create/upsert preferences
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
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

    if (req.method === 'GET') {
      // Get player's preferences
      const { data: preferences, error } = await supabase
        .from('captain_player_preferences')
        .select('*')
        .eq('player_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return res.status(200).json({
        success: true,
        data: preferences || {
          player_id: user.id,
          preferred_seats: [],
          left_handed: false,
          avoid_players: [],
          table_vibe: null,
          notification_preferences: {}
        }
      });
    }

    if (req.method === 'POST') {
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

      // Validate preferred_seats if provided
      if (preferred_seats && !Array.isArray(preferred_seats)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_SEATS', message: 'preferred_seats must be an array' }
        });
      }

      // Upsert preferences
      const { data: preferences, error } = await supabase
        .from('captain_player_preferences')
        .upsert({
          player_id: user.id,
          preferred_seats: preferred_seats || [],
          left_handed: left_handed ?? false,
          avoid_players: avoid_players || [],
          table_vibe: table_vibe || null,
          notification_preferences: notification_preferences || {},
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'player_id'
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: preferences
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST allowed' }
    });
  } catch (error) {
    console.error('Preferences API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process preferences' }
    });
  }
}
