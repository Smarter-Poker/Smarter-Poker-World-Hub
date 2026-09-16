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
import { cacheRowIsServingEligible } from '../../../src/lib/training/cacheTruthPersistence.mjs';
import { stablePolicyJson } from '../../../src/lib/training/solverPolicyContract.js';
import {
  authorizeTrainingAttemptDecisionAnswer,
  promoteLegacySignedTrainingAttemptDecision,
  trainingQuestionSnapshotMatchesIdentity,
} from '../../../src/lib/training/trainingAttemptDelivery.mjs';
import {
  TRAINING_ANSWER_BINDING_COLUMNS,
  trainingAnswerBindingMatches,
} from '../../../src/lib/training/answerPersistence.mjs';

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

async function getCanonicalQuestion(questionId) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_question_cache')
      .select('question_id, question_data, game_id, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
      .eq('question_id', String(questionId))
      .in('quality_status', ['active', 'active_fallback'])
      .maybeSingle(),
    { label: 'RecordQuestion:canonical-policy-read' },
  );
  return result.data || null;
}

function canonicalPolicyReceiptMatches({ canonicalQuestion, cacheRow, submittedChecksum }) {
  const snapshotChecksum = String(canonicalQuestion?.policyChecksum || '').trim().toLowerCase();
  const currentChecksum = String(cacheRow?.policy_checksum || '').trim().toLowerCase();
  const bodyChecksum = typeof submittedChecksum === 'string'
    ? submittedChecksum.trim().toLowerCase()
    : '';
  return /^[0-9a-f]{64}$/.test(snapshotChecksum)
    && snapshotChecksum === currentChecksum
    && /^[0-9a-f]{64}$/.test(bodyChecksum)
    && bodyChecksum === snapshotChecksum
    && cacheRowIsServingEligible(cacheRow)
    && stablePolicyJson(canonicalQuestion?.solverPolicy) === stablePolicyJson(cacheRow?.canonical_policy);
}

async function getExistingAnswerSubmission(userId, submissionId) {
  const result = await runTrainingPersistenceQuery(
    () => getSupabase()
      .from('training_answers')
      .select(TRAINING_ANSWER_BINDING_COLUMNS)
      .eq('user_id', userId)
      .eq('submission_id', String(submissionId).slice(0, 180))
      .maybeSingle(),
    { label: 'RecordQuestion:idempotency-read' },
  );
  return result.data || null;
}

function sameReceiptRng(existing, receiptRng) {
  const storedRng = existing?.evidence_metadata?.rng ?? null;
  const requestHasRng = receiptRng !== null && receiptRng !== undefined;
  const storedHasRng = storedRng !== null && storedRng !== undefined;
  if (!requestHasRng || !storedHasRng) return !requestHasRng && !storedHasRng;
  if (
    typeof receiptRng !== 'object'
    || typeof storedRng !== 'object'
    || !Number.isInteger(receiptRng.roll)
    || !Number.isInteger(storedRng.roll)
  ) return false;
  return String(storedRng.mode) === String(receiptRng.mode)
    && storedRng.roll === receiptRng.roll;
}

