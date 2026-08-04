/**
 * Public Venue Reviews API
 * GET /api/public/venue/[id]/reviews - Get public reviews for a venue
 */
import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * Exact rating distribution + average for a review table.
 *
 * The previous implementation SELECTed up to 100 `overall_rating` rows and
 * averaged those, while `total` came from an exact count — so every venue past
 * 100 reviews displayed a star average and a distribution that contradicted
 * its own review count. Five head-only COUNT queries (one per star bucket, run
 * in parallel) give the exact numbers without transferring a single row, and
 * the average is the count-weighted mean of the buckets.
 *
 * Errors are logged and degrade to zeros rather than failing the request: the
 * reviews themselves have already been fetched and are worth serving.
 */
async function fetchRatingStats(table, keyColumn, keyValue) {
    const buckets = [5, 4, 3, 2, 1];
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    const counts = await Promise.all(buckets.map(async (stars) => {
        const { count, error } = await getSupabase()
            .from(table)
            .select('id', { count: 'exact', head: true })
            .eq(keyColumn, keyValue)
            .eq('is_published', true)
            .eq('overall_rating', stars);
        if (error) {
            console.warn(`[venue-reviews] rating count failed (${table}, ${stars} star):`, error.message);
            return 0;
        }
        return count || 0;
    }));

    let weighted = 0;
    let rated = 0;
    buckets.forEach((stars, i) => {
        distribution[stars] = counts[i];
        weighted += stars * counts[i];
        rated += counts[i];
    });

    return { distribution, average: rated > 0 ? weighted / rated : 0 };
}

/**
 * Resolve reviewer display info for a set of reviews in ONE query.
 * Was one `profiles` round trip per review inside Promise.all — up to `limit`
 * requests to render a single page.
 */
async function attachReviewers(rows) {
    const reviewerIds = Array.from(new Set((rows || []).map((r) => r.reviewer_id).filter(Boolean)));
    let byId = {};
    if (reviewerIds.length) {
        const { data: profiles, error } = await getSupabase()
            .from('profiles')
            .select('id, display_name, username, avatar_url')
            .in('id', reviewerIds);
        if (error) {
            console.warn('[venue-reviews] reviewer profile batch failed:', error.message);
        }
        (profiles || []).forEach((p) => { byId[p.id] = p; });
    }
    return (rows || []).map((r) => {
        const p = byId[r.reviewer_id];
        return {
            ...r,
            reviewer: {
                id: r.reviewer_id,
                display_name: p ? (p.display_name || p.username || 'Anonymous') : 'Anonymous',
                avatar_url: p ? p.avatar_url : null,
            },
        };
    });
}

export default async function handler(req, res) {
  try {
    // CDN cache: fresh for 60s, serve stale up to 300s
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    }

    if (req.method !== 'GET') {
      return res.status(405).json({
        success: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
      });
    }

    try {
      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const id = safeQ(req.query.id);
      const sort = safeQ(req.query.sort) || 'recent';

      // Clamp paging to sane integers. Unvalidated `parseInt` let `?limit=abc`
      // through as NaN — `.range(0, NaN)` 500s — and `?limit=100000` through as
      // a request to serialize every review a venue has ever received.
      const clampInt = (raw, def, min, max) => {
        const n = parseInt(raw, 10);
        if (!Number.isFinite(n)) return def;
        return Math.min(Math.max(n, min), max);
      };
      const limit = clampInt(safeQ(req.query.limit), 20, 1, 100);
      const offset = clampInt(safeQ(req.query.offset), 0, 0, 100000);

      if (!id) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_ID', message: 'Venue ID required' }
        });
      }

      let query = getSupabase()
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
        .range(offset, offset + limit - 1);

      // Gracefully handle type mismatch (UUID passed to integer column for social pages)
      // Fall back to social_page_reviews for social pages
      if (error) {
        if (error.code === '22P02') {
          // Query social_page_reviews instead
          let spQuery = getSupabase()
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
            .eq('is_published', true)
                .limit(100);

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
            .range(offset, offset + limit - 1);

          // Reviewer profiles (one batched query) and the exact rating stats
          // are independent — run them together.
          const [enrichedReviews, spStats] = await Promise.all([
            attachReviewers(spReviews),
            fetchRatingStats('social_page_reviews', 'page_id', id),
          ]);

          return res.status(200).json({
            success: true,
            data: {
              reviews: enrichedReviews,
              total: spCount || 0,
              average_rating: parseFloat(spStats.average.toFixed(1)),
              distribution: spStats.distribution,
              limit,
              offset
            }
          });
        }
        throw error;
      }

      // Exact rating distribution + average across ALL published reviews.
      const { distribution, average } = await fetchRatingStats(
        'commander_venue_reviews', 'venue_id', id
      );

      return res.status(200).json({
        success: true,
        data: {
          reviews: reviews || [],
          total: count,
          average_rating: parseFloat(average.toFixed(1)),
          distribution,
          limit,
          offset
        }
      });
    } catch (error) {
      console.warn('Public venue reviews API error:', error);
      return res.status(500).json({
        success: false,
        error: { code: 'SERVER_ERROR', message: 'Failed to fetch reviews' }
      });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
