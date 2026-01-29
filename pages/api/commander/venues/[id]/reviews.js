/**
 * Venue Reviews API
 * GET /api/commander/venues/[id]/reviews - List reviews
 * POST /api/commander/venues/[id]/reviews - Submit a review
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (req.method === 'GET') {
      // Public access - no auth required
      const { sort = 'recent', limit = 20, offset = 0 } = req.query;

      let query = supabase
        .from('commander_venue_reviews')
        .select(`
          *,
          reviewer:reviewer_id (id, display_name, avatar_url)
        `, { count: 'exact' })
        .eq('venue_id', id)
        .eq('is_published', true);

      if (sort === 'helpful') {
        query = query.order('helpful_count', { ascending: false });
      } else if (sort === 'rating_high') {
        query = query.order('overall_rating', { ascending: false });
      } else if (sort === 'rating_low') {
        query = query.order('overall_rating', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error, count } = await query
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: {
          reviews: data || [],
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    }

    if (req.method === 'POST') {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Login required to submit review' }
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

      const {
        overall_rating,
        game_selection_rating,
        staff_rating,
        atmosphere_rating,
        food_rating,
        title,
        content,
        visit_date,
        games_played
      } = req.body;

      if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_RATING', message: 'Overall rating (1-5) required' }
        });
      }

      // Check if user already reviewed this venue
      const { data: existing } = await supabase
        .from('commander_venue_reviews')
        .select('id')
        .eq('venue_id', id)
        .eq('reviewer_id', user.id)
        .single();

      if (existing) {
        // Update existing review
        const { data, error } = await supabase
          .from('commander_venue_reviews')
          .update({
            overall_rating,
            game_selection_rating,
            staff_rating,
            atmosphere_rating,
            food_rating,
            title,
            content,
            visit_date,
            games_played,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          data: { review: data, updated: true }
        });
      }

      // Create new review
      const { data, error } = await supabase
        .from('commander_venue_reviews')
        .insert({
          venue_id: id,
          reviewer_id: user.id,
          overall_rating,
          game_selection_rating,
          staff_rating,
          atmosphere_rating,
          food_rating,
          title,
          content,
          visit_date,
          games_played,
          is_published: true
        })
        .select()
        .single();

      if (error) throw error;

      // Update venue review count and rating
      const { data: allReviews } = await supabase
        .from('commander_venue_reviews')
        .select('overall_rating')
        .eq('venue_id', id)
        .eq('is_published', true);

      if (allReviews && allReviews.length > 0) {
        const avgRating = allReviews.reduce((sum, r) => sum + r.overall_rating, 0) / allReviews.length;
        await supabase
          .from('poker_venues')
          .update({
            trust_score: parseFloat(avgRating.toFixed(1)),
            review_count: allReviews.length
          })
          .eq('id', id);
      }

      return res.status(201).json({
        success: true,
        data: { review: data }
      });
    }

    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET and POST allowed' }
    });
  } catch (error) {
    console.error('Venue reviews API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to process request' }
    });
  }
}
