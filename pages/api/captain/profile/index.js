/**
 * Player Profile API
 * GET /api/captain/profile - Get current player's captain profile
 * PATCH /api/captain/profile - Update profile
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Authentication required' }
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  if (req.method === 'GET') {
    return getProfile(req, res, user);
  } else if (req.method === 'PATCH') {
    return updateProfile(req, res, user);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function getProfile(req, res, user) {
  try {
    // Get base profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    // Get player preferences
    const { data: preferences } = await supabase
      .from('captain_player_preferences')
      .select('*')
      .eq('player_id', user.id)
      .single();

    // Get favorite venues (venues where player has sessions)
    const { data: sessions } = await supabase
      .from('captain_player_sessions')
      .select(`
        venue_id,
        poker_venues (id, name, city, state)
      `)
      .eq('player_id', user.id)
      .order('check_in_at', { ascending: false })
      .limit(10);

    // Count unique venues
    const venueMap = new Map();
    sessions?.forEach(s => {
      if (s.poker_venues && !venueMap.has(s.venue_id)) {
        venueMap.set(s.venue_id, s.poker_venues);
      }
    });
    const favoriteVenues = Array.from(venueMap.values()).slice(0, 5);

    // Get achievements (simplified - based on session counts)
    const { count: sessionCount } = await supabase
      .from('captain_player_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', user.id);

    const achievements = [];
    if (sessionCount >= 1) achievements.push({ id: 'first_session', name: 'First Session', icon: 'trophy' });
    if (sessionCount >= 10) achievements.push({ id: 'regular', name: 'Regular', icon: 'star' });
    if (sessionCount >= 50) achievements.push({ id: 'veteran', name: 'Veteran', icon: 'award' });
    if (sessionCount >= 100) achievements.push({ id: 'legend', name: 'Legend', icon: 'crown' });

    return res.status(200).json({
      success: true,
      data: {
        profile: {
          ...profile,
          preferences: preferences || null,
          favorite_venues: favoriteVenues,
          achievements
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch profile' }
    });
  }
}

async function updateProfile(req, res, user) {
  try {
    const { preferences, ...profileUpdates } = req.body;

    // Update profile if there are updates
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', user.id);

      if (profileError) throw profileError;
    }

    // Update preferences if provided
    if (preferences) {
      const { error: prefError } = await supabase
        .from('captain_player_preferences')
        .upsert({
          player_id: user.id,
          ...preferences,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'player_id'
        });

      if (prefError) throw prefError;
    }

    return res.status(200).json({
      success: true,
      data: { updated: true }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to update profile' }
    });
  }
}
