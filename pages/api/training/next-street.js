import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { applyDeterministicEnginePatches } from '../../../src/engines/deterministicEnginePatches';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import {
  authoritativeHandState,
  bindExactContinuationQuestion,
  buildExactContinuationLineage,
  firstCardSet,
  orderDeterministicEducationalCards,
  resolveStrictTrainingContinuation,
  validatePersistedContinuationDecision,
  validatePersistedContinuationDecisionForDifficulty,
  validateStrictTrainingContinuationSnapshotPair,
} from '../../../src/lib/training/trainingContinuationEligibility.mjs';
import {
  prepareTrainingQuestionForDelivery,
  TrainingGradingReceiptError,
  verifyTrainingGradingReceipt,
  verifyTrainingGradingReceiptEnvelope,
} from '../../../src/lib/training/gradingReceipt.mjs';
import {
  buildTrainingQuestionSnapshot,
  readTrainingAttemptContinuation,
  recordTrainingQuestionsServedForAttempt,
  registerTrainingAttemptContinuation,
  trainingAttemptDecisionServeKey,
  trainingQuestionSnapshotMatchesIdentity,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';
import {
  buildTrainingCacheRow,
  withPersistedCacheReceipt,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';

applyDeterministicEnginePatches(deterministicEngine);

export {
  authoritativeHandState,
  bindExactContinuationQuestion,
  buildExactContinuationLineage,
  orderDeterministicEducationalCards,
  validatePersistedContinuationDecision,
  validatePersistedContinuationDecisionForDifficulty,
};

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


async function readSnapshot(snapshotKey) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase().from('training_question_snapshots')
      .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
      .eq('snapshot_key', snapshotKey)
      .maybeSingle(),
    { label: 'NextStreet:snapshot-read' },
  );
  return result.data || null;
}

