/**
 * Venue Follow API
 * POST /api/captain/venues/[id]/follow - Follow a venue
 * DELETE /api/captain/venues/[id]/follow - Unfollow a venue
 * GET /api/captain/venues/[id]/follow - Check follow status
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

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('captain_venue_followers')
        .select('*')
        .eq('venue_id', id)
        .eq('user_id', user.id)
        .single();

      return res.status(200).json({
        success: true,
        data: {
          is_following: !!data,
          follow: data || null
        }
      });
    }

    if (req.method === 'POST') {
      const { notify_posts = true, notify_events = true, notify_promotions = true, notify_tournaments = true } = req.body || {};

      // Check if already following
      const { data: existing } = await supabase
        .from('captain_venue_followers')
        .select('id')
        .eq('venue_id', id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        return res.status(200).json({
          success: true,
          data: { message: 'Already following' }
        });
      }

      const { data, error } = await supabase
        .from('captain_venue_followers')
        .insert({
          venue_id: id,
          user_id: user.id,
          notify_posts,
          notify_events,
          notify_promotions,
          notify_tournaments
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        success: true,
        data: { follow: data }
      });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('captain_venue_followers')
        .delete()
        .eq('venue_id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: { unfollowed: true }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
    });
  } catch (error) {
    console.error('Venue follow API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
