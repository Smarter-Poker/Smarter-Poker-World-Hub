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
      if (!_token)
        return res.status(401).json({ success: false, error: 'Authentication required' });
      const { data: authData, error: _authErr } = await getSupabase().auth.getUser(_token);
      const _authUser = authData?.user;
      if (_authErr || !_authUser)
        return res.status(401).json({ success: false, error: 'Invalid token' });
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

    const { userId, gameId, questionId, isCorrect, level } = req.body;

    // BUG FIX #3 (2026-05-08, MAX-RIGOR audit): FE callers
    // (`src/hooks/useGTOTrainer.js:386`, `questionGenerator.js:212`) POST
    // `selectedAnswer`, never `answerId`. Accept both so
    // `training_answers.answer_id` (NOT NULL) populates.
    const answerId = req.body.answerId ?? req.body.selectedAnswer ?? null;

    if (!userId || !gameId || !questionId) {
      return res
        .status(400)
        .json({ success: false, error: 'userId, gameId, and questionId required' });
    }

    try {
      // Record the seen question (for no-repeat)
      const seenResult = await withRetry(
        () =>
          getSupabase().from('user_seen_questions').upsert(
            {
              user_id: userId,
              game_id: gameId,
              question_id: questionId,
              seen_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,game_id,question_id' }
          ),
        { label: 'RecordQuestion:upsert' }
      );
      if (seenResult?.error) {
        // BUG FIX #4 (2026-05-08, MAX-RIGOR audit): withRetry returns
        // `{ data, error }` instead of throwing on Postgres errors.
        // The handler previously ignored that and returned 200 success
        // even when the row never landed. Surface the failure now.
        console.warn('[RecordQuestion] user_seen_questions upsert failed:', seenResult.error);
        return res.status(500).json({ success: false, error: 'Failed to record seen question' });
      }

      // Record the answer for stats. NOTE: training_answers schema is
      // currently {id, user_id, game_id, question_id, answer_id NOT NULL,
      // is_correct, level, answered_at}. Phase 14 spot-metadata columns
      // (hero_position, villain_position, street, classification, ev_loss,
      // spot_type) were never actually added by migration, so prior
      // inserts hit Postgres 42703 ("column ... does not exist") which the
      // earlier missing-error-check pattern silently swallowed — that is
      // why this table had 0 rows. Strip those columns from the insert.
      // Re-add them under a column-existence check once the schema is
      // extended.
      const insertResult = await withRetry(
        () =>
          getSupabase().from('training_answers').insert({
            user_id: userId,
            game_id: gameId,
            question_id: questionId,
            answer_id: answerId,
            is_correct: isCorrect,
            level: level,
            answered_at: new Date().toISOString(),
          }),
        { label: 'RecordQuestion:insert' }
      );
      if (insertResult?.error) {
        console.warn('[RecordQuestion] training_answers insert failed:', insertResult.error);
        return res.status(500).json({ success: false, error: 'Failed to record answer' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.warn('Record question error:', error);
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr);
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
