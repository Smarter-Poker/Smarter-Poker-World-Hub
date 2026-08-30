import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';

const VALID_REASONS = new Set([
  'inaccurate_answer',
  'unclear_wording',
  'illegal_action',
  'visual_mismatch',
]);

let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

async function canonicalQuestionExists(gameId, questionId) {
  const byQuestionId = await getSupabase()
    .from('training_question_cache')
    .select('id')
    .eq('game_id', gameId)
    .eq('question_id', questionId)
    .limit(1)
    .maybeSingle();
  if (!byQuestionId.error && byQuestionId.data) return true;

  const byPayloadId = await getSupabase()
    .from('training_question_cache')
    .select('id')
    .eq('game_id', gameId)
    .contains('question_data', { id: questionId })
    .limit(1)
    .maybeSingle();
  return !byPayloadId.error && Boolean(byPayloadId.data);
}

export default async function handler(req, res) {
  try {
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const gameId = sanitizeParam(req.body?.gameId, 100);
    const questionId = sanitizeParam(req.body?.questionId, 180);
    const reason = sanitizeParam(req.body?.reason, 40);
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 1000) : null;
    if (!gameId || !questionId || !VALID_REASONS.has(reason)) {
      return res.status(400).json({ success: false, error: 'Invalid question report' });
    }
    if (!(await canonicalQuestionExists(gameId, questionId))) {
      return res.status(404).json({ success: false, error: 'Canonical question not found' });
    }

    const { error } = await getSupabase()
      .from('training_question_reports')
      .upsert({
        user_id: user.id,
        game_id: gameId,
        question_id: questionId,
        reason,
        note,
        created_at: new Date().toISOString(),
        resolved_at: null,
        resolution: null,
      }, { onConflict: 'user_id,game_id,question_id,reason' });
    if (error) {
      console.warn('[TrainingQuestionReport] insert failed:', error.message);
      return res.status(500).json({ success: false, error: 'Could not submit report' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    try { reportApiError(error, req); } catch (_sentryError) {
      console.warn('[App] Handled exception:', _sentryError?.message || _sentryError);
    }
    console.warn('[TrainingQuestionReport] unexpected error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
