/**
 * Sandbox Quiz API — Save quiz results for "What Would You Do?" mode
 * POST: Save a quiz result
 * GET: Fetch user's quiz stats
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../../src/lib/sentryWrap';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

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
  // [Phase 6.1.15] Rate limit writes — prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }


      const supabase = getSupabase();
  try {
      // Auth guard
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { data: authData, error: authErr } = await supabase.auth.getUser(token);
      const authUser = authData?.user;
      if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });
      const userId = authUser.id; // Trust JWT, not client-supplied value

      if (req.method === 'POST') {
          const { scenarioHash, userAction, correctAction, isCorrect } = req.body || {};
          if (!scenarioHash || !userAction || !correctAction) {
              return res.status(400).json({ error: 'Missing required fields' });
          }

          try {
              // Save quiz result
              const { error } = await supabase.from('sandbox_quiz_results').insert({
                  user_id: userId,
                  scenario_hash: String(scenarioHash).slice(0, 120),
                  user_action: String(userAction).slice(0, 40),
                  correct_action: String(correctAction).slice(0, 40),
                  is_correct: typeof isCorrect === 'boolean' ? isCorrect : null,
              });

              if (error) {
                  // If table doesn't exist, silently succeed (quiz works client-side)
                  console.warn('Quiz save error:', error);
                  return res.status(200).json({ success: true, persisted: false });
              }

              return res.status(200).json({ success: true });
          } catch (err) {
              console.warn('Quiz API error:', err);
              return res.status(500).json({ error: 'Internal server error' });
          }
      }

      if (req.method === 'GET') {

          try {
              const { data, error } = await supabase
                  .from('sandbox_quiz_results')
                  .select('is_correct, created_at')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: false })
                  .limit(100);

              if (error) {
                  // If table doesn't exist, return empty stats (quiz works client-side)
                  console.warn('Quiz fetch error:', error);
                  return res.status(200).json({ total: 0, correct: 0, accuracy: 0, streak: 0 });
              }

              const total = data?.length || 0;
              const correct = data?.filter(r => r.is_correct).length || 0;
              const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;

              // Calculate current streak
              let streak = 0;
              for (const r of (data || [])) {
                  if (r.is_correct) streak++;
                  else break;
              }

              return res.status(200).json({ total, correct, accuracy, streak });
          } catch (err) {
              console.warn('Quiz stats error:', err);
              return res.status(500).json({ error: 'Internal server error' });
          }
      }

      return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
