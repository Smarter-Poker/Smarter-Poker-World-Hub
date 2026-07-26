/**
 * GET /api/sandbox/macro-analysis
 * W6-4: Analyzes up to 1000 recent sandbox_coach_results for systemic leaks.
 *
 * Column contract (see coach-result.js insert): user_id, session_id, hero_hand,
 * hero_position, street (lowercase), board, user_pick, gto_action, is_correct,
 * ev_delta. There is no `position` / `board_texture` column.
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

const STREET_LABELS = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

export default async function handler(req, res) {
  try {
      if (!applyRateLimit(req, res, LIMITS.read || { max: 120, windowMs: 60_000 })) return;

      if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

      try {
          const supabase = getSupabase();

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

          if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

          const { data: rows, error } = await supabase
              .from('sandbox_coach_results')
              .select('is_correct, ev_delta, hero_position, street')
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
              .limit(1000);

          if (error) {
              if (error.code === '42P01') {
                  return res.status(200).json({ success: true, insufficientData: true, total: 0 });
              }
              throw error;
          }
          if (!rows || rows.length < 50) {
              return res.status(200).json({ success: true, insufficientData: true, total: rows?.length || 0 });
          }

          // Deterministic analysis. Streets are stored lowercase — bucket on the
          // normalized value and capitalize only for display.
          let totalEvLost = 0;
          const streetErrors = { preflop: 0, flop: 0, turn: 0, river: 0 };
          const positionErrors = {};

          rows.forEach(r => {
              if (r.is_correct) return;
              totalEvLost += Math.abs(Number(r.ev_delta) || 0);

              const s = String(r.street || 'preflop').toLowerCase();
              if (s in streetErrors) streetErrors[s] += 1;

              const pos = r.hero_position ? String(r.hero_position).toUpperCase() : null;
              if (pos) positionErrors[pos] = (positionErrors[pos] || 0) + 1;
          });

          const totalStreetErrors = Object.values(streetErrors).reduce((a, b) => a + b, 0);
          const biggestStreetKey = totalStreetErrors > 0
              ? Object.keys(streetErrors).reduce((a, b) => (streetErrors[a] >= streetErrors[b] ? a : b))
              : null;
          const biggestStreet = biggestStreetKey ? STREET_LABELS[biggestStreetKey] : 'None';
          const biggestPos = Object.keys(positionErrors).length > 0
              ? Object.keys(positionErrors).reduce((a, b) => (positionErrors[a] >= positionErrors[b] ? a : b))
              : 'Unknown';

          const insights = [
              `Over the last ${rows.length} hands, you've lost ${totalEvLost.toFixed(2)} EV due to suboptimal decisions.`,
          ];

          if (biggestStreetKey) {
              insights.push(`Your most problematic street is the **${biggestStreet}**, accounting for ${streetErrors[biggestStreetKey]} errors.`);
          } else {
              insights.push('No street stands out as a systemic leak — your errors are evenly spread.');
          }

          if (biggestPos !== 'Unknown') {
              insights.push(`Positionally, you struggle the most when playing from **${biggestPos}**.`);
          }

          // Basic heuristic
          if (streetErrors.river > streetErrors.flop * 1.5 && streetErrors.river > 0) {
              insights.push('You are bleeding EV on the River. Focus on polarized range calling logic.');
          } else if (streetErrors.preflop > rows.length * 0.1) {
              insights.push('Your Preflop fundamentals need work. Review opening and 3-betting charts before tackling postflop.');
          } else {
              insights.push('Your preflop baseline is solid, but you have systemic postflop leaks requiring deeper solver study.');
          }

          return res.status(200).json({
              success: true,
              totalHands: rows.length,
              totalEvLost,
              biggestStreet,
              biggestPos,
              streetErrors,
              insights,
          });
      } catch (err) {
          console.warn('[macro-analysis] Error:', err);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
