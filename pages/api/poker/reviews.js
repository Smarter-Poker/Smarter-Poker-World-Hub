import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      // Require JWT for writes
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, error: 'Auth required for reviews' });
      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

      const { venue_id, rating, review_text, reviewer_name } = req.body;
      const user_id = authUser.id;

      if (!venue_id || !rating || !review_text || !reviewer_name) {
        return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, rating, review_text, reviewer_name' });
      }

      const venueIdNum = parseInt(venue_id, 10);
      if (isNaN(venueIdNum) || venueIdNum < 1) {
        return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
      }

      const ratingNum = parseInt(rating, 10);
      if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        return res.status(400).json({ success: false, error: 'Rating must be an integer between 1 and 5' });
      }

      const { data, error } = await supabase
        .from('venue_reviews')
        .insert({
          venue_id: String(venueIdNum),
          user_id,
          rating: ratingNum,
          review_text,
          reviewer_name,
          created_at: new Date().toISOString(),
          helpful_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating review:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      return res.status(201).json({ success: true, review: data });
    }

    if (req.method === 'GET') {
      const { venue_id, limit = '20', offset = '0' } = req.query;

      if (!venue_id) {
        return res.status(400).json({ success: false, error: 'venue_id is required' });
      }

      const venueIdNum = parseInt(venue_id, 10);
      if (isNaN(venueIdNum) || venueIdNum < 1) {
        return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
      }

      const limitNum = parseInt(limit, 10) || 20;
      const offsetNum = parseInt(offset, 10) || 0;

      // Fetch reviews
      const { data: reviews, error: reviewError } = await supabase
        .from('venue_reviews')
        .select('*')
        .eq('venue_id', String(venueIdNum))
        .order('created_at', { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      if (reviewError) {
        console.error('Error fetching reviews:', reviewError);
        return res.status(500).json({ success: false, error: reviewError.message });
      }

      // Fetch all ratings for stats
      const { data: allRatings, error: ratingsError } = await supabase
        .from('venue_reviews')
        .select('rating')
        .eq('venue_id', String(venueIdNum));

      if (ratingsError) {
        console.error('Error fetching ratings:', ratingsError);
        return res.status(500).json({ success: false, error: ratingsError.message });
      }

      const total_reviews = allRatings ? allRatings.length : 0;
      const avg_rating = total_reviews > 0
        ? parseFloat((allRatings.reduce((sum, r) => sum + r.rating, 0) / total_reviews).toFixed(2))
        : 0;

      const rating_distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      if (allRatings) {
        allRatings.forEach((r) => {
          rating_distribution[r.rating] = (rating_distribution[r.rating] || 0) + 1;
        });
      }

      return res.status(200).json({
        success: true,
        reviews: reviews || [],
        avg_rating,
        total_reviews,
        rating_distribution,
      });
    }

    if (req.method === 'DELETE') {
      const { review_id, user_id } = req.query;

      if (!review_id || !user_id) {
        return res.status(400).json({ success: false, error: 'review_id and user_id are required' });
      }

      const { data, error } = await supabase
        .from('venue_reviews')
        .delete()
        .eq('id', review_id)
        .eq('user_id', user_id)
        .select();

      if (error) {
        console.error('Error deleting review:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({ success: false, error: 'Review not found or not owned by user' });
      }

      return res.status(200).json({ success: true, deleted: data[0] });
    }

    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  } catch (err) {
    console.error('Reviews API error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
