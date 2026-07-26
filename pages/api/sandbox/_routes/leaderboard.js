/**
 * GET /api/sandbox/leaderboard
 * Weekly accuracy leaderboard from sandbox_coach_results.
 * Returns top 10 users by accuracy % (min 20 hands this week).
 *
 * Other users' auth UUIDs are never sent to the client — only the caller's own
 * row keeps its user_id (plus an `isYou` flag) so the UI can highlight it.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 20; // hard ceiling: 20k rows/week
const MIN_HANDS = 20;

/**
 * supabase-js silently caps an unbounded select at 1000 rows, which would make
 * the whole aggregation run over an arbitrary slice of the week. Page through
 * with .range() until a short page comes back.
 */
async function fetchWeekRows(supabase, weekStart) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
            .from('sandbox_coach_results')
            .select('user_id, is_correct')
            .gte('created_at', weekStart)
            .order('created_at', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            if (error.code === '42P01') return { rows: [], missing: true };
            throw error;
        }
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return { rows, missing: false };
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate
          let userId = null;
          const authHeader = req.headers.authorization;
          if (authHeader?.startsWith('Bearer ')) {
              const token = authHeader.replace('Bearer ', '');
              try {
                  const { data: authData } = await supabase.auth.getUser(token);
                  const user = authData?.user;
                  if (user) userId = user.id;
              } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
          }

          if (!userId) {
              return res.status(401).json({ success: false, error: 'Authentication required' });
          }

          // Week boundaries (Monday → Sunday)
          const now = new Date();
          const dayOfWeek = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
          monday.setHours(0, 0, 0, 0);

          const weekStart = monday.toISOString();

          const { rows, missing } = await fetchWeekRows(supabase, weekStart);
          if (missing) {
              return res.status(200).json({ success: true, leaderboard: [], userRank: null, weekStart });
          }

          // Aggregate per user
          const userStats = {};
          rows.forEach(r => {
              if (!r?.user_id) return;
              if (!userStats[r.user_id]) userStats[r.user_id] = { correct: 0, total: 0 };
              userStats[r.user_id].total++;
              if (r.is_correct) userStats[r.user_id].correct++;
          });

          // Rank once — the top-10 list is a slice of the same ranking used for
          // the caller's rank.
          const allRanked = Object.entries(userStats)
              .filter(([, v]) => v.total >= MIN_HANDS)
              .map(([uid, v]) => ({
                  user_id: uid,
                  total_hands: v.total,
                  correct_count: v.correct,
                  accuracy_pct: Math.round(100 * v.correct / v.total),
              }))
              .sort((a, b) => b.accuracy_pct - a.accuracy_pct || b.total_hands - a.total_hands);

          const top = allRanked.slice(0, 10);

          // Fetch usernames for the top 10
          const userIds = top.map(q => q.user_id);
          const usernameMap = {};
          if (userIds.length > 0) {
              const { data: profiles, error: profilesErr } = await supabase
                  .from('profiles')
                  .select('id, username, display_name')
                  .in('id', userIds);
              if (profilesErr) console.warn('[leaderboard] Profiles query error:', profilesErr.message);
              (profiles || []).forEach(p => {
                  usernameMap[p.id] = p.display_name || p.username || 'Player';
              });
          }

          const leaderboard = top.map(q => {
              const isYou = q.user_id === userId;
              return {
                  total_hands: q.total_hands,
                  correct_count: q.correct_count,
                  accuracy_pct: q.accuracy_pct,
                  username: usernameMap[q.user_id] || 'Player',
                  isYou,
                  // Only the caller's own id is echoed back — never anyone else's.
                  ...(isYou ? { user_id: userId } : {}),
              };
          });

          const userRank = allRanked.findIndex(r => r.user_id === userId) + 1;

          return res.status(200).json({
              success: true,
              leaderboard,
              userRank: userRank > 0 ? userRank : null,
              weekStart,
          });
      } catch (err) {
          console.warn('[leaderboard] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
