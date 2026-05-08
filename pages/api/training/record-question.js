/**
 * POST /api/training/record-question
 * Records that a user has seen/answered a question (for no-repeat tracking)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withRetry } from '../../../src/lib/supabaseRetry';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

// ── Lazy Supabase getter (SSG-safe) ─────────────────────────────
let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
    }
    return _supabase;
}
export default async function handler(req, res) {
  try {
      withTiming(res);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          if (!applyRateLimit(req, res, LIMITS.write)) return;
      }

      // Require JWT auth for write operations
      if (req.method !== 'GET') {
          const _token = req.headers.authorization?.replace('Bearer ', '');
          if (!_token) return res.status(401).json({ success: false, error: 'Authentication required' });
          const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
          const _authUser = authData?.user;
          if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });
          if (req.body) req.body.userId = _authUser.id;
      }

      if (req.method !== 'POST') {
          return res.status(405).json({ success: false, error: 'Method not allowed' });
      }

      // Body size guard (10KB max)
      const bodySize = JSON.stringify(req.body || {}).length;
      if (bodySize > 10240) {
          return res.status(413).json({ success: false, error: 'Request body too large' });
      }

      const {
          userId, gameId, questionId, isCorrect, level,
          // ═══ PHASE 14: Spot metadata for weak-spot targeting ═══
          heroPosition, villainPosition, street, classification, evLoss,
          spotType, // e.g. 'facing_cbet', 'open_raise', '3bet_defense'
      } = req.body;

      // BUG FIX (2026-05-08, MAX-RIGOR audit): The two canonical frontend callers
      // (`src/hooks/useGTOTrainer.js:386`, `src/components/training/utils/questionGenerator.js:212`)
      // both POST `selectedAnswer`, but this handler previously only destructured
      // `answerId`. Result: `training_answers.answer_id` was NULL on every recorded
      // question, breaking downstream analytics (mistake-pattern grouping,
      // weak-spot targeting, replay-theater, leaderboards) that read `answer_id`.
      // Accept both shapes — `answerId` is canonical, `selectedAnswer` is the
      // legacy alias actually shipped by the FE.
      const answerId = req.body.answerId ?? req.body.selectedAnswer ?? null;

      if (!userId || !gameId || !questionId) {
          return res.status(400).json({ success: false, error: 'userId, gameId, and questionId required' });
      }

      try {
          // Record the seen question (for no-repeat)
          await withRetry(
              () => getSupabase()
                  .from('user_seen_questions')
                  .upsert({
                      user_id: userId,
                      game_id: gameId,
                      question_id: questionId,
                      seen_at: new Date().toISOString(),
                  }, { onConflict: 'user_id,game_id,question_id' }),
              { label: 'RecordQuestion:upsert' }
          );

          // Record the answer for stats (enriched with spot metadata)
          await withRetry(
              () => getSupabase()
                  .from('training_answers')
                  .insert({
                      user_id: userId,
                      game_id: gameId,
                      question_id: questionId,
                      answer_id: answerId,
                      is_correct: isCorrect,
                      level: level,
                      answered_at: new Date().toISOString(),
                      // ═══ PHASE 14: Spot metadata columns (gracefully ignored if cols don't exist) ═══
                      hero_position: heroPosition || null,
                      villain_position: villainPosition || null,
                      street: street || null,
                      classification: classification || null,
                      ev_loss: typeof evLoss === 'number' ? evLoss : null,
                      spot_type: spotType || null,
                  }),
              { label: 'RecordQuestion:insert' }
          );

          return res.status(200).json({ success: true });

      } catch (error) {
          console.warn('Record question error:', error);
          return res.status(500).json({ success: false, error: 'Internal server error' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
