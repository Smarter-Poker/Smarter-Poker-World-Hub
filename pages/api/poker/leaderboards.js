/**
 * Poker Leaderboards API
 *
 * GET /api/poker/leaderboards?type=<checkins|reviews|activity|overall>&period=<week|month|all>&limit=25
 *
 * Returns ranked players based on poker engagement metrics.
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Supabase caps a single response at the project max (1000 rows), so an
// unbounded select silently truncated the leaderboard input set. Page through
// with .range() (same approach events-calendar.js uses) up to a hard ceiling.
const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // 20k rows ceiling — enough for the ranking window

async function fetchAllRows(buildQuery) {
    let rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await buildQuery().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        if (error) {
            console.warn('[leaderboards] paged fetch error:', error.message);
            break;
        }
        if (!data || data.length === 0) break;
        rows = rows.concat(data);
        if (data.length < PAGE_SIZE) break;
    }
    return rows;
}

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      // Guard on the values getSupabase() ACTUALLY uses. This used to require
      // SUPABASE_SERVICE_ROLE_KEY at module scope with no fallback, so on any
      // deploy without it (previews, local dev) this one endpoint hard-failed
      // with an opaque 500 while every sibling route fell back to the anon key.
      if (!(supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL)
          || !(supabaseServiceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
          return res.status(500).json({ error: 'Server configuration error' });
      }

      // This handler pages through up to 60k rows across three tables and
      // aggregates in JS; without a cache header every single visitor re-ran
      // the whole scan.
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

      const safeQ = (v) => v ? (Array.isArray(v) ? String(v[0]) : typeof v === 'object' ? null : String(v)) : v;
      const type = safeQ(req.query.type) || 'overall';
      const period = safeQ(req.query.period) || 'all';
      const limitRaw = safeQ(req.query.limit) || '25';
      const maxLimit = Math.min(parseInt(limitRaw) || 25, 100);

      // Calculate date filter
      let dateFilter = null;
      const now = new Date();
      if (period === 'week') {
          dateFilter = new Date(now.getTime() - 7 * 86400000).toISOString();
      } else if (period === 'month') {
          dateFilter = new Date(now.getTime() - 30 * 86400000).toISOString();
      }
      
      // Vercel Edge Caching: Serve stale while revalidating in the background.
      // Limits database hits to 1 per minute max across all users.
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

      try {
          // Keyed by user_id. The merge used to be `leaders.find(...)` inside a
          // forEach over every distinct user — O(n^2) on the aggregate path.
          const leaderMap = new Map();
          const bumpLeader = (id, field, count, weight) => {
              let entry = leaderMap.get(id);
              if (!entry) {
                  entry = { user_id: id, checkins: 0, reviews: 0, posts: 0, score: 0 };
                  leaderMap.set(id, entry);
              }
              entry[field] = count;
              entry.score += count * weight;
          };

          if (type === 'checkins' || type === 'overall') {
              const checkins = await fetchAllRows(() => {
                  let q = getSupabase()
                      .from('venue_checkins')
                      .select('user_id, created_at')
                      .order('created_at', { ascending: false });
                  if (dateFilter) q = q.gte('created_at', dateFilter);
                  return q;
              });

              const counts = {};
              (checkins || []).forEach(c => {
                  counts[c.user_id] = (counts[c.user_id] || 0) + 1;
              });

              if (type === 'checkins') {
                  const sorted = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                  const userIds = sorted.map(([id]) => id);
                  const { data: profiles } = await getSupabase()
                      .from('profiles')
                      .select('id, username, full_name, avatar_url')
                      .in('id', userIds)
                          .limit(100);
                  const profileMap = {};
                  (profiles || []).forEach(p => { profileMap[p.id] = p; });

                  return res.status(200).json({
                      type: 'checkins',
                      period,
                      leaders: sorted.map(([id, count], i) => ({
                          rank: i + 1,
                          user: profileMap[id] || { id, username: 'Player' },
                          count,
                          metric: 'check-ins'
                      }))
                  });
              }

              // Store for overall
              Object.entries(counts || {}).forEach(([id, count]) => bumpLeader(id, 'checkins', count, 2));
          }

          if (type === 'reviews' || type === 'overall') {
              const reviews = await fetchAllRows(() => {
                  let q = getSupabase()
                      .from('venue_reviews')
                      .select('user_id, created_at')
                      .order('created_at', { ascending: false });
                  if (dateFilter) q = q.gte('created_at', dateFilter);
                  return q;
              });

              const counts = {};
              (reviews || []).forEach(r => {
                  counts[r.user_id] = (counts[r.user_id] || 0) + 1;
              });

              if (type === 'reviews') {
                  const sorted = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                  const userIds = sorted.map(([id]) => id);
                  const { data: profiles } = await getSupabase()
                      .from('profiles')
                      .select('id, username, full_name, avatar_url')
                      .in('id', userIds)
                          .limit(100);
                  const profileMap = {};
                  (profiles || []).forEach(p => { profileMap[p.id] = p; });

                  return res.status(200).json({
                      type: 'reviews',
                      period,
                      leaders: sorted.map(([id, count], i) => ({
                          rank: i + 1,
                          user: profileMap[id] || { id, username: 'Player' },
                          count,
                          metric: 'reviews'
                      }))
                  });
              }

              Object.entries(counts || {}).forEach(([id, count]) => bumpLeader(id, 'reviews', count, 3));
          }

          if (type === 'activity' || type === 'overall') {
              const posts = await fetchAllRows(() => {
                  let q = getSupabase()
                      .from('social_posts')
                      .select('author_id, created_at')
                      // Deleted and non-public posts used to count toward a public
                      // ranking, which made the board farmable: post, delete,
                      // repeat, and keep the credit with no visible content.
                      // `not.is.true` also matches NULL (the legacy default).
                      // NULL visibility is treated as public, matching
                      // migrations/20260422_fix_like_count_drift_and_trigger.sql.
                      .not('is_deleted', 'is', true)
                      .not('is_flagged', 'is', true)
                      .or('visibility.is.null,visibility.eq.public')
                      .order('created_at', { ascending: false });
                  if (dateFilter) q = q.gte('created_at', dateFilter);
                  return q;
              });

              const counts = {};
              (posts || []).forEach(p => {
                  if (p.author_id) counts[p.author_id] = (counts[p.author_id] || 0) + 1;
              });

              if (type === 'activity') {
                  const sorted = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, maxLimit);
                  const userIds = sorted.map(([id]) => id);
                  const { data: profiles } = await getSupabase()
                      .from('profiles')
                      .select('id, username, full_name, avatar_url')
                      .in('id', userIds)
                          .limit(100);
                  const profileMap = {};
                  (profiles || []).forEach(p => { profileMap[p.id] = p; });

                  return res.status(200).json({
                      type: 'activity',
                      period,
                      leaders: sorted.map(([id, count], i) => ({
                          rank: i + 1,
                          user: profileMap[id] || { id, username: 'Player' },
                          count,
                          metric: 'posts'
                      }))
                  });
              }

              Object.entries(counts || {}).forEach(([id, count]) => bumpLeader(id, 'posts', count, 1));
          }

          // Overall - return combined scores
          const leaders = Array.from(leaderMap.values());
          leaders.sort((a, b) => b.score - a.score);
          const topLeaders = leaders.slice(0, maxLimit);
          const userIds = topLeaders.map(l => l.user_id);
          const { data: profiles } = await getSupabase()
              .from('profiles')
              .select('id, username, full_name, avatar_url')
              .in('id', userIds)
                  .limit(100);
          const profileMap = {};
          (profiles || []).forEach(p => { profileMap[p.id] = p; });

          return res.status(200).json({
              type: 'overall',
              period,
              leaders: topLeaders.map((l, i) => ({
                  rank: i + 1,
                  user: profileMap[l.user_id] || { id: l.user_id, username: 'Player' },
                  score: l.score,
                  checkins: l.checkins,
                  reviews: l.reviews,
                  posts: l.posts
              }))
          });

      } catch (error) {
          console.warn('Leaderboard error:', error);
          return res.status(500).json({ error: 'Failed to load leaderboards' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

