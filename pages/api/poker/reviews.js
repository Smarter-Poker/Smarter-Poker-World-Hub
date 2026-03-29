import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-user-id, Authorization',
};

export default async function handler(req, res) {
  try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
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
        const { data: { user: authUser }, error: authErr } = await getSupabase().auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { venue_id, rating, review_text, reviewer_name, category_ratings } = req.body;
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

        // Check if user is a verified player at this venue (has bankroll sessions)
        let is_verified_player = false;
        try {
          const { data: sessions } = await getSupabase()
            .from('bankroll_sessions')
            .select('id')
            .eq('user_id', user_id)
            .eq('venue_id', venueIdNum)
            .limit(1);
          is_verified_player = sessions && sessions.length > 0;
        } catch (_) { /* non-fatal — just skip verified badge */ }

        // Build insert payload with optional category ratings
        const insertPayload = {
          venue_id: String(venueIdNum),
          user_id,
          rating: ratingNum,
          review_text,
          reviewer_name,
          created_at: new Date().toISOString(),
          helpful_count: 0,
          unhelpful_count: 0,
        };

        // Store category ratings + verified status in metadata JSON
        const metadata = {};
        if (category_ratings && typeof category_ratings === 'object') {
          const validCats = ['dealers', 'game_quality', 'rake', 'food', 'atmosphere'];
          for (const [key, val] of Object.entries(category_ratings)) {
            if (validCats.includes(key) && Number.isInteger(val) && val >= 1 && val <= 5) {
              metadata[key + '_rating'] = val;
            }
          }
        }
        if (is_verified_player) metadata.verified_player = true;
        if (Object.keys(metadata).length > 0) insertPayload.metadata = metadata;

        const { data, error } = await getSupabase()
          .from('venue_reviews')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (error) {
          console.error('Error creating review:', error);
          return res.status(500).json({ success: false, error: error.message });
        }

        return res.status(201).json({ success: true, review: data });
      }

      if (req.method === 'GET') {
        const { venue_id, venue_ids, stats_only, limit = '20', offset = '0' } = req.query;

        // --- Bulk stats endpoint for venue cards ---
        if (stats_only === 'true' && venue_ids) {
          const ids = venue_ids.split(',').map(v => v.trim()).filter(Boolean).slice(0, 50);
          if (ids.length === 0) return res.status(200).json({ success: true, stats: {} });

          const { data: allRatings, error: rErr } = await getSupabase()
            .from('venue_reviews')
            .select('venue_id, rating')
            .in('venue_id', ids);

          if (rErr) {
            console.error('Error fetching bulk stats:', rErr);
            return res.status(500).json({ success: false, error: rErr.message });
          }

          const stats = {};
          for (const id of ids) stats[id] = { avg_rating: 0, total_reviews: 0 };
          if (allRatings) {
            const buckets = {};
            for (const r of allRatings) {
              if (!buckets[r.venue_id]) buckets[r.venue_id] = [];
              buckets[r.venue_id].push(r.rating);
            }
            for (const [vid, ratings] of Object.entries(buckets)) {
              stats[vid] = {
                avg_rating: parseFloat((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(2)),
                total_reviews: ratings.length,
              };
            }
          }

          res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
          return res.status(200).json({ success: true, stats });
        }

        if (!venue_id) {
          return res.status(400).json({ success: false, error: 'venue_id is required' });
        }

        const venueIdNum = parseInt(venue_id, 10);
        if (isNaN(venueIdNum) || venueIdNum < 1) {
          return res.status(400).json({ success: false, error: 'venue_id must be a valid positive integer' });
        }

        const limitNum = parseInt(limit, 10) || 20;
        const offsetNum = parseInt(offset, 10) || 0;

        // Single query: fetch reviews with rating for stats (eliminates N+1)
        const { data: reviews, error: reviewError } = await getSupabase()
          .from('venue_reviews')
          .select('*')
          .eq('venue_id', String(venueIdNum))
          .order('created_at', { ascending: false })
          .limit(200);

        if (reviewError) {
          console.error('Error fetching reviews:', reviewError);
          return res.status(500).json({ success: false, error: reviewError.message });
        }

        const allReviews = reviews || [];
        const total_reviews = allReviews.length;
        const avg_rating = total_reviews > 0
          ? parseFloat((allReviews.reduce((sum, r) => sum + r.rating, 0) / total_reviews).toFixed(2))
          : 0;

        const rating_distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        allReviews.forEach((r) => {
          rating_distribution[r.rating] = (rating_distribution[r.rating] || 0) + 1;
        });

        // Apply pagination to final result
        const paginatedReviews = allReviews.slice(offsetNum, offsetNum + limitNum);

        return res.status(200).json({
          success: true,
          reviews: paginatedReviews,
          avg_rating,
          total_reviews,
          rating_distribution,
        });
      }

      if (req.method === 'DELETE') {
        // CRITICAL FIX #1: Require JWT auth instead of query param user_id
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for delete' });
        const { data: { user: authUser }, error: authErr } = await getSupabase().auth.getUser(token);
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { review_id } = req.query;
        const user_id = authUser.id;

        if (!review_id) {
          return res.status(400).json({ success: false, error: 'review_id is required' });
        }

        const { data, error } = await getSupabase()
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

      if (req.method === 'PATCH') {
        const { review_id, action } = req.body;
        if (!review_id || !['helpful', 'unhelpful'].includes(action)) {
          return res.status(400).json({ success: false, error: 'review_id and action ("helpful" or "unhelpful") required' });
        }

        // Fetch current counts then increment the appropriate one
        const { data: existing, error: fetchErr } = await getSupabase()
          .from('venue_reviews')
          .select('helpful_count, unhelpful_count')
          .eq('id', review_id)
          .maybeSingle();

        if (fetchErr || !existing) {
          return res.status(404).json({ success: false, error: 'Review not found' });
        }

        const updatePayload = action === 'helpful'
          ? { helpful_count: (existing.helpful_count || 0) + 1 }
          : { unhelpful_count: (existing.unhelpful_count || 0) + 1 };

        const { error: updateErr } = await getSupabase()
          .from('venue_reviews')
          .update(updatePayload)
          .eq('id', review_id);

        if (updateErr) {
          console.error(`Error updating ${action} count:`, updateErr);
          return res.status(500).json({ success: false, error: updateErr.message });
        }

        return res.status(200).json({ success: true });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.error('Reviews API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
    console.error('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
