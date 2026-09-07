import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/training/record-question
 * Records that a user has seen/answered a question (for no-repeat tracking)
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/sentryWrap';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { filterCachedRowsForGame } from '../../../src/lib/training/cacheContract.mjs';
import { gradeCanonicalPolicyDecision } from '../../../src/lib/training/cacheTruthContract.mjs';
import {
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
} from '../../../src/lib/training/cacheTruthPersistence.mjs';
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

async function getCanonicalQuestion(questionId, gameId) {
  const db = getSupabase();
  const byQuestionId = await runTrainingPersistenceQuery(
    () => db
      .from('training_question_cache')
      .select('question_id, question_data, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
      .eq('question_id', questionId)
      .eq('game_id', gameId)
      .in('quality_status', ['active', 'active_fallback'])
      .maybeSingle(),
    { label: 'RecordQuestion:canonical-id' },
  );
  if (!byQuestionId.error && byQuestionId.data?.question_data) return byQuestionId.data;

  // A handful of old cache writers prefixed the row's question_id while the
  // client received question_data.id. JSON containment finds those rows without
  // trusting a solver snapshot supplied by the browser.
  const byPayloadId = await runTrainingPersistenceQuery(
    () => db
      .from('training_question_cache')
      .select('question_id, question_data, engine_type, question_kind, canonical_policy, source_classification, quality_status, policy_version, policy_checksum')
      .eq('game_id', gameId)
      .in('quality_status', ['active', 'active_fallback'])
      .contains('question_data', { id: questionId })
      .limit(1)
      .maybeSingle(),
    { label: 'RecordQuestion:canonical-payload' },
  );
  if (!byPayloadId.error && byPayloadId.data?.question_data) return byPayloadId.data;
  return null;
}

async function getEligibleCanonicalQuestion(questionId, gameId) {
  const gameConfig = pioQueryService.getGameConfig(String(gameId));
  // Batch preload writes the sanitized envelope before it returns, but the
  // first read through Supabase can briefly observe the pre-update row (or no
  // row) while the PostgREST/read-replica path catches up. Re-read only the
  // server-owned canonical row; never fall back to the browser's answer key.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const canonicalRow = await getCanonicalQuestion(String(questionId), String(gameId));
    const hydratedRow = canonicalRow
      ? { ...canonicalRow, question_data: cacheQuestionFromRow(canonicalRow) }
      : null;
    const [eligibleCanonical] = hydratedRow
      ? filterCachedRowsForGame(
          [hydratedRow],
          gameConfig,
          { allowSanitizedLegacyArchive: true },
        )
      : [];
    if (eligibleCanonical?.question_data && cacheRowIsServingEligible(eligibleCanonical)) {
      return eligibleCanonical;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 100 * (2 ** attempt)));
  }
  return null;
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

    const { userId, gameId, questionId, level } = req.body;
    const servedPolicyChecksum = typeof req.body?.policyChecksum === 'string'
      ? req.body.policyChecksum.trim().toLowerCase()
      : '';

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
      const canonicalRow = await getEligibleCanonicalQuestion(questionId, gameId);
      const canonicalQuestion = canonicalRow?.question_data;
      if (!canonicalQuestion || !canonicalRow?.canonical_policy) {
        // This includes old offline packs whose unsealed PIO rows are no longer
        // safe to grade. Do not accept the browser's answer key; make the
        // client fetch a freshly sanitized canonical question.
        return res.status(409).json({
          success: false,
          error: 'This question has expired. Refresh the training hand and try again.',
          code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
        });
      }
      if (
        !/^[0-9a-f]{64}$/.test(servedPolicyChecksum)
        || servedPolicyChecksum !== String(canonicalRow.policy_checksum || '').toLowerCase()
      ) {
        return res.status(409).json({
          success: false,
          error: 'This question policy changed after it was served. Refresh the training hand and try again.',
          code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
        });
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

      // Record the answer for stats.
      // 2026-07-19 AUDIT FIX: Phase 14 spot-metadata columns (hero_position,
      // villain_position, street, classification, ev_loss, spot_type) are now
      // real — added by migration training_answers_spot_metadata_columns.
      // useGTOTrainer already POSTs this metadata on every answer; persisting
      // it is what powers smart-practice weak-spot targeting and the
      // position/street/mistake breakdowns in analytics.js.
      const {
        submissionId = null,
        heroPosition = null,
        villainPosition = null,
        street = null,
        spotType = null,
      } = req.body || {};
      const canonicalGrade = gradeCanonicalPolicyDecision(
        canonicalRow.canonical_policy,
        String(answerId),
      );
      if (!canonicalGrade.valid) {
        return res.status(409).json({
          success: false,
          error: 'This question policy is no longer gradeable. Refresh the training hand and try again.',
          code: 'TRAINING_QUESTION_REFRESH_REQUIRED',
        });
      }
      const verified = canonicalGrade?.solverVerified === true;
      const canonicalScenario = canonicalQuestion?.scenario || {};
      const canonicalSpotType = canonicalScenario.spotType
        || canonicalScenario.nodeType
        || canonicalScenario.potType
        || canonicalQuestion?.spotType
        || 'general';

      // The browser's classification is useful for legacy/scenario analytics,
      // but it is never accepted as solver evidence. When a canonical cached
      // question exists the server recomputes every graded field from it.
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
        is_correct: canonicalGrade.isCorrect,
        level: Math.min(12, Math.max(1, Number(level) || 1)),
        answered_at: new Date().toISOString(),
        hero_position: canonicalQuestion
          ? String(canonicalScenario.heroPosition || canonicalScenario.position || '').slice(0, 10) || null
          : (typeof heroPosition === 'string' ? heroPosition.slice(0, 10) : null),
        villain_position: canonicalQuestion
          ? String(canonicalScenario.villainPosition || '').slice(0, 10) || null
          : (typeof villainPosition === 'string' ? villainPosition.slice(0, 10) : null),
        street: canonicalQuestion
          ? String(canonicalScenario.street || '').slice(0, 12) || null
          : (typeof street === 'string' ? street.slice(0, 12) : null),
        classification: persistedClassification,
        ev_loss: persistedEVLoss,
        spot_type: canonicalQuestion
          ? String(canonicalSpotType).slice(0, 40)
          : (typeof spotType === 'string' ? spotType.slice(0, 40) : null),
      };
      const evidenceRow = {
        ...baseRow,
        submission_id: typeof submissionId === 'string' ? submissionId.slice(0, 180) : null,
        solver_verified: verified,
        solver_source: verified ? String(canonicalGrade.solverSource || 'solver').slice(0, 60) : null,
        selected_frequency: verified ? canonicalGrade.selectedFrequency : null,
        optimal_frequency: verified ? canonicalGrade.optimalFrequency : null,
        ev_loss_measured: verified ? canonicalGrade.evLossMeasured : false,
        evidence_metadata: verified ? {
          optimalAction: canonicalGrade.optimalAction,
          dataQuality: canonicalRow.source_classification,
          policyVersion: canonicalGrade.policyVersion,
          policyChecksum: servedPolicyChecksum,
          sourceChecksum: canonicalGrade.sourceChecksum,
        } : {
          reason: 'canonical_policy_is_explicit_fallback',
          dataQuality: canonicalRow.source_classification,
          policyVersion: canonicalGrade.policyVersion,
          policyChecksum: servedPolicyChecksum,
        },
      };

      await runTrainingPersistenceQuery(
        () => submissionId
          ? getSupabase().from('training_answers').upsert(evidenceRow, { onConflict: 'user_id,submission_id' })
          : getSupabase().from('training_answers').insert(evidenceRow),
        { label: 'RecordQuestion:insert' }
      );

      return res.status(200).json({
        success: true,
        evidence: {
          solverVerified: verified,
          classification: persistedClassification,
          evLossMeasured: verified ? canonicalGrade.evLossMeasured : false,
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
