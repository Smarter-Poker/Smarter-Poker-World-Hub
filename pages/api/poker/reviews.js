import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { applyCors } = require('../../../src/lib/cors');
import { reportApiError } from '../../../src/lib/sentryWrap';
import { getGrokClient } from '../../../src/lib/grokClient';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}



const CATEGORY_KEYS = ['dealers', 'atmosphere', 'food_drinks', 'waitlist_speed', 'game_selection'];
const CATEGORY_COLUMNS = CATEGORY_KEYS.map(k => k + '_rating');

export default async function handler(req, res) {
    if (!applyCors(req, res, { methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS', headers: 'Content-Type, x-user-id, Authorization' })) return;
try {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // POST — Create a review with 5-category ratings
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (req.method === 'POST') {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for reviews' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const user_id = authUser.id;

        // Enforce moderation blocks
        const { data: profileCheck } = await getSupabase().from('profiles').select('can_review').eq('id', user_id).maybeSingle();
        if (profileCheck && profileCheck.can_review === false) {
           return res.status(403).json({ success: false, error: 'Your account has been restricted from leaving reviews due to community guideline violations.' });
        }

        const { venue_id, rating, review_text, reviewer_name, category_ratings } = req.body;

        if (!venue_id || !rating) {
          return res.status(400).json({ success: false, error: 'Missing required fields: venue_id, rating' });
        }

        const venueIdStr = String(venue_id);
        const ratingNum = parseInt(rating, 10);
        if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
          return res.status(400).json({ success: false, error: 'Rating must be an integer between 1 and 5' });
        }

        // Grok AI Auto-Triage Moderation
        let is_flagged = false;
        let flag_reason = null;

        if (review_text && review_text.trim() && process.env.XAI_API_KEY) {
           try {
             const grok = getGrokClient();
             const aiResult = await grok.chat.completions.create({
               model: 'gpt-4o',  // maps to grok-3 via grokClient
               messages: [{
                 role: 'system',
                 content: 'You are an automated moderation system. Analyze this poker venue user review. If it contains hate speech, extreme profanity, discrimination, or spam, respond with ONLY the word "FLAG". If acceptable, respond with ONLY "PASS".'
               }, {
                 role: 'user',
                 content: review_text
               }],
               temperature: 0,
               max_tokens: 10
             });
             const decision = aiResult.choices?.[0]?.message?.content?.trim();
             if (decision === 'FLAG') {
                is_flagged = true;
                flag_reason = 'AI auto-flagged for toxicity';
             }
           } catch (aiErr) {
             console.warn("[Moderation AI] error:", aiErr);
           }
        }

        // Check if user is a verified player — bankroll_sessions OR user_venue_checkins
        let is_verified_player = false;
        try {
          const { data: sessions } = await getSupabase()
            .from('bankroll_sessions')
            .select('id')
            .eq('user_id', user_id)
            .eq('venue_id', venue_id)
            .limit(1);
          is_verified_player = sessions && sessions.length > 0;
        } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }

        // Fallback: check venue check-ins if bankroll didn't match
        if (!is_verified_player) {
          try {
            const { data: checkins } = await getSupabase()
              .from('user_venue_checkins')
              .select('id')
              .eq('user_id', user_id)
              .eq('venue_id', venueIdStr)
              .limit(1);
            is_verified_player = checkins && checkins.length > 0;
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Also check venue_checkins (the social check-in table)
        if (!is_verified_player) {
          try {
            const { data: socialCheckins } = await getSupabase()
              .from('venue_checkins')
              .select('id')
              .eq('user_id', user_id)
              .eq('venue_id', venueIdStr)
              .limit(1);
            is_verified_player = socialCheckins && socialCheckins.length > 0;
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Build insert payload
        const insertPayload = {
          venue_id: venueIdStr,
          user_id,
          rating: ratingNum,
          review_text: (review_text || '').trim() || null,
          reviewer_name: (reviewer_name || '').trim() || 'Anonymous',
          is_verified_player,
          helpful_count: 0,
          unhelpful_count: 0,
          is_flagged,
          flag_reason,
          created_at: new Date().toISOString(),
        };

        // Persist category ratings as first-class columns
        if (category_ratings && typeof category_ratings === 'object') {
          for (const key of CATEGORY_KEYS) {
            const val = category_ratings[key];
            if (Number.isInteger(val) && val >= 1 && val <= 5) {
              insertPayload[key + '_rating'] = val;
            }
          }
        }

        // Also store in metadata for backward compat
        const metadata = {};
        if (category_ratings && typeof category_ratings === 'object') {
          for (const [key, val] of Object.entries(category_ratings || {})) {
            if (Number.isInteger(val) && val >= 1 && val <= 5) {
              metadata[key + '_rating'] = val;
            }
          }
        }
        if (is_verified_player) metadata.verified_player = true;
        if (Object.keys(metadata || {}).length > 0) insertPayload.metadata = metadata;

        const { data, error } = await getSupabase()
          .from('venue_reviews')
          .insert(insertPayload)
          .select()
          .maybeSingle();

        if (error) {
          console.warn('Error creating review:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        // Recalculate venue trust_score from review average
        try {
          const { error: trustScoreErr } = await getSupabase().rpc('recalculate_venue_trust_score', { p_venue_id: venueIdStr });
          if (trustScoreErr) throw trustScoreErr;
        } catch (rpcErr) {
          console.warn('[Reviews] trust_score recalc failed (non-fatal):', rpcErr.message);
        }

        return res.status(201).json({ success: true, review: data });
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // GET — Fetch reviews with category averages + sorting
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (req.method === 'GET') {
        const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
        const venue_id = safeQ(req.query.venue_id);
        const venue_ids = safeQ(req.query.venue_ids);
        const stats_only = safeQ(req.query.stats_only);
        const limit = safeQ(req.query.limit) || '20';
        const offset = safeQ(req.query.offset) || '0';
        const sort = safeQ(req.query.sort) || 'newest';

        // --- Bulk stats endpoint for venue cards ---
        if (stats_only === 'true' && venue_ids) {
          const ids = venue_ids.split(',').map(v => v.trim()).filter(Boolean).slice(0, 50);
          if (ids.length === 0) return res.status(200).json({ success: true, stats: {} });

          // PostgREST caps a single response at the project max (1000 rows), and
          // this query had no .limit()/.range() at all — so once a busy set of
          // venues held more than 1000 reviews between them the card ratings on
          // the Poker Near Me grid became an arbitrary partial average. Page
          // through instead of taking whatever the first response happened to
          // contain.
          const PAGE = 1000;
          const MAX_PAGES = 20; // 20,000 reviews across the 50 requested venues
          let allRatings = [];
          let rErr = null;
          for (let page = 0; page < MAX_PAGES; page++) {
            const { data: ratingPage, error: pageErr } = await getSupabase()
              .from('venue_reviews')
              .select('venue_id, rating')
              .in('venue_id', ids)
              // Moderation: AI-flagged reviews must not count toward public ratings
              .or('is_flagged.is.null,is_flagged.eq.false')
              .order('id', { ascending: true })
              .range(page * PAGE, (page + 1) * PAGE - 1);
            if (pageErr) { rErr = pageErr; break; }
            if (!ratingPage || ratingPage.length === 0) break;
            allRatings = allRatings.concat(ratingPage);
            if (ratingPage.length < PAGE) break;
          }

          if (rErr) {
            console.warn('Error fetching bulk stats:', rErr);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }

          const stats = {};
          for (const id of ids) stats[id] = { avg_rating: 0, total_reviews: 0 };
          if (allRatings) {
            const buckets = {};
            for (const r of allRatings) {
              if (!buckets[r.venue_id]) buckets[r.venue_id] = [];
              buckets[r.venue_id].push(r.rating);
            }
            for (const [vid, ratings] of Object.entries(buckets || {})) {
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

        const venueIdStr = String(venue_id);
        const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
        const offsetNum = parseInt(offset, 10) || 0;

        // ── STATS: computed over EVERY review, not the first 200 ─────────────
        // The old code pulled 200 full rows, reported `total_reviews =
        // reviews.length` and averaged those 200 — so a venue with 500 reviews
        // permanently displayed "200 reviews" with a stale average, and
        // offset > 200 returned an empty page. Stats now page over the
        // lightweight rating columns only, and the review list is paginated
        // separately in SQL.
        const STAT_PAGE = 1000;
        const STAT_MAX_PAGES = 20;
        let statRows = [];
        for (let page = 0; page < STAT_MAX_PAGES; page++) {
          const { data: statPage, error: statErr } = await getSupabase()
            .from('venue_reviews')
            .select('rating, is_verified_player, dealers_rating, atmosphere_rating, food_drinks_rating, waitlist_speed_rating, game_selection_rating')
            .eq('venue_id', venueIdStr)
            // Moderation: hide AI-flagged reviews from the public feed. Older rows
            // predating the moderation columns have is_flagged NULL, so keep those.
            .or('is_flagged.is.null,is_flagged.eq.false')
            .order('id', { ascending: true })
            .range(page * STAT_PAGE, (page + 1) * STAT_PAGE - 1);
          if (statErr) {
            console.warn('Error fetching review stats:', statErr);
            return res.status(500).json({ success: false, error: 'Internal server error' });
          }
          if (!statPage || statPage.length === 0) break;
          statRows = statRows.concat(statPage);
          if (statPage.length < STAT_PAGE) break;
        }

        // Exact total straight from Postgres, so it stays right even past the
        // stat-paging ceiling.
        let total_reviews = statRows.length;
        try {
          const { count: exactCount } = await getSupabase()
            .from('venue_reviews')
            .select('id', { count: 'exact', head: true })
            .eq('venue_id', venueIdStr)
            .or('is_flagged.is.null,is_flagged.eq.false');
          if (typeof exactCount === 'number') total_reviews = exactCount;
        } catch (countErr) {
          console.warn('[Reviews] exact count failed (non-fatal):', countErr?.message || countErr);
        }

        const avg_rating = statRows.length > 0
          ? parseFloat((statRows.reduce((sum, r) => sum + r.rating, 0) / statRows.length).toFixed(2))
          : 0;

        // Rating distribution
        const rating_distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        statRows.forEach((r) => {
          rating_distribution[r.rating] = (rating_distribution[r.rating] || 0) + 1;
        });

        // Category averages
        const category_averages = {};
        for (const col of CATEGORY_COLUMNS) {
          const vals = statRows.map(r => r[col]).filter(v => v != null && v >= 1 && v <= 5);
          category_averages[col.replace('_rating', '')] = vals.length > 0
            ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
            : null;
        }

        // Verified count
        const verified_count = statRows.filter(r => r.is_verified_player).length;

        // ── LIST: sorted and paged in SQL ────────────────────────────────
        let listQuery = getSupabase()
          .from('venue_reviews')
          .select('id, user_id, venue_id, rating, review_text, reviewer_name, is_verified_player, helpful_count, unhelpful_count, dealers_rating, atmosphere_rating, food_drinks_rating, waitlist_speed_rating, game_selection_rating, created_at, metadata')
          .eq('venue_id', venueIdStr)
          .or('is_flagged.is.null,is_flagged.eq.false');

        switch (sort) {
          case 'highest':
            listQuery = listQuery.order('rating', { ascending: false }).order('created_at', { ascending: false });
            break;
          case 'lowest':
            listQuery = listQuery.order('rating', { ascending: true }).order('created_at', { ascending: false });
            break;
          case 'helpful':
            listQuery = listQuery.order('helpful_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
            break;
          case 'verified':
            listQuery = listQuery.eq('is_verified_player', true).order('created_at', { ascending: false });
            break;
          case 'newest':
          default:
            listQuery = listQuery.order('created_at', { ascending: false });
            break;
        }

        const { data: listRows, error: reviewError } = await listQuery
          .range(offsetNum, offsetNum + limitNum - 1);

        if (reviewError) {
          console.warn('Error fetching reviews:', reviewError);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        const paginatedReviews = listRows || [];

        // Fetch reviewer profiles (batch)
        const userIds = [...new Set(paginatedReviews.map(r => r.user_id).filter(Boolean))];
        let profileMap = {};
        if (userIds.length > 0) {
          try {
            const { data: profiles } = await getSupabase()
              .from('profiles')
              .select('id, username, avatar_url, full_name')
              .in('id', userIds);
            if (profiles) {
              for (const p of profiles) profileMap[p.id] = p;
            }
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        // Attach profile to each review
        const enrichedReviews = paginatedReviews.map(r => ({
          ...r,
          profile: profileMap[r.user_id] || null,
        }));

        return res.status(200).json({
          success: true,
          reviews: enrichedReviews,
          avg_rating,
          total_reviews,
          rating_distribution,
          category_averages,
          verified_count,
        });
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // DELETE — Remove own review
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (req.method === 'DELETE') {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required for delete' });
        const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
        /* removed duplicate authUser */
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        const safeQ2 = (v) => Array.isArray(v) ? v[0] : v;
        const review_id = safeQ2(req.query.review_id);
        const delVenueId = safeQ2(req.query.venue_id);
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
          console.warn('Error deleting review:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
        }

        if (!data || data.length === 0) {
          return res.status(404).json({ success: false, error: 'Review not found or not owned by user' });
        }

        // Recalculate trust score after deletion. RPC errors don't throw —
        // capture explicitly so a real failure logs instead of leaving the
        // venue trust_score stale.
        const deletedVenueId = delVenueId || data[0]?.venue_id;
        if (deletedVenueId) {
          try {
            const { error: trustErr } = await getSupabase().rpc('recalculate_venue_trust_score', { p_venue_id: String(deletedVenueId) });
            if (trustErr) {
              console.warn('[Reviews DELETE] trust_score recalc RPC error (score stale):', trustErr?.message || trustErr);
            }
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }

        return res.status(200).json({ success: true, deleted: data[0] });
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // PATCH — Helpful / Unhelpful voting
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (req.method === 'PATCH') {
        // SECURITY: a vote used to be accepted from review_id + action alone, so
        // any script could inflate helpful_count and own the "Most Helpful" sort.
        // Require a real, server-verified Supabase JWT. Deliberately NOT the
        // header-fallback helper: x-user-id (and anything else the client sends)
        // is client-controlled and is not proof of identity for a write like this.
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required to vote' });
        const { data: authData, error: authErr } = await getSupabase().auth.getUser(token);
        const authUser = authData?.user;
        if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

        // KNOWN GAP — this blocks anonymous stuffing, not per-user repeat voting.
        // One logged-in account can still PATCH the same review_id N times and add
        // N to the count, because there is nowhere to record who already voted.
        // Real dedup needs a review_votes(user_id, review_id, action) table with a
        // UNIQUE (user_id, review_id) constraint: insert the vote row first, treat
        // a unique-violation (23505) as "already voted" (or as a switch/undo when
        // the action differs), and only then move the counter. That table does not
        // exist yet, so it cannot be done here.
        const { review_id, action } = req.body;
        if (!review_id || !['helpful', 'unhelpful'].includes(action)) {
          return res.status(400).json({ success: false, error: 'review_id and action ("helpful" or "unhelpful") required' });
        }

        const column = action === 'helpful' ? 'helpful_count' : 'unhelpful_count';

        // Users cannot vote on their own review.
        const { data: reviewRow, error: fetchErr } = await getSupabase()
          .from('venue_reviews')
          .select('id, user_id, helpful_count, unhelpful_count')
          .eq('id', review_id)
          .maybeSingle();

        if (fetchErr || !reviewRow) {
          return res.status(404).json({ success: false, error: 'Review not found' });
        }
        if (reviewRow.user_id && String(reviewRow.user_id) === String(authUser.id)) {
          return res.status(403).json({ success: false, error: 'You cannot vote on your own review' });
        }

        // Compare-and-set increment: the plain read-then-write lost concurrent votes.
        // Retry a few times if another vote landed between our read and write.
        let current = reviewRow[column] || 0;
        let updatedRows = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: updated, error: updateErr } = await getSupabase()
            .from('venue_reviews')
            .update({ [column]: current + 1 })
            .eq('id', review_id)
            .eq(column, current)
            .select(`id, ${column}`);

          if (updateErr) {
            console.warn(`Error updating ${action} count:`, updateErr);
            return res.status(500).json({ success: false, error: updateErr.message });
          }

          if (updated && updated.length > 0) {
            updatedRows = updated;
            break;
          }

          // Row changed underneath us — re-read and retry
          const { data: fresh } = await getSupabase()
            .from('venue_reviews')
            .select(`id, ${column}`)
            .eq('id', review_id)
            .maybeSingle();
          if (!fresh) return res.status(404).json({ success: false, error: 'Review not found' });
          current = fresh[column] || 0;
        }

        if (!updatedRows) {
          return res.status(409).json({ success: false, error: 'Vote conflicted, please retry' });
        }

        return res.status(200).json({ success: true, [column]: updatedRows[0][column] });
      }

      return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
    } catch (err) {
      console.warn('Reviews API error:', err);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
