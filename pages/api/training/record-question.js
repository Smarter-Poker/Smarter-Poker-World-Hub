import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/training/record-question
 * Records that a user has seen/answered a question (for no-repeat tracking)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import {
  TrainingAnswerContractError,
  gradeTrainingAnswer,
} from '../../../src/lib/training/answerGradingContract.mjs';
import {
  deriveReceiptRng,
  TrainingGradingReceiptError,
  verifyTrainingGradingReceipt,
  verifyTrainingGradingReceiptEnvelope,
} from '../../../src/lib/training/gradingReceipt.mjs';
import { normalizeTrainingDifficultyMode } from '../../../src/lib/training/difficultyQuestionContract.mjs';
import {
  isTrainingPersistenceUnavailable,
  runTrainingPersistenceQuery,
  trainingPersistenceUnavailableBody,
} from '../../../src/lib/training/trainingPersistence.mjs';

// ●● Lazy Supabase getter (SSG-safe) ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
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

async function getImmutableQuestionSnapshot(snapshotKey) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_snapshots')
      .select('snapshot_key, source_question_id, game_id, level, content_digest, question_data')
      .eq('snapshot_key', snapshotKey)
      .maybeSingle(),
    { label: 'RecordQuestion:snapshot-read' },
  );
  return result.data || null;
}
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    withTiming(res);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!applyRateLimit(req, res, LIMITS.write)) return;
    }

    // Require JWT auth for write operations
    if (req.method !== 'GET') {
      const _token = req.headers.authorization?.replace('Bearer ', '');
      if (!_token)
        return res.status(401).json({ success: false, error: 'Authentication required' });
      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const _authUser = authData?.user;
      if (authErr || !_authUser)
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

    const { userId, gameId, questionId } = req.body;

    // BUG FIX #3 (2026-05-08, MAX-RIGOR audit): FE callers
    // (`src/hooks/useGTOTrainer.js:386`, `questionGenerator.js:212`) POST
    // `selectedAnswer`, never `answerId`. Accept both so
    // `training_answers.answer_id` (NOT NULL) populates.
    const answerId = req.body.answerId ?? req.body.selectedAnswer ?? null;

    if (!userId || !gameId || !questionId || answerId === null || answerId === undefined || answerId === '') {
      return res
        .status(400)
        .json({ success: false, error: 'userId, gameId, questionId, and answerId required' });
    }

    try {
      let receiptPayload;
      try {
        ({ payload: receiptPayload } = verifyTrainingGradingReceiptEnvelope(
          req.body.gradingReceipt ?? req.body.receipt,
          {
            userId,
            gameId,
            questionId,
            sessionId: req.body.sessionId || undefined,
            attemptId: req.body.attemptId || undefined,
            snapshotKey: req.body.snapshotKey || undefined,
          },
        ));
      } catch (contractError) {
        if (contractError instanceof TrainingGradingReceiptError) {
          return res.status(contractError.status || 400).json({
            success: false,
            error: contractError.message,
            code: contractError.code,
          });
        }
        throw contractError;
      }

      const snapshot = await getImmutableQuestionSnapshot(receiptPayload.snapshotKey);
      if (
        !snapshot?.question_data
        || String(snapshot.snapshot_key) !== String(receiptPayload.snapshotKey)
        || String(snapshot.game_id) !== String(receiptPayload.gameId)
        || Number(snapshot.level) !== Number(receiptPayload.level)
        || !(
          String(snapshot.source_question_id) === String(receiptPayload.questionId)
          || String(snapshot.question_data?.id) === String(receiptPayload.questionId)
        )
      ) {
        return res.status(409).json({
          success: false,
          error: 'This signed question snapshot is unavailable. Refresh the training hand and try again.',
          code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
        });
      }
      const canonicalQuestion = snapshot.question_data;
      let answerContract;
      let servedQuestion;
      try {
        const verifiedReceipt = verifyTrainingGradingReceipt(
          req.body.gradingReceipt ?? req.body.receipt,
          {
            userId,
            gameId,
            questionId,
            sessionId: req.body.sessionId || undefined,
            attemptId: receiptPayload.attemptId,
            snapshotKey: receiptPayload.snapshotKey,
            canonicalQuestion,
          },
        );
        receiptPayload = verifiedReceipt.payload;
        servedQuestion = verifiedReceipt.servedQuestion;
        if (
          req.body.gradingMode
          && normalizeTrainingDifficultyMode(req.body.gradingMode) !== receiptPayload.difficultyMode
        ) {
          throw new TrainingGradingReceiptError(
            'Difficulty does not match the served hand.',
            'TRAINING_GRADING_RECEIPT_DIFFICULTY_MISMATCH',
          );
        }
        if (req.body.submissionId && String(req.body.submissionId) !== String(receiptPayload.jti)) {
          throw new TrainingGradingReceiptError(
            'Submission identity does not match the served hand.',
            'TRAINING_GRADING_RECEIPT_SUBMISSION_MISMATCH',
          );
        }
        const receiptRng = deriveReceiptRng(receiptPayload, req.body.rng ?? null);
        answerContract = gradeTrainingAnswer({
          canonicalQuestion,
          selectedAnswer: String(answerId),
          difficultyMode: receiptPayload.difficultyMode,
          rng: receiptRng,
        });
      } catch (contractError) {
        if (
          contractError instanceof TrainingAnswerContractError
          || contractError instanceof TrainingGradingReceiptError
        ) {
          return res.status(contractError.status || 400).json({
            success: false,
            error: contractError.message,
            code: contractError.code,
          });
        }
        throw contractError;
      }
      // Record the seen question (for no-repeat)
      await runTrainingPersistenceQuery(
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

      // Record the answer for stats. Every graded and analytical field below
      // comes from the immutable server snapshot; browser-supplied position,
      // street, classification, spot type, correctness, and EV are ignored.
      const canonicalGrade = answerContract.grade;
      const canonicalSolverGrade = answerContract.canonicalSolverGrade;
      const verified = canonicalGrade?.solverVerified === true;
      const canonicalScenario = canonicalQuestion?.scenario || {};
      const canonicalSpotType = canonicalScenario.spotType
        || canonicalScenario.nodeType
        || canonicalScenario.potType
        || canonicalQuestion?.spotType
        || 'general';

      const persistedClassification = canonicalGrade.classification;
      // The answer endpoint now requires a server-canonical question, so a
      // client-supplied EV number is never authoritative. Preserve exact EV
      // only when the canonical provenance seal and per-action EV contract
      // both verify; otherwise store the schema's neutral zero while marking
      // ev_loss_measured=false below.
      const persistedEVLoss = verified && canonicalGrade.evLossMeasured
        ? canonicalGrade.evLoss
        : 0;

      const baseRow = {
        user_id: userId,
        game_id: String(gameId).slice(0, 100),
        question_id: String(questionId).slice(0, 180),
        answer_id: String(answerId).slice(0, 100),
        // A live legacy row is sanitized before it is canonicalized. It is not
        // solver evidence, but its server-side answer key still outranks a
        // browser assertion. Only the evidence fields below remain gated on
        // the complete provenance seal.
        is_correct: Boolean(canonicalGrade.isCorrect),
        level: receiptPayload.level,
        session_id: String(receiptPayload.sessionId).slice(0, 180),
        attempt_id: receiptPayload.attemptId,
        hand_ordinal: receiptPayload.handOrdinal,
        decision_ordinal: receiptPayload.decisionOrdinal,
        snapshot_key: receiptPayload.snapshotKey,
        answered_at: new Date().toISOString(),
        hero_position: String(canonicalScenario.heroPosition || canonicalScenario.position || '').slice(0, 10) || null,
        villain_position: String(canonicalScenario.villainPosition || '').slice(0, 10) || null,
        street: String(canonicalScenario.street || '').slice(0, 12) || null,
        classification: persistedClassification,
        ev_loss: persistedEVLoss,
        spot_type: String(canonicalSpotType).slice(0, 40),
      };
      const evidenceRow = {
        ...baseRow,
        submission_id: String(receiptPayload.jti).slice(0, 180),
        solver_verified: verified,
        solver_source: verified ? String(canonicalGrade.solverSource || 'solver').slice(0, 60) : null,
        selected_frequency: verified ? canonicalGrade.selectedFrequency : null,
        optimal_frequency: verified ? canonicalGrade.optimalFrequency : null,
        ev_loss_measured: verified ? canonicalGrade.evLossMeasured : false,
        evidence_metadata: {
          gradeMode: answerContract.gradeMode,
          difficultyMode: answerContract.difficultyMode,
          difficultyMembers: answerContract.difficultyMembers,
          rng: answerContract.rng,
          canonicalSolverClassification: canonicalSolverGrade.classification,
          canonicalSolverIsCorrect: canonicalSolverGrade.isCorrect,
          optimalAction: canonicalSolverGrade.optimalAction,
          dataQuality: canonicalQuestion.dataQuality || null,
          ...(verified ? {} : { reason: 'question_not_solver_verified' }),
        },
      };

      let idempotentReplay = false;
      try {
        await runTrainingPersistenceQuery(
          () => getSupabase().from('training_answers').insert(evidenceRow),
          { label: 'RecordQuestion:insert' }
        );
      } catch (insertError) {
        if (insertError?.cause?.code !== '23505') throw insertError;
        const existingResult = await runTrainingPersistenceQuery(
          () => getSupabase()
            .from('training_answers')
            .select('game_id, question_id, answer_id, attempt_id, hand_ordinal, decision_ordinal, snapshot_key')
            .eq('user_id', userId)
            .eq('submission_id', String(receiptPayload.jti).slice(0, 180))
            .maybeSingle(),
          { label: 'RecordQuestion:idempotency-read' },
        );
        const existing = existingResult.data;
        const sameSubmission = existing
          && String(existing.game_id) === String(gameId)
          && String(existing.question_id) === String(questionId)
          && String(existing.answer_id).toLowerCase() === String(answerId).toLowerCase()
          && String(existing.attempt_id) === String(receiptPayload.attemptId)
          && Number(existing.hand_ordinal) === Number(receiptPayload.handOrdinal)
          && Number(existing.decision_ordinal) === Number(receiptPayload.decisionOrdinal)
          && String(existing.snapshot_key) === String(receiptPayload.snapshotKey);
        if (!sameSubmission) {
          return res.status(409).json({
            success: false,
            error: 'This training hand was already submitted with a different answer.',
            code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT',
          });
        }
        idempotentReplay = true;
      }

      // A continuation action is grading-adjacent state: exposing it with the
      // blind question hints which answer keeps the solved line alive. Reveal
      // only the canonical option id, and only after the exact answer row has
      // been durably inserted (or verified as an identical replay).
      const continuationAction = String(
        canonicalScenario.nextStreetContinuationAction || '',
      );
      const revealedContinuationAction = servedQuestion.options?.some(
        (option) => String(option?.id ?? option) === continuationAction,
      ) ? continuationAction : null;

      return res.status(200).json({
        success: true,
        idempotentReplay,
        submissionId: receiptPayload.jti,
        sessionId: receiptPayload.sessionId,
        attemptId: receiptPayload.attemptId,
        snapshotKey: receiptPayload.snapshotKey,
        handOrdinal: receiptPayload.handOrdinal,
        decisionOrdinal: receiptPayload.decisionOrdinal,
        countsTowardCompletion: receiptPayload.countsTowardCompletion,
        practiceOnly: receiptPayload.practiceOnly,
        evidence: {
          solverVerified: verified,
          classification: persistedClassification,
          evLossMeasured: verified ? canonicalGrade.evLossMeasured : false,
          isCorrect: canonicalGrade.isCorrect,
          gradeMode: answerContract.gradeMode,
          difficultyMode: answerContract.difficultyMode,
          rng: answerContract.rng,
          canonicalSolverClassification: canonicalSolverGrade.classification,
          selectedFrequency: verified ? canonicalGrade.selectedFrequency : null,
          optimalFrequency: verified ? canonicalGrade.optimalFrequency : null,
          evLoss: persistedEVLoss,
          optimalAction: canonicalSolverGrade.optimalAction,
        },
        feedback: {
          correctAnswer: servedQuestion.correctAnswer,
          correctAnswerText: servedQuestion.correctAnswerText
            || servedQuestion.options?.find((option) => String(option?.id) === String(servedQuestion.correctAnswer))?.text
            || String(servedQuestion.correctAnswer || ''),
          explanation: servedQuestion.explanation || '',
          structuredExplanation: servedQuestion.structuredExplanation || null,
          gtoFrequencies: verified ? (servedQuestion.gtoFrequencies || null) : null,
          frequencies: verified ? (servedQuestion.frequencies || null) : null,
          rawFrequencies: verified ? (servedQuestion.rawFrequencies || null) : null,
          evData: verified ? (servedQuestion.evData || null) : null,
          actionEVs: verified ? (servedQuestion.actionEVs || null) : null,
          solverVerified: verified,
          dataQuality: servedQuestion.dataQuality || null,
          continuation: revealedContinuationAction
            ? { actionId: revealedContinuationAction }
            : null,
        },
      });
    } catch (error) {
      console.warn('Record question error:', error);
      if (isTrainingPersistenceUnavailable(error)) {
        return res.status(503).json(trainingPersistenceUnavailableBody());
      }
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
