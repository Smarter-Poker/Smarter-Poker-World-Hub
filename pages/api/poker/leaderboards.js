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

      if (!supabaseUrl || !supabaseServiceKey) {
          return res.status(500).json({ error: 'Server configuration error' });
      }

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

      try {
          const leaders = [];

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
              Object.entries(counts || {}).forEach(([id, count]) => {
                  const existing = leaders.find(l => l.user_id === id);
                  if (existing) { existing.checkins = count; existing.score += count * 2; }
                  else { leaders.push({ user_id: id, checkins: count, reviews: 0, posts: 0, score: count * 2 }); }
              });
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

              Object.entries(counts || {}).forEach(([id, count]) => {
                  const existing = leaders.find(l => l.user_id === id);
                  if (existing) { existing.reviews = count; existing.score += count * 3; }
                  else { leaders.push({ user_id: id, checkins: 0, reviews: count, posts: 0, score: count * 3 }); }
              });
          }

          if (type === 'activity' || type === 'overall') {
              const posts = await fetchAllRows(() => {
                  let q = getSupabase()
                      .from('social_posts')
                      .select('author_id, created_at')
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

              Object.entries(counts || {}).forEach(([id, count]) => {
                  const existing = leaders.find(l => l.user_id === id);
                  if (existing) { existing.posts = count; existing.score += count; }
                  else { leaders.push({ user_id: id, checkins: 0, reviews: 0, posts: count, score: count }); }
              });
          }

          // Overall - return combined scores
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

