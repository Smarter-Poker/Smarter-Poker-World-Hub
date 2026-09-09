import { getServerUserWithFallback } from '../../../src/lib/serverAuth';

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  prepareTrainingQuestionForDelivery,
} from '../../../src/lib/training/gradingReceipt.mjs';
import { isTrainingQuestionValid } from '../../../src/lib/training/questionContract.mjs';
import {
  isTrainingAttemptContractError,
  prepareTrainingAttemptDelivery,
  recordTrainingQuestionsServedForAttempt,
  trainingAttemptDecisionServeKey,
  trainingQuestionCampaignEligibility,
  trainingQuestionSnapshotMatchesIdentity,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import { normalizeTrainingSessionKind } from '../../../src/lib/training/sessionAttemptContract.mjs';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import { sanitizeParam, withTiming } from '../../../src/utils/trainingApiUtils';

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

/**
 * Re-seal immutable questions for one of two narrow recovery cases:
 *
 * 1. An untouched, same-user attempt can refresh the receipts for its exact
 *    full manifest. The attempt id and client nonce do not change, so recovery
 *    cannot manufacture another reward-eligible campaign.
 * 2. A completed attempt can start a deliberate mistake replay. Replays are
 *    practice-only by contract and only incorrectly answered parent hands are
 *    eligible.
 *
 * Browser-supplied question ids are selectors, never authority. Every question
 * is reconstructed from the attempt's immutable server-side snapshots.
 */
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.write)) return;

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (JSON.stringify(req.body || {}).length > 24_576) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const gameId = sanitizeParam(req.body?.gameId, 100);
    const requestedIds = Array.from(new Set(
      (Array.isArray(req.body?.questionIds) ? req.body.questionIds : [])
        .map((value) => sanitizeParam(String(value || ''), 180))
        .filter(Boolean),
    ));
    const level = Math.min(12, Math.max(1, Number.parseInt(req.body?.level, 10) || 1));
    const sessionId = sanitizeParam(req.body?.sessionId, 180);
    const attemptId = sanitizeParam(req.body?.attemptId, 64) || null;
    const rawSessionKind = String(req.body?.sessionKind || '').trim().toLowerCase();
    if (!['campaign', 'custom', 'replay'].includes(rawSessionKind)) {
      return res.status(400).json({
        success: false,
        error: 'A valid Training session kind is required.',
        code: 'TRAINING_REISSUE_SESSION_KIND_INVALID',
      });
    }
    const sessionKind = normalizeTrainingSessionKind(rawSessionKind);
    const parentAttemptId = sanitizeParam(req.body?.parentAttemptId, 64) || null;

    if (!gameId || !sessionId || requestedIds.length === 0 || requestedIds.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'gameId, sessionId, and 1 to 100 unique canonical questionIds are required',
      });
    }

    try {
      if (sessionKind === 'replay') {
        if (!parentAttemptId) {
          return res.status(400).json({
            success: false,
            error: 'Mistake replay requires its completed source attempt.',
            code: 'TRAINING_ATTEMPT_REPLAY_PARENT_REQUIRED',
          });
        }
        const parentResult = await runTrainingPersistenceQuery(
          () => getSupabase().from('training_attempts')
            .select('id, user_id, game_id, level, status, difficulty')
            .eq('id', parentAttemptId)
            .eq('user_id', user.id)
            .maybeSingle(),
          { label: 'ReissueQuestions:parent-read' },
        );
        const parent = parentResult.data;
        if (!parent
          || String(parent.game_id) !== String(gameId)
          || Number(parent.level) !== level
          || parent.status !== 'completed') {
          return res.status(409).json({
            success: false,
            error: 'The mistake replay source attempt is not eligible.',
            code: 'TRAINING_ATTEMPT_PARENT_INVALID',
          });
        }
        const handResult = await runTrainingPersistenceQuery(
          () => getSupabase().from('training_attempt_hands')
            .select('hand_ordinal, snapshot_key')
            .eq('attempt_id', parentAttemptId)
            .limit(100),
          { label: 'ReissueQuestions:parent-hands-read' },
        );
        const mistakeResult = await runTrainingPersistenceQuery(
          () => getSupabase().from('training_answers')
            .select('hand_ordinal')
            .eq('attempt_id', parentAttemptId)
            .eq('decision_ordinal', 1)
            .eq('is_correct', false)
            .limit(100),
          { label: 'ReissueQuestions:parent-mistakes-read' },
        );
        const mistakeOrdinals = new Set(
          (mistakeResult.data || []).map((row) => Number(row.hand_ordinal)),
        );
        const snapshotKeys = Array.from(new Set(
          (handResult.data || [])
            .filter((row) => mistakeOrdinals.has(Number(row.hand_ordinal)))
            .map((row) => String(row.snapshot_key || ''))
            .filter(Boolean),
        ));
        const snapshotResult = snapshotKeys.length > 0
          ? await runTrainingPersistenceQuery(
              () => getSupabase().from('training_question_snapshots')
                .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
                .in('snapshot_key', snapshotKeys),
              { label: 'ReissueQuestions:parent-snapshots-read' },
            )
          : { data: [] };
        const eligibleSnapshots = (snapshotResult.data || []).filter((row) => (
          trainingQuestionSnapshotMatchesIdentity(row, { gameId, level })
          && isTrainingQuestionValid(row.question_data)
        ));
        const byId = new Map(eligibleSnapshots.map((row) => [
          String(row.source_question_id || row.question_data?.id || ''),
          row.question_data,
        ]));
        const missingQuestionIds = requestedIds.filter((id) => !byId.has(id));
        if (missingQuestionIds.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'Mistake replay can only include incorrectly answered hands from its completed source attempt.',
            code: 'TRAINING_REPLAY_HAND_NOT_ELIGIBLE',
            missingQuestionIds,
          });
        }

        const delivery = await prepareTrainingAttemptDelivery({
          supabase: getSupabase(),
          userId: user.id,
          clientSessionId: sessionId,
          gameId,
          level,
          sessionKind: 'replay',
          difficultyMode: parent.difficulty,
          requestedHands: requestedIds.length,
          questions: requestedIds.map((questionId) => byId.get(questionId)),
          handOrdinalStart: 1,
          parentAttemptId,
          requireFullAttempt: true,
          config: { replayParentAttemptId: parentAttemptId },
        });
        await recordTrainingQuestionsServedForAttempt(getSupabase(), {
          userId: user.id,
          delivery,
        });

        return res.status(200).json({
          success: true,
          gameId,
          level,
          sessionId,
          attemptId: delivery.attemptId,
          sessionKind: delivery.sessionKind,
          targetHands: delivery.targetHands,
          count: delivery.questions.length,
          questions: delivery.questions,
        });
      }

      if (!attemptId) {
        return res.status(400).json({
          success: false,
          error: 'Campaign recovery requires its existing attempt identity.',
          code: 'TRAINING_REISSUE_ATTEMPT_REQUIRED',
        });
      }
      const attemptResult = await runTrainingPersistenceQuery(
        () => getSupabase().from('training_attempts')
          .select('id, user_id, client_nonce, game_id, level, session_kind, difficulty, expected_hands, practice_only, status, expires_at')
          .eq('id', attemptId)
          .eq('user_id', user.id)
          .maybeSingle(),
        { label: 'ReissueQuestions:attempt-read' },
      );
      const attempt = attemptResult.data;
      const reissueNowMs = Date.now();
      const expiryMs = Date.parse(attempt?.expires_at || '');
      if (!attempt
        || String(attempt.game_id) !== String(gameId)
        || Number(attempt.level) !== level
        || String(attempt.client_nonce) !== String(sessionId)
        || String(attempt.session_kind) !== String(sessionKind)
        || attempt.practice_only === true
        || attempt.status !== 'open') {
        return res.status(409).json({
          success: false,
          error: 'This Training attempt cannot be recovered.',
          code: 'TRAINING_REISSUE_ATTEMPT_INVALID',
        });
      }
      if (!Number.isFinite(expiryMs) || expiryMs - reissueNowMs < 60_000) {
        return res.status(409).json({
          success: false,
          error: 'This Training attempt has expired. Start a fresh session.',
          code: 'TRAINING_ATTEMPT_EXPIRED',
        });
      }

      const handResult = await runTrainingPersistenceQuery(
        () => getSupabase().from('training_attempt_hands')
          .select('hand_ordinal, snapshot_key, status')
          .eq('attempt_id', attemptId)
          .order('hand_ordinal', { ascending: true })
          .limit(100),
        { label: 'ReissueQuestions:attempt-hands-read' },
      );
      const hands = handResult.data || [];
      if (hands.length !== Number(attempt.expected_hands)
        || hands.some((hand, index) => (
          Number(hand.hand_ordinal) !== index + 1
          || hand.status !== 'allocated'
          || !hand.snapshot_key
        ))) {
        return res.status(409).json({
          success: false,
          error: 'Only a complete, untouched Training attempt can refresh its receipts.',
          code: 'TRAINING_REISSUE_ATTEMPT_STARTED',
        });
      }

      const snapshotResult = await runTrainingPersistenceQuery(
        () => getSupabase().from('training_question_snapshots')
          .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
          .in('snapshot_key', hands.map((hand) => hand.snapshot_key)),
        { label: 'ReissueQuestions:attempt-snapshots-read' },
      );
      const snapshotByKey = new Map(
        (snapshotResult.data || []).map((row) => [String(row.snapshot_key), row]),
      );
      const snapshots = hands.map((hand) => snapshotByKey.get(String(hand.snapshot_key)));
      if (snapshots.some((snapshot) => (
        !trainingQuestionSnapshotMatchesIdentity(snapshot, { gameId, level })
        || !isTrainingQuestionValid(snapshot.question_data)
      ))) {
        return res.status(409).json({
          success: false,
          error: 'The Training attempt manifest failed its integrity check.',
          code: 'TRAINING_REISSUE_MANIFEST_INVALID',
        });
      }
      const authorityFailure = snapshots
        .map((snapshot) => trainingQuestionCampaignEligibility(snapshot.question_data))
        .find((result) => !result.eligible);
      if (authorityFailure) {
        return res.status(422).json({
          success: false,
          error: 'This historical Training manifest is not eligible for progress-bearing receipt recovery.',
          code: 'TRAINING_REISSUE_QUESTION_AUTHORITY_INELIGIBLE',
          reason: authorityFailure.reason,
        });
      }
      const canonicalIds = snapshots.map((snapshot) => (
        String(snapshot.source_question_id || snapshot.question_data?.id || '')
      ));
      const canonicalIdSet = new Set(canonicalIds);
      const exactManifest = canonicalIds.length === requestedIds.length
        && canonicalIdSet.size === canonicalIds.length
        && requestedIds.every((questionId) => canonicalIdSet.has(questionId));
      if (!exactManifest) {
        return res.status(409).json({
          success: false,
          error: 'Recovery must refresh the exact full server-owned attempt manifest.',
          code: 'TRAINING_REISSUE_MANIFEST_MISMATCH',
        });
      }

      const ttlSeconds = Math.min(12 * 60 * 60, Math.floor((expiryMs - reissueNowMs) / 1000));
      const questions = snapshots.map((snapshot, index) => prepareTrainingQuestionForDelivery({
        canonicalQuestion: snapshot.question_data,
        userId: user.id,
        gameId,
        level,
        sessionId,
        attemptId,
        snapshotKey: snapshot.snapshot_key,
        sessionKind: attempt.session_kind,
        sessionTargetHands: Number(attempt.expected_hands),
        handOrdinal: index + 1,
        decisionOrdinal: 1,
        countsTowardCompletion: true,
        practiceOnly: false,
        difficultyMode: attempt.difficulty,
        nowMs: reissueNowMs,
        ttlSeconds,
        receiptId: trainingAttemptDecisionServeKey(attemptId, index + 1, 1),
      }));
      await recordTrainingQuestionsServedForAttempt(getSupabase(), {
        userId: user.id,
        delivery: { attemptId, questions },
      });
      return res.status(200).json({
        success: true,
        gameId,
        level,
        sessionId,
        attemptId,
        sessionKind: attempt.session_kind,
        targetHands: Number(attempt.expected_hands),
        recoveredExistingAttempt: true,
        count: questions.length,
        questions,
      });
    } catch (error) {
      console.warn('[ReissueQuestions] Failed:', error?.message || error);
      if (isTrainingAttemptContractError(error)) {
        return res.status(error.status || 409).json({
          success: false,
          error: error.message,
          code: error.code,
        });
      }
      if (isTrainingPersistenceUnavailable(error)) {
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  } catch (error) {
    try { reportApiError(error, req); } catch (_sentryError) { /* reporting must not mask response */ }
    console.warn('[ReissueQuestions] Unhandled error:', error?.message || error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
