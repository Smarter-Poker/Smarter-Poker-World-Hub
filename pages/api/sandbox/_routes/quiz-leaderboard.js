/**
 * GET /api/sandbox/quiz-leaderboard
 * Weekly quiz accuracy leaderboard from sandbox_quiz_results.
 *
 * Contract: 200 { success: true, entries: [{ userId, name, accuracy, total, streak }] }
 *   sorted by accuracy desc (tie-break: more attempts), min 3 attempts, top `limit`.
 *   401 { success: false } without a valid Bearer JWT.
 *
 * Aggregation happens server-side with the service-role client so the browser
 * never queries other users' quiz rows directly. Other users' auth UUIDs are
 * never sent to the client — only the caller's own row keeps its real id; every
 * other entry gets a stable non-reversible short id so the UI can key on it.
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
const MIN_ATTEMPTS = 3;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * supabase-js silently caps an unbounded select at 1000 rows, which would make
 * the aggregation run over an arbitrary slice. Page through with .range() until
 * a short page comes back. Rows come back oldest-first so per-user streaks can
 * be walked chronologically.
 */
async function fetchWeekRows(supabase, weekStart) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
            .from('sandbox_quiz_results')
            .select('user_id, is_correct, created_at')
            .gte('created_at', weekStart)
            .order('created_at', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);

        if (error) {
            // Table not provisioned yet — behave like "no data" rather than 500.
            if (error.code === '42P01') return { rows: [], missing: true };
            throw error;
        }
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
    }
    return { rows, missing: false };
}

// Stable, non-reversible short id for users other than the caller.
function anonId(userId) {
    let hash = 0;
    const str = String(userId);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return `anon-${Math.abs(hash).toString(36)}`;
}

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      try {
          const supabase = getSupabase();

          // Authenticate — JWT ONLY (never a userId from the query string)
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

          const parsedLimit = parseInt(req.query.limit, 10);
          const limit = Number.isFinite(parsedLimit)
              ? Math.max(1, Math.min(MAX_LIMIT, parsedLimit))
              : DEFAULT_LIMIT;

          // Week boundaries (Monday -> Sunday)
          const now = new Date();
          const dayOfWeek = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
          monday.setHours(0, 0, 0, 0);
          const weekStart = monday.toISOString();

          const { rows, missing } = await fetchWeekRows(supabase, weekStart);
          if (missing) {
              return res.status(200).json({ success: true, entries: [], weekStart });
          }

          // Aggregate per user, walking rows in chronological order so the best
          // streak is a real streak (not a reverse-chronological artifact).
          const userStats = {};
          rows.forEach(r => {
              if (!r?.user_id) return;
              if (!userStats[r.user_id]) userStats[r.user_id] = { correct: 0, total: 0, streak: 0, current: 0 };
              const u = userStats[r.user_id];
              u.total += 1;
              if (r.is_correct) {
                  u.correct += 1;
                  u.current += 1;
                  if (u.current > u.streak) u.streak = u.current;
              } else {
                  u.current = 0;
              }
          });

          const ranked = Object.entries(userStats)
              .filter(([, v]) => v.total >= MIN_ATTEMPTS)
              .map(([uid, v]) => ({
                  uid,
                  accuracy: Math.round(v.correct / v.total * 100),
                  total: v.total,
                  streak: v.streak,
              }))
              .sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)
              .slice(0, limit);

          // Display names from profiles (best effort — missing table is fine)
          const nameMap = {};
          if (ranked.length > 0) {
              try {
                  const { data: profiles, error: profilesErr } = await supabase
                      .from('profiles')
                      .select('id, username, display_name')
                      .in('id', ranked.map(r => r.uid));
                  if (profilesErr) console.warn('[quiz-leaderboard] Profiles query error:', profilesErr.message);
                  (profiles || []).forEach(p => {
                      nameMap[p.id] = p.display_name || p.username || null;
                  });
              } catch (profileErr) {
                  console.warn('[quiz-leaderboard] Profiles lookup failed:', profileErr?.message || profileErr);
              }
          }

          const entries = ranked.map(r => {
              const isYou = r.uid === userId;
              return {
                  userId: isYou ? userId : anonId(r.uid),
                  name: isYou ? (nameMap[r.uid] || 'You') : (nameMap[r.uid] || `Player ${anonId(r.uid).slice(5, 11)}`),
                  accuracy: r.accuracy,
                  total: r.total,
                  streak: r.streak,
                  isYou,
              };
          });

          return res.status(200).json({ success: true, entries, weekStart });
      } catch (err) {
          console.warn('[quiz-leaderboard] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
