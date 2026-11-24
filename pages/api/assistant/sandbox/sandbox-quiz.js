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
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required');
        }
        _supabase = createClient(url, key);
    }
    return _supabase;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // [Phase 6.1.15] Rate limit both reads and writes · prevents enumeration + drain attacks.
  const limit = req.method === 'GET' ? (LIMITS.read || { max: 60, windowMs: 60_000 }) : LIMITS.write;
  if (!applyRateLimit(req, res, limit)) return;

      const supabase = getSupabase();
  try {
      // Auth guard
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'Auth required' });
      const { user: authUser, error: authErr, status: authStatus } = await getServerUserWithFallback(req, supabase);
      if (authErr || !authUser) {
          return res.status(authStatus === 503 ? 503 : 401).json({
              error: authStatus === 503 ? 'Session verification unavailable' : 'Invalid token',
          });
      }
      const userId = authUser.id; // Trust JWT, not client-supplied value

      if (req.method === 'POST') {
          const { spotId, userAction } = req.body || {};
          if (typeof spotId !== 'string' || !spotId.trim() || typeof userAction !== 'string' || !userAction.trim()) {
              return res.status(400).json({ error: 'Missing required fields' });
          }
          const cleanSpotId = spotId.trim().slice(0, 120);
          const cleanUserAction = userAction.trim().slice(0, 40);

          let canonical = curatedWeeklySpotById(cleanSpotId);
          if (!canonical) {
              const { data, error: spotError } = await supabase
                  .from('sandbox_weekly_spots').select('id, correct_action').eq('id', cleanSpotId).maybeSingle();
              if (spotError) {
                  if (spotError.code === '42P01' || spotError.code === 'PGRST205') {
                      return res.status(503).json(persistenceFailure('Quiz spots are temporarily unavailable.', 'storage_unavailable'));
                  }
                  return res.status(503).json(persistenceFailure('Quiz spot lookup failed.', 'read_failed'));
              }
              if (!data) return res.status(404).json({ error: 'Quiz spot not found' });
              canonical = data;
          }
          const correctAction = String(canonical.correct_action || '').slice(0, 40);
          if (!correctAction) return res.status(422).json({ error: 'Quiz spot has no answer key' });
          const isCorrect = gradeAction(cleanUserAction, correctAction);

          try {
              // Answer-once deduplication per (user_id, scenario_hash) prevents
              // farming streaks/leaderboard scores by replaying the same spot.
              const { data: existingAnswer, error: existingErr } = await supabase
                  .from('sandbox_quiz_results')
                  .select('id, is_correct, correct_action')
                  .eq('user_id', userId)
                  .eq('scenario_hash', cleanSpotId)
                  .limit(1)
                  .maybeSingle();
              if (existingErr && existingErr.code !== '42P01') {
                  console.warn('Quiz dedup check error:', existingErr);
              }
              if (existingAnswer) {
                  return res.status(200).json(persistedResult({
                      isCorrect: Boolean(existingAnswer.is_correct),
                      correctAction: existingAnswer.correct_action || correctAction,
                      alreadyAnswered: true,
                  }));
              }

              // Save quiz result
              const { error } = await supabase.from('sandbox_quiz_results').insert({
                  user_id: userId,
                  scenario_hash: cleanSpotId,
                  user_action: cleanUserAction,
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