function isSameAnswerSubmission(existing, {
  gameId,
  questionId,
  answerId,
  receiptPayload,
  receiptRng,
}) {
  return Boolean(existing)
    && String(existing.game_id) === String(gameId)
    && String(existing.question_id) === String(questionId)
    && String(existing.answer_id).toLowerCase() === String(answerId).toLowerCase()
    && String(existing.attempt_id) === String(receiptPayload.attemptId)
    && Number(existing.hand_ordinal) === Number(receiptPayload.handOrdinal)
    && Number(existing.decision_ordinal) === Number(receiptPayload.decisionOrdinal)
    && String(existing.snapshot_key) === String(receiptPayload.snapshotKey)
    && sameReceiptRng(existing, receiptRng);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function buildRecordedAnswerResponse({
  answerContract = null,
  canonicalQuestion,
  receiptPayload,
  servedQuestion,
  persistedAnswer = null,
  idempotentReplay = false,
}) {
  const canonicalGrade = answerContract?.grade || {};
  const canonicalSolverGrade = answerContract?.canonicalSolverGrade || {};
  const storedMetadata = persistedAnswer?.evidence_metadata || {};
  const verified = persistedAnswer
    ? persistedAnswer.solver_verified === true
    : canonicalGrade?.solverVerified === true;
  const persistedClassification = persistedAnswer?.classification
    || canonicalGrade.classification;
  const persistedEVLoss = persistedAnswer && hasOwn(persistedAnswer, 'ev_loss')
    ? Number(persistedAnswer.ev_loss) || 0
    : verified && canonicalGrade.evLossMeasured ? canonicalGrade.evLoss : 0;
  const canonicalScenario = canonicalQuestion?.scenario || {};

  // A continuation action is grading-adjacent state: exposing it with the
  // blind question hints which answer keeps the solved line alive. Reveal it
  // only after a durable insert or an exact idempotency read proves the answer.
  const continuationSourceAction = String(
    canonicalScenario.nextStreetContinuationAction || '',
  );
  const continuationPolicyMatches = (servedQuestion.solverPolicy?.actions || [])
    .filter((action) => (
      action?.legal !== false
      && String(action?.sourceCode || '') === continuationSourceAction
    ));
  const continuationPolicyAction = continuationPolicyMatches.length === 1
    ? continuationPolicyMatches[0]
    : null;
  const difficultyMembers = servedQuestion?._difficultyMembers
    || answerContract?.difficultyMembers
    || {};
  const continuationPublicOwners = continuationPolicyAction
    ? (servedQuestion.options || []).filter((option) => {
        const optionId = String(option?.id ?? option);
        const members = Array.isArray(difficultyMembers?.[optionId])
          ? [...new Set(difficultyMembers[optionId].map(String))]
          : [optionId];
        return members.includes(String(continuationPolicyAction.id));
      })
    : [];
  const revealedContinuationAction = continuationPolicyAction
    && /^b[1-9]\d*$/.test(continuationSourceAction)
    && continuationPolicyAction.family === 'bet'
    && continuationPublicOwners.length === 1
    ? String(continuationPublicOwners[0]?.id ?? continuationPublicOwners[0])
    : null;

  const storedOr = (column, metadataKey, fallback) => {
    if (persistedAnswer && hasOwn(persistedAnswer, column)) return persistedAnswer[column];
    if (hasOwn(storedMetadata, metadataKey)) return storedMetadata[metadataKey];
    return fallback;
  };

  return {
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
      evLossMeasured: Boolean(storedOr(
        'ev_loss_measured',
        'evLossMeasured',
        verified ? canonicalGrade.evLossMeasured : false,
      )),
      isCorrect: Boolean(storedOr('is_correct', 'canonicalSolverIsCorrect', canonicalGrade.isCorrect)),
      gradeMode: storedOr('', 'gradeMode', answerContract?.gradeMode || null),
      difficultyMode: storedOr('', 'difficultyMode', answerContract?.difficultyMode || receiptPayload.difficultyMode),
      rng: storedOr('', 'rng', answerContract?.rng || null),
      canonicalSolverClassification: storedOr(
        '',
        'canonicalSolverClassification',
        canonicalSolverGrade.classification,
      ),
      selectedFrequency: verified
        ? storedOr('selected_frequency', 'selectedFrequency', canonicalGrade.selectedFrequency)
        : null,
      optimalFrequency: verified
        ? storedOr('optimal_frequency', 'optimalFrequency', canonicalGrade.optimalFrequency)
        : null,
      evLoss: persistedEVLoss,
      optimalAction: storedOr('', 'optimalAction', canonicalSolverGrade.optimalAction),
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
        ? {
            actionId: revealedContinuationAction,
            // The semantic id is used by the client. The checksummed raw
            // warehouse token is retained solely for exact pot projection.
            sourceAction: continuationSourceAction,
          }
        : null,
    },
  };
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
      let receiptExpired = false;
      try {
        ({ payload: receiptPayload, expired: receiptExpired } = verifyTrainingGradingReceiptEnvelope(
          req.body.gradingReceipt ?? req.body.receipt,
          {
            userId,
            gameId,
            questionId,
            sessionId: req.body.sessionId || undefined,
            attemptId: req.body.attemptId || undefined,
            snapshotKey: req.body.snapshotKey || undefined,
            // An expired HMAC envelope may identify an already-committed exact
            // replay below. It never authorizes a new grade.
            allowExpired: true,
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
        !trainingQuestionSnapshotMatchesIdentity(snapshot, {
          gameId: receiptPayload.gameId,
          level: receiptPayload.level,
        })
        || String(snapshot.snapshot_key) !== String(receiptPayload.snapshotKey)
        || String(snapshot.source_question_id) !== String(receiptPayload.questionId)
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
      let canonicalCacheRow;
      let receiptRng = null;
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
            allowExpired: true,
          },
        );
        receiptPayload = verifiedReceipt.payload;
        receiptExpired = verifiedReceipt.expired === true;
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
        receiptRng = deriveReceiptRng(receiptPayload, req.body.rng ?? null);
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

      // A lost HTTP response must not make a committed answer unrecoverable.
      // Verify the immutable signed snapshot and exact submitted identity
      // first, then look for the durable idempotency key before consulting the
      // mutable serving cache. The cache may legitimately have been refreshed
      // after the original insert; that cannot erase its committed feedback.
      const snapshotPolicyChecksum = String(canonicalQuestion?.policyChecksum || '')
        .trim()
        .toLowerCase();
      const submittedPolicyChecksum = String(req.body.policyChecksum || '')
        .trim()
        .toLowerCase();
      if (
        !/^[0-9a-f]{64}$/.test(snapshotPolicyChecksum)
        || submittedPolicyChecksum !== snapshotPolicyChecksum
      ) {
        return res.status(409).json({
          success: false,
          error: 'This question policy does not match its signed snapshot. Refresh the training hand and try again.',
          code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
        });
      }

      let persistedAnswer = await getExistingAnswerSubmission(userId, receiptPayload.jti);
      if (persistedAnswer) {
        if (!isSameAnswerSubmission(persistedAnswer, {
          gameId,
          questionId,
          answerId,
          receiptPayload,
          receiptRng,
        })) {
          return res.status(409).json({
            success: false,
            error: 'This training hand was already submitted with a different answer.',
            code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT',
          });
        }
        return res.status(200).json(buildRecordedAnswerResponse({
          canonicalQuestion,
          receiptPayload,
          servedQuestion,
          persistedAnswer,
          idempotentReplay: true,
        }));
      }

      // Only the immutable row above can outlive the signed receipt. Without
      // an exact committed answer, expiry still blocks every authorization,
      // grading, cache event, and write path.
      if (receiptExpired) {
        return res.status(409).json({
          success: false,
          error: 'This training hand has expired. Load a fresh hand.',
          code: 'TRAINING_GRADING_RECEIPT_EXPIRED',
        });
      }

      const decisionAuthority = {
        userId,
        attemptId: receiptPayload.attemptId,
        handOrdinal: receiptPayload.handOrdinal,
        decisionOrdinal: receiptPayload.decisionOrdinal,
        snapshotKey: receiptPayload.snapshotKey,
        questionId: receiptPayload.questionId,
        policyChecksum: snapshotPolicyChecksum,
      };
      let deliveredByAttempt = await authorizeTrainingAttemptDecisionAnswer(
        getSupabase(),
        decisionAuthority,
      );
      if (!deliveredByAttempt) {
        const legacyReceiptPromoted = await promoteLegacySignedTrainingAttemptDecision(
          getSupabase(),
          {
            ...decisionAuthority,
            receiptId: receiptPayload.jti,
            receiptIssuedAt: receiptPayload.iat,
            receiptExpiresAt: receiptPayload.exp,
          },
        );
        if (legacyReceiptPromoted) {
          deliveredByAttempt = await authorizeTrainingAttemptDecisionAnswer(
            getSupabase(),
            decisionAuthority,
          );
        }
      }
      if (!deliveredByAttempt) {
        return res.status(409).json({
          success: false,
          error: 'This immutable question was never delivered for the signed attempt slot.',
          code: 'TRAINING_QUESTION_NOT_SERVED_FOR_ATTEMPT',
        });
      }

      // No durable result exists, so and only so compute a new grade. An exact
      // replay is reconstructed from its stored evidence above and cannot be
      // reinterpreted by a later grading implementation.
      try {
        answerContract = gradeTrainingAnswer({
          canonicalQuestion,
          selectedAnswer: String(answerId),
          difficultyMode: receiptPayload.difficultyMode,
          rng: receiptRng,
        });
      } catch (contractError) {
        if (contractError instanceof TrainingAnswerContractError) {
          return res.status(contractError.status || 400).json({
            success: false,
            error: contractError.message,
            code: contractError.code,
          });
        }
        throw contractError;
      }

      canonicalCacheRow = await getCanonicalQuestion(receiptPayload.questionId);
      const currentCacheMatches = canonicalPolicyReceiptMatches({
        canonicalQuestion,
        cacheRow: canonicalCacheRow,
        submittedChecksum: req.body.policyChecksum,
      });
      const evidencePolicy = currentCacheMatches
        ? canonicalCacheRow
        : {
            source_classification: canonicalQuestion.sourceClassification
              || canonicalQuestion.dataQuality
              || 'LEGACY_UNVERIFIED',
            policy_version: canonicalQuestion?.solverPolicy?.policyVersion || null,
            policy_checksum: snapshotPolicyChecksum,
          };

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
          sourceClassification: evidencePolicy.source_classification,
          policyVersion: evidencePolicy.policy_version,
          policyChecksum: evidencePolicy.policy_checksum,
          ...(verified ? { sourceChecksum: canonicalGrade.sourceChecksum } : {}),
          ...(verified ? {} : { reason: 'question_not_solver_verified' }),
        },
      };

      let idempotentReplay = false;
      try {
        // Answers are evidence rows, not mutable state. Insert only. A retry
        // carrying the signed receipt ID is acknowledged only after reading
        // back and comparing the complete immutable binding.
        await runTrainingPersistenceQuery(
          () => getSupabase().from('training_answers').insert(evidenceRow),
          { label: 'RecordQuestion:insert' }
        );
      } catch (insertError) {
        if (insertError?.cause?.code !== '23505') throw insertError;
        persistedAnswer = await getExistingAnswerSubmission(userId, receiptPayload.jti);
        if (!isSameAnswerSubmission(persistedAnswer, {
          gameId,
          questionId,
          answerId,
          receiptPayload,
          receiptRng,
        })) {
          return res.status(409).json({
            success: false,
            error: 'This training hand was already submitted with a different answer.',
            code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT',
          });
        }
        if (!trainingAnswerBindingMatches(persistedAnswer, evidenceRow)) {
          return res.status(409).json({
            success: false,
            error: 'This signed answer receipt is already bound to different immutable evidence.',
            code: 'TRAINING_ANSWER_BINDING_MISMATCH',
          });
        }
        idempotentReplay = true;
      }

      return res.status(200).json(buildRecordedAnswerResponse({
        answerContract,
        canonicalQuestion,
        receiptPayload,
        servedQuestion,
        persistedAnswer,
        idempotentReplay,
      }));
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
      // Error reporting is best-effort; the original API response remains authoritative.
      void _sentryErr;
    }
    console.warn('[API Error]', err);
    if (!res.headersSent)
      return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
