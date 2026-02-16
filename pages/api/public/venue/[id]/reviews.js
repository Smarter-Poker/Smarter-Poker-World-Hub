/**
 * Public Venue Reviews API
 * GET /api/public/venue/[id]/reviews - Get public reviews for a venue
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  try {
    const { id, sort = 'recent', limit = 20, offset = 0 } = req.query;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_ID', message: 'Venue ID required' }
      });
    }

    let query = supabase
      .from('commander_venue_reviews')
      .select(`
        id,
        overall_rating,
        game_selection_rating,
        staff_rating,
        atmosphere_rating,
        food_rating,
        title,
        content,
        visit_date,
        games_played,
        venue_response,
        venue_responded_at,
        is_verified,
        helpful_count,
        created_at,
        reviewer:reviewer_id (
          id,
          display_name,
          avatar_url
        )
      `, { count: 'exact' })
      .eq('venue_id', id)
      .eq('is_published', true);

    // Sort options
    if (sort === 'helpful') {
      query = query.order('helpful_count', { ascending: false });
    } else if (sort === 'rating_high') {
      query = query.order('overall_rating', { ascending: false });
    } else if (sort === 'rating_low') {
      query = query.order('overall_rating', { ascending: true });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: reviews, error, count } = await query
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Gracefully handle type mismatch (UUID passed to integer column for social pages)
    // Fall back to social_page_reviews for social pages
    if (error) {
      if (error.code === '22P02') {
        // Query social_page_reviews instead
        let spQuery = supabase
          .from('social_page_reviews')
          .select(`
            id,
            overall_rating,
            reviewer_id,
            title,
            content,
            helpful_count,
            created_at
          `, { count: 'exact' })
          .eq('page_id', id)
          .eq('is_published', true);

        if (sort === 'helpful') {
          spQuery = spQuery.order('helpful_count', { ascending: false });
        } else if (sort === 'rating_high') {
          spQuery = spQuery.order('overall_rating', { ascending: false });
        } else if (sort === 'rating_low') {
          spQuery = spQuery.order('overall_rating', { ascending: true });
        } else {
          spQuery = spQuery.order('created_at', { ascending: false });
        }

        const { data: spReviews, count: spCount } = await spQuery
          .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        // Enrich with reviewer profiles
        const enrichedReviews = await Promise.all((spReviews || []).map(async (r) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', r.reviewer_id)
            .maybeSingle();
          return {
            ...r,
            reviewer: profile ? {
              id: r.reviewer_id,
              display_name: profile.display_name || profile.username || 'Anonymous',
              avatar_url: profile.avatar_url
            } : { id: r.reviewer_id, display_name: 'Anonymous', avatar_url: null }
          };
        }));

        // Calculate distribution from social page reviews
        const { data: allSpReviews } = await supabase
          .from('social_page_reviews')
          .select('overall_rating')
          .eq('page_id', id)
          .eq('is_published', true);

        const spDist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        let spTotal = 0;
        (allSpReviews || []).forEach(r => {
          spDist[r.overall_rating] = (spDist[r.overall_rating] || 0) + 1;
          spTotal += r.overall_rating;
        });
        const spAvg = allSpReviews?.length > 0 ? spTotal / allSpReviews.length : 0;

        return res.status(200).json({
          success: true,
          data: {
            reviews: enrichedReviews,
            total: spCount || 0,
            average_rating: parseFloat(spAvg.toFixed(1)),
            distribution: spDist,
            limit: parseInt(limit),
            offset: parseInt(offset)
          }
        });
      }
      throw error;
    }

    // Calculate rating distribution
    const { data: allReviews } = await supabase
      .from('commander_venue_reviews')
      .select('overall_rating')
      .eq('venue_id', id)
      .eq('is_published', true);

    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let totalRating = 0;
    (allReviews || []).forEach(r => {
      distribution[r.overall_rating] = (distribution[r.overall_rating] || 0) + 1;
      totalRating += r.overall_rating;
    });

    const averageRating = allReviews?.length > 0 ? totalRating / allReviews.length : 0;

    return res.status(200).json({
      success: true,
      data: {
        reviews: reviews || [],
        total: count,
        average_rating: parseFloat(averageRating.toFixed(1)),
        distribution,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Public venue reviews API error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch reviews' }
    });
  }
}
