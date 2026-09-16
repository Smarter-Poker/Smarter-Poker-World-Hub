/**
 * Sandbox Quiz API · Save quiz results for "What Would You Do?" mode
 * POST: Save a quiz result
 * GET: Fetch user's quiz stats
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { reportApiError } from '../../../../src/lib/apiErrorHandler';

import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { persistedResult, persistenceFailure } from '../../../../src/lib/personal-assistant/persistenceContract';
import { curatedWeeklySpotById } from '../../../../src/lib/personal-assistant/weeklySpotCatalog';
import { gradeAction } from '../../../../src/lib/sandbox/actionGrading';

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
  // [Phase 6.1.15] Rate limit writes · prevents enumeration + drain attacks.
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }


      const supabase = getSupabase();
  try {
      // Auth guard
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, supabase);
      if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });
      const userId = authUser.id; // Trust JWT, not client-supplied value

      if (req.method === 'POST') {
          const { spotId, userAction } = req.body || {};
          if (!spotId || !userAction) {
              return res.status(400).json({ error: 'Missing required fields' });
          }

          let canonical = curatedWeeklySpotById(String(spotId));
          if (!canonical) {
              const { data, error: spotError } = await supabase
                  .from('sandbox_weekly_spots').select('id, correct_action').eq('id', spotId).maybeSingle();
              if (spotError || !data) return res.status(404).json({ error: 'Quiz spot not found' });
              canonical = data;
          }
          const correctAction = String(canonical.correct_action || '').slice(0, 40);
          if (!correctAction) return res.status(422).json({ error: 'Quiz spot has no answer key' });
          const isCorrect = gradeAction(userAction, correctAction);

          try {
              // Save quiz result
              const { error } = await supabase.from('sandbox_quiz_results').insert({
                  user_id: userId,
                  scenario_hash: String(spotId).slice(0, 120),
                  user_action: String(userAction).slice(0, 40),
                  correct_action: String(correctAction).slice(0, 40),
                  is_correct: typeof isCorrect === 'boolean' ? isCorrect : null,
              });

              if (error) {
                  console.warn('Quiz save error:', error);
                  return res.status(error.code === '42P01' ? 503 : 500).json(persistenceFailure(
                      'Quiz progress could not be saved. Your current score remains on this device.',
                      error.code === '42P01' ? 'storage_unavailable' : 'write_failed',
                  ));
              }

              return res.status(200).json(persistedResult({ isCorrect, correctAction }));
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
                  console.warn('Quiz fetch error:', error);
                  return res.status(error.code === '42P01' ? 503 : 500).json({
                      success: false,
                      persisted: false,
                      reason: error.code === '42P01' ? 'storage_unavailable' : 'read_failed',
                      error: 'Quiz history is temporarily unavailable.',
                  });
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

              return res.status(200).json({ success: true, persisted: true, reason: null, total, correct, accuracy, streak });
          } catch (err) {
              console.warn('Quiz stats error:', err);
              return res.status(500).json({ error: 'Internal server error' });
          }
      }

      return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
