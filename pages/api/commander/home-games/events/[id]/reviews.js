/**
 * Home Game Reviews API
 * GET /api/commander/home-games/events/:id/reviews
 * POST /api/commander/home-games/events/:id/reviews
 */
import { createClient } from '@supabase/supabase-js';
import { awardXP } from '../../../../../../src/lib/commander/xp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    return handleGet(req, res, id);
  } else if (req.method === 'POST') {
    return handleCreate(req, res, id);
  }

  return res.status(405).json({
    success: false,
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }
  });
}

async function handleGet(req, res, eventId) {
  try {
    const { data: reviews, error } = await supabase
      .from('commander_home_game_reviews')
      .select(`
        *,
        profiles (id, display_name, avatar_url)
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate average rating
    const avgRating = reviews?.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        reviews: reviews || [],
        average_rating: Math.round(avgRating * 10) / 10,
        total_reviews: reviews?.length || 0
      }
    });
  } catch (error) {
    console.error('Get reviews error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch reviews' }
    });
  }
}

async function handleCreate(req, res, eventId) {
  const { player_id, rating, comment, is_anonymous = false } = req.body;

  if (!player_id || !rating) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'player_id and rating required' }
    });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_RATING', message: 'Rating must be 1-5' }
    });
  }

  try {
    // Check if already reviewed
    const { data: existing } = await supabase
      .from('commander_home_game_reviews')
      .select('id')
      .eq('event_id', eventId)
      .eq('reviewer_id', player_id)
      .single();

    if (existing) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: 'Already reviewed this game' }
      });
    }

    // Check if player attended
    const { data: rsvp } = await supabase
      .from('commander_home_rsvps')
      .select('status')
      .eq('event_id', eventId)
      .eq('player_id', player_id)
      .single();

    if (!rsvp || rsvp.status !== 'confirmed') {
      return res.status(403).json({
        success: false,
        error: { code: 'NOT_ATTENDED', message: 'Must attend game to review' }
      });
    }

    const { data: review, error } = await supabase
      .from('commander_home_game_reviews')
      .insert({
        event_id: eventId,
        reviewer_id: player_id,
        rating,
        comment,
        is_anonymous
      })
      .select()
      .single();

    if (error) throw error;

    // Award XP for leaving a review (10 XP)
    await awardXP(player_id, 'review.left', {
      event_id: eventId,
      rating
    });

    return res.status(201).json({
      success: true,
      data: { review }
    });
  } catch (error) {
    console.error('Create review error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to create review' }
    });
  }
}