function receiptErrorResponse(res, error) {
  return res.status(error.status || 400).json({
    success: false,
    error: error.message,
    code: error.code,
  });
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.write)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    if (JSON.stringify(req.body || {}).length > 12288) {
      return res.status(413).json({ success: false, error: 'Request body too large' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const gradingReceipt = req.body?.gradingReceipt || req.body?.receipt;
    let receiptPayload;
    try {
      ({ payload: receiptPayload } = verifyTrainingGradingReceiptEnvelope(gradingReceipt, {
        userId: user.id,
      }));
    } catch (error) {
      if (error instanceof TrainingGradingReceiptError) return receiptErrorResponse(res, error);
      throw error;
    }

    const parentSnapshot = await readSnapshot(receiptPayload.snapshotKey);
    if (!trainingQuestionSnapshotMatchesIdentity(parentSnapshot, {
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    })) {
      return res.status(409).json({
        success: false,
        error: 'The signed parent hand is no longer available. Reload the Arena.',
        code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
      });
    }
    try {
      verifyTrainingGradingReceipt(gradingReceipt, {
        userId: user.id,
        gameId: receiptPayload.gameId,
        questionId: receiptPayload.questionId,
        sessionId: receiptPayload.sessionId,
        attemptId: receiptPayload.attemptId,
        snapshotKey: receiptPayload.snapshotKey,
        canonicalQuestion: parentSnapshot.question_data,
      });
    } catch (error) {
      if (error instanceof TrainingGradingReceiptError) return receiptErrorResponse(res, error);
      throw error;
    }

    const precedingResult = await runTrainingPersistenceQuery(
      () => getSupabase().from('training_answers')
        .select('submission_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key, user_id, answer_id')
        .eq('user_id', user.id)
        .eq('submission_id', receiptPayload.jti)
        .eq('attempt_id', receiptPayload.attemptId)
        .eq('hand_ordinal', receiptPayload.handOrdinal)
        .eq('decision_ordinal', receiptPayload.decisionOrdinal)
        .eq('snapshot_key', receiptPayload.snapshotKey)
        .maybeSingle(),
      { label: 'NextStreet:preceding-answer-read' },
    );
    if (!precedingResult.data) {
      return res.status(409).json({
        success: false,
        error: 'Finish and save the current decision before dealing the next street.',
        code: 'TRAINING_CONTINUATION_PRECEDING_ANSWER_REQUIRED',
      });
    }
    if (Number(receiptPayload.decisionOrdinal) >= 8) {
      return res.status(409).json({
        success: false,
        error: 'This hand has reached its maximum decision depth.',
        code: 'TRAINING_CONTINUATION_DEPTH_EXCEEDED',
      });
    }
    const nextDecisionOrdinal = Number(receiptPayload.decisionOrdinal) + 1;
    const existingContinuation = await readTrainingAttemptContinuation({
      supabase: getSupabase(),
      attemptId: receiptPayload.attemptId,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    });
    if (existingContinuation) {
      const { slot, snapshot } = existingContinuation;
      if (String(slot.parent_snapshot_key) !== String(receiptPayload.snapshotKey)
        || String(slot.parent_submission_id) !== String(precedingResult.data.submission_id)) {
        return res.status(409).json({
          success: false,
          error: 'The saved continuation does not match the preceding decision.',
          code: 'TRAINING_CONTINUATION_SLOT_PARENT_MISMATCH',
        });
      }
      const existingAnswerResult = await runTrainingPersistenceQuery(
        () => getSupabase().from('training_answers')
          .select('submission_id')
          .eq('user_id', user.id)
          .eq('attempt_id', receiptPayload.attemptId)
          .eq('hand_ordinal', receiptPayload.handOrdinal)
          .eq('decision_ordinal', nextDecisionOrdinal)
          .maybeSingle(),
        { label: 'NextStreet:existing-continuation-answer-read' },
      );
      if (existingAnswerResult.data) {
        return res.status(409).json({
          success: false,
          error: 'This continuation decision was already answered and cannot receive a new receipt.',
          code: 'TRAINING_CONTINUATION_ALREADY_ANSWERED',
        });
      }
      const existingGameConfig = pioQueryService.getGameConfig(receiptPayload.gameId);
      if (!existingGameConfig) {
        return res.status(404).json({ success: false, error: 'Game config not found' });
      }
      const existingLineage = validateStrictTrainingContinuationSnapshotPair({
        parentQuestion: parentSnapshot.question_data,
        childQuestion: snapshot.question_data,
        persistedAnswerId: precedingResult.data.answer_id,
        difficultyMode: receiptPayload.difficultyMode,
        gameConfig: existingGameConfig,
      });
      if (!existingLineage.ok) {
        return res.status(existingLineage.status).json({
          success: false,
          error: existingLineage.error,
          code: existingLineage.code,
        });
      }
      const servedQuestion = prepareTrainingQuestionForDelivery({
        canonicalQuestion: snapshot.question_data,
        userId: user.id,
        gameId: receiptPayload.gameId,
        level: receiptPayload.level,
        sessionId: receiptPayload.sessionId,
        attemptId: receiptPayload.attemptId,
        snapshotKey: snapshot.snapshot_key,
        sessionKind: receiptPayload.sessionKind,
        sessionTargetHands: receiptPayload.sessionTargetHands,
        handOrdinal: receiptPayload.handOrdinal,
        decisionOrdinal: nextDecisionOrdinal,
        countsTowardCompletion: false,
        practiceOnly: receiptPayload.practiceOnly,
        difficultyMode: receiptPayload.difficultyMode,
        receiptId: trainingAttemptDecisionServeKey(
          receiptPayload.attemptId,
          receiptPayload.handOrdinal,
          nextDecisionOrdinal,
        ),
      });
      await recordTrainingQuestionsServedForAttempt(getSupabase(), {
        userId: user.id,
        delivery: { attemptId: receiptPayload.attemptId, questions: [servedQuestion] },
      });
      const boardCards = firstCardSet(
        snapshot.question_data?.scenario?.boardCards,
        snapshot.question_data?.boardCards,
      );
      return res.status(200).json({
        success: true,
        recoveredExistingContinuation: true,
        question: servedQuestion,
        newCard: boardCards.at(-1),
        boardCards,
        street: String(snapshot.question_data?.scenario?.street || snapshot.question_data?.street || ''),
        sessionId: receiptPayload.sessionId,
        attemptId: receiptPayload.attemptId,
        handOrdinal: receiptPayload.handOrdinal,
        decisionOrdinal: nextDecisionOrdinal,
      });
    }

    const gameConfig = pioQueryService.getGameConfig(receiptPayload.gameId);
    if (!gameConfig) {
      return res.status(404).json({ success: false, error: 'Game config not found' });
    }
    deterministicEngine.setSupabaseClient(getSupabase());
    const continuationResolution = await resolveStrictTrainingContinuation({
      parentQuestion: parentSnapshot.question_data,
      persistedAnswerId: precedingResult.data.answer_id,
      gameConfig,
      difficultyMode: receiptPayload.difficultyMode,
      queryNextStreet: (request) => deterministicEngine.queryNextStreet(request),
    });
    if (!continuationResolution.ok) {
      return res.status(continuationResolution.status).json({
        success: false,
        error: continuationResolution.error,
        code: continuationResolution.code,
      });
    }
    const {
      canonicalQuestion,
      lineage: continuationLineage,
      nextBoard,
      state,
    } = continuationResolution;

    let persistedCanonicalQuestion;
    try {
      const cacheRow = buildTrainingCacheRow({
        question: canonicalQuestion,
        questionId: canonicalQuestion.id,
        gameId: receiptPayload.gameId,
        questionKind: 'PIO',
        gameType: String(receiptPayload.gameId).startsWith('mtt-') ? 'tournament'
          : String(receiptPayload.gameId).startsWith('spins-') ? 'sng' : 'cash',
        level: receiptPayload.level,
      });
      const persisted = await runTrainingPersistenceQuery(
        () => getSupabase().from('training_question_cache')
          .upsert(cacheRow, { onConflict: 'question_id', defaultToNull: false })
          .select('question_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
          .maybeSingle(),
        { label: 'NextStreet:canonicalize' },
      );
      if (!persisted?.data) {
        throw new Error('Canonical continuation persistence returned no accepted cache row');
      }
      persistedCanonicalQuestion = withPersistedCacheReceipt(cacheRow.question_data, persisted.data);
    } catch (canonicalizeError) {
      console.warn('[NextStreet] Refusing to serve an uncanonicalized continuation:', canonicalizeError?.message || canonicalizeError);
      return res.status(503).json(trainingPersistenceUnavailableBody());
    }

    const candidateSnapshot = buildTrainingQuestionSnapshot({
      canonicalQuestion: persistedCanonicalQuestion,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    });
    await runTrainingPersistenceQuery(
      () => getSupabase().from('training_question_snapshots').upsert(candidateSnapshot, {
        onConflict: 'snapshot_key',
        ignoreDuplicates: true,
        defaultToNull: false,
      }),
      { label: 'NextStreet:snapshot-write' },
    );
    const candidateStoredSnapshot = await readSnapshot(candidateSnapshot.snapshot_key);
    if (!trainingQuestionSnapshotMatchesIdentity(candidateStoredSnapshot, {
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    })) {
      return res.status(503).json(trainingPersistenceUnavailableBody());
    }

    const registeredContinuation = await registerTrainingAttemptContinuation({
      supabase: getSupabase(),
      userId: user.id,
      attemptId: receiptPayload.attemptId,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
      snapshotKey: candidateStoredSnapshot.snapshot_key,
      parentSnapshotKey: receiptPayload.snapshotKey,
      parentSubmissionId: precedingResult.data.submission_id,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
    });
    const storedSnapshot = registeredContinuation.snapshot;
    const servedQuestion = prepareTrainingQuestionForDelivery({
      canonicalQuestion: storedSnapshot.question_data,
      userId: user.id,
      gameId: receiptPayload.gameId,
      level: receiptPayload.level,
      sessionId: receiptPayload.sessionId,
      attemptId: receiptPayload.attemptId,
      snapshotKey: storedSnapshot.snapshot_key,
      sessionKind: receiptPayload.sessionKind,
      sessionTargetHands: receiptPayload.sessionTargetHands,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
      countsTowardCompletion: false,
      practiceOnly: receiptPayload.practiceOnly,
      difficultyMode: receiptPayload.difficultyMode,
      receiptId: trainingAttemptDecisionServeKey(
        receiptPayload.attemptId,
        receiptPayload.handOrdinal,
        nextDecisionOrdinal,
      ),
    });
    await recordTrainingQuestionsServedForAttempt(getSupabase(), {
      userId: user.id,
      delivery: { attemptId: receiptPayload.attemptId, questions: [servedQuestion] },
    });

    const winningBoard = firstCardSet(
      storedSnapshot.question_data?.scenario?.boardCards,
      storedSnapshot.question_data?.boardCards,
    );

    return res.status(200).json({
      success: true,
      question: servedQuestion,
      newCard: winningBoard.at(-1),
      boardCards: winningBoard,
      street: String(storedSnapshot.question_data?.scenario?.street || storedSnapshot.question_data?.street || ''),
      sessionId: receiptPayload.sessionId,
      attemptId: receiptPayload.attemptId,
      handOrdinal: receiptPayload.handOrdinal,
      decisionOrdinal: nextDecisionOrdinal,
    });
  } catch (error) {
    try { reportApiError(error, req); } catch (_) { /* reporting must not mask the response */ }
    console.warn('[NextStreet] Error:', error?.message || error);
    if (isTrainingPersistenceUnavailable(error)) {
      return res.status(503).json(trainingPersistenceUnavailableBody());
    }
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    return undefined;
  }
}
