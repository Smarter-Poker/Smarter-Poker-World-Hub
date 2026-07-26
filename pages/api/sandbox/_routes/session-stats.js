/**
 * GET /api/sandbox/session-stats
 * Returns aggregated coach mode analytics for the authenticated user:
 *  - Total sessions & hands
 *  - Accuracy trend (last 20 days bucketed by day)
 *  - Strongest/weakest position
 *  - Weakest street
 *
 * All three breakdowns are derived from ONE bounded fetch of the last 90 days
 * (max 2000 rows). Re-scanning the same table three times with no .limit()
 * meant supabase-js silently truncated each scan at a different 1000-row
 * window, so a heavy user's sections disagreed with each other.
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

const WINDOW_DAYS = 90;
const TREND_DAYS = 30;
const ROW_CAP = 2000;

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

          const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
          const trendStart = new Date(Date.now() - TREND_DAYS * 86400000).toISOString();

          const [summaryRes, rowsRes] = await Promise.all([
              // Lifetime totals from the accuracy view
              supabase
                  .from('sandbox_coach_accuracy')
                  .select('*')
                  .eq('user_id', userId)
                  .maybeSingle(),
              // One bounded scan powering trend + position + street breakdowns
              supabase
                  .from('sandbox_coach_results')
                  .select('created_at, is_correct, hero_position, street')
                  .eq('user_id', userId)
                  .gte('created_at', windowStart)
                  .order('created_at', { ascending: false })
                  .limit(ROW_CAP),
          ]);

          if (summaryRes?.error) console.warn('[session-stats] View error:', summaryRes.error.message);
          if (rowsRes?.error) console.warn('[session-stats] Results query error:', rowsRes.error.message);

          const summary = summaryRes?.data || null;
          const rows = rowsRes?.data || [];

          // ── Accuracy trend (last 30 days, bucketed by day) ─────────
          const buckets = {};
          // ── Position breakdown ─────────────────────────────────────
          const positions = {};
          // ── Street breakdown ───────────────────────────────────────
          const streets = {};

          rows.forEach(r => {
              if (r.created_at && r.created_at >= trendStart) {
                  const day = r.created_at.slice(0, 10);
                  if (!buckets[day]) buckets[day] = { total: 0, correct: 0 };
                  buckets[day].total++;
                  if (r.is_correct) buckets[day].correct++;
              }

              if (r.hero_position) {
                  const p = String(r.hero_position).toUpperCase();
                  if (!positions[p]) positions[p] = { total: 0, correct: 0 };
                  positions[p].total++;
                  if (r.is_correct) positions[p].correct++;
              }

              const s = String(r.street || 'preflop').toLowerCase();
              if (!streets[s]) streets[s] = { total: 0, correct: 0 };
              streets[s].total++;
              if (r.is_correct) streets[s].correct++;
          });

          const accuracyTrend = Object.entries(buckets)
              .sort(([a], [b]) => a.localeCompare(b))
              .slice(-20)
              .map(([date, { total, correct }]) => ({
                  date,
                  total,
                  correct,
                  pct: total > 0 ? Math.round(100 * correct / total) : 0,
              }));

          const positionStats = Object.entries(positions)
              .filter(([, v]) => v.total >= 2)
              .map(([pos, { total, correct }]) => ({
                  position: pos,
                  total,
                  correct,
                  pct: Math.round(100 * correct / total),
              }))
              .sort((a, b) => b.pct - a.pct);

          const topPosition = positionStats[0]?.position || null;
          const weakPosition = positionStats.length > 1
              ? positionStats[positionStats.length - 1].position
              : null;

          const streetStats = Object.entries(streets)
              .map(([street, { total, correct }]) => ({
                  street,
                  total,
                  correct,
                  pct: total > 0 ? Math.round(100 * correct / total) : 0,
              }))
              .sort((a, b) => a.pct - b.pct);

          const weakestStreet = streetStats[0]?.street || null;

          return res.status(200).json({
              success: true,
              totalHands: summary?.total_hands || 0,
              correctCount: summary?.correct_count || 0,
              accuracyPct: summary?.accuracy_pct ?? null,
              avgLeakEv: summary?.avg_leak_ev ?? null,
              accuracyTrend,
              positionStats,
              topPosition,
              weakPosition,
              streetStats,
              weakestStreet,
          });
      } catch (err) {
          console.warn('[session-stats] Handler error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
