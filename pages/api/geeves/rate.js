import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/* ═══════════════════════════════════════════════════════════════════════════
   RATE GEEVES ANSWER — User feedback on cached answers
   Updates cache ratings for quality tracking
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  try {
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const authHeader = req.headers.authorization;
          if (!authHeader?.startsWith('Bearer ')) {
              return res.status(401).json({ success: false, error: 'Unauthorized' });
          }

          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;

          if (authErr || !user) {
              return res.status(401).json({ success: false, error: 'Invalid token' });
          }

          const { cacheId, rating, feedback } = req.body;

          if (!cacheId) {
              return res.status(400).json({ success: false, error: 'Cache ID is required' });
          }

          if (!rating || rating < 1 || rating > 5) {
              return res.status(400).json({ success: false, error: 'Rating must be between 1 and 5' });
          }

          // Check if user already rated this answer
          const { data: existingRating } = await getSupabase()
              .from('geeves_answer_ratings')
              .select('id, rating')
              .eq('cache_id', cacheId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (existingRating) {
              // Update existing rating
              const { error: updateError } = await getSupabase()
                  .from('geeves_answer_ratings')
                  .update({ rating, feedback })
                  .eq('id', existingRating.id);

              if (updateError) throw updateError;

              // Safely update cache stats using Supabase query
              const ratingDiff = rating - existingRating.rating;
              if (ratingDiff !== 0) {
                  const { data: cacheRow } = await getSupabase()
                      .from('geeves_knowledge_cache')
                      .select('rating_sum')
                      .eq('id', cacheId)
                      .maybeSingle();
                  if (cacheRow) {
                      const { error: err_geeves_knowledge_cache_o80gs } = await getSupabase()
                        .from('geeves_knowledge_cache')
                        .update({ rating_sum: (cacheRow.rating_sum || 0) + ratingDiff })
                          .eq('id', cacheId);
                      if (err_geeves_knowledge_cache_o80gs) console.warn('[Supabase] Silent mutation failed in geeves_knowledge_cache:', err_geeves_knowledge_cache_o80gs.message);
                  }
              }

              return res.status(200).json({
                  success: true,
                  message: 'Rating updated',
                  previousRating: existingRating.rating,
                  newRating: rating
              });
          }

          // Insert new rating (trigger will update cache stats)
          const { error: insertError } = await getSupabase()
              .from('geeves_answer_ratings')
              .insert({
                  cache_id: cacheId,
                  user_id: user.id,
                  rating,
                  feedback
              });

          if (insertError) throw insertError;

          // Get updated cache stats
          const { data: cacheData } = await getSupabase()
              .from('geeves_knowledge_cache')
              .select('avg_rating, total_ratings')
              .eq('id', cacheId)
              .maybeSingle();

          return res.status(200).json({
              success: true,
              message: 'Rating saved',
              rating,
              avgRating: cacheData?.avg_rating,
              totalRatings: cacheData?.total_ratings
          });

      } catch (error) {
          console.warn('[Geeves Rate] Error:', error);
          return res.status(500).json({
              success: false, error: 'Failed to save rating',
              details: error.message
          });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
