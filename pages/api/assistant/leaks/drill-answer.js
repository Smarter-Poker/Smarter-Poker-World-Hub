/**
 * POST /api/assistant/leaks/drill-answer
 * Irrevocably records one answer before returning its solver result. The
 * private database ledger makes retries idempotent and prevents answer-key
 * peeking followed by a changed selection.
 */
import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';
import { openDrillBatch, gradeDrillAnswer } from '../../../../src/lib/personal-assistant/drillTelemetry';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

const LEAK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, LIMITS.write || { max: 30, windowMs: 60_000 })) return;
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (Number(req.headers['content-length'] || 0) > 12_000) {
    return res.status(413).json({ success: false, error: 'Request too large' });
  }

  try {
    const supabase = getSupabase();
    const { user, error: authError } = await getServerUserWithFallback(req, supabase);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Authentication required' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const leakId = typeof body.leakId === 'string' ? body.leakId.trim() : '';
    const questionId = typeof body.questionId === 'string' || typeof body.questionId === 'number'
      ? String(body.questionId).trim().slice(0, 180) : '';
    const selectedAnswer = typeof body.selectedAnswer === 'string' ? body.selectedAnswer.trim().slice(0, 100) : null;
    const timedOut = body.timedOut === true;
    if (!LEAK_ID_RE.test(leakId) || !questionId || (!timedOut && !selectedAnswer)) {
      return res.status(400).json({ success: false, error: 'Invalid answer payload' });
    }

    let batch;
    try { batch = openDrillBatch(body.drillToken, user.id, leakId); }
    catch (_) { return res.status(400).json({ success: false, error: 'Invalid or expired drill session' }); }
    if (!batch.questionIds.includes(questionId)) {
      return res.status(400).json({ success: false, error: 'Question is not part of this drill session' });
    }

    const { data: question, error: questionError } = await supabase
      .from('training_question_cache')
      .select('id, question_data')
      .eq('id', questionId)
      .maybeSingle();
    if (questionError || !question?.question_data) {
      return res.status(503).json({ success: false, error: 'Solver question is temporarily unavailable' });
    }
    const graded = gradeDrillAnswer(question.question_data, selectedAnswer, timedOut);
    if (!graded.ok) return res.status(422).json({ success: false, error: 'Question is not solver verified' });

    // Session creation is deliberately deferred until the first locked answer.
    // Loading, retrying, or abandoning a GET cannot consume quota or an attempt.
    const { data: startData, error: startError } = await supabase.rpc('start_verified_leak_drill', {
      p_user_id: user.id,
      p_leak_id: leakId,
      p_batch_id: batch.batchId,
      p_question_ids: batch.questionIds,
    });
    if (startError || startData?.success !== true) {
      console.warn('[leaks/drill-answer] session start failed:', startError?.message || startData?.error);
      return res.status(503).json({ success: false, error: 'Could not start this verified attempt. Please retry.' });
    }

    const { data, error } = await supabase.rpc('record_verified_leak_drill_answer', {
      p_user_id: user.id,
      p_leak_id: leakId,
      p_batch_id: batch.batchId,
      p_question_id: questionId,
      p_selected_answer: graded.selectedAnswer,
      p_correct_answer: graded.correctAnswer,
      p_correct: graded.correct,
      p_timed_out: graded.timedOut,
      p_explanation: graded.explanation,
      p_solver_source: graded.solverSource,
      p_classification: graded.classification,
    });
    if (error || data?.success !== true) {
      console.warn('[leaks/drill-answer] ledger write failed:', error?.message || data?.error);
      return res.status(503).json({ success: false, error: 'Could not lock this answer. Please retry.' });
    }

    const answer = data.answer || {};
    return res.status(200).json({
      success: true,
      idempotent: data.idempotent === true,
      result: {
        correct: answer.correct === true,
        selectedAnswer: answer.selected_answer || null,
        correctAnswer: answer.correct_answer || graded.correctAnswer,
        explanation: answer.explanation || null,
        classification: answer.classification || null,
        timedOut: answer.timed_out === true,
      },
    });
  } catch (error) {
    console.warn('[leaks/drill-answer] failed:', error?.message || error);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
