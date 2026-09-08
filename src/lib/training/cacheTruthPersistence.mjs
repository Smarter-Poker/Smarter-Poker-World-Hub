import {
  TRAINING_SOURCE_CLASSIFICATION,
  alignQuestionToCanonicalPolicy,
  sourceClassificationForQuestion,
  withTrainingSourceClassification,
} from './cacheTruthContract.mjs';
import { stablePolicyJson, validateSolverPolicyAnswer } from './solverPolicyContract.js';
import { runTrainingPersistenceQuery } from './trainingPersistence.mjs';

const text = (value, max = 255) => {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : null;
};

const objectOrNull = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : null
);

const isoOrNull = (value) => {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

export function cacheQuestionFromRow(row) {
  if (!row?.question_data || typeof row.question_data !== 'object') return null;
  return withTrainingSourceClassification({
    ...row.question_data,
    ...(objectOrNull(row.canonical_policy) ? { solverPolicy: row.canonical_policy } : {}),
    ...(row.source_classification
      ? { sourceClassification: row.source_classification }
      : {}),
  });
}

/**
 * Construct the only cache write shape used by live Training routes. The
 * database trigger independently derives these values again, so an accidental
 * writer regression fails closed rather than laundering a label.
 */
export function buildTrainingCacheRow({
  question,
  questionId,
  gameId,
  questionKind,
  gameType,
  level,
  generatedAt = null,
  id = null,
}) {
  const classifiedQuestion = alignQuestionToCanonicalPolicy(question);
  const policy = objectOrNull(classifiedQuestion?.solverPolicy);
  const key = objectOrNull(policy?.key);
  const source = objectOrNull(policy?.sourceArtifact);
  const provenance = objectOrNull(classifiedQuestion?.solverProvenance) || {};
  const scenario = objectOrNull(classifiedQuestion?.scenario) || {};
  const sourceClassification = sourceClassificationForQuestion(classifiedQuestion);
  const canonicalQuestionId = text(questionId || classifiedQuestion?.id, 180);
  const normalizedGameId = text(gameId, 100);
  const normalizedQuestionKind = text(questionKind, 20)?.toUpperCase();
  const normalizedGameType = text(gameType, 20)?.toLowerCase();
  const generatedTimestamp = isoOrNull(generatedAt) || new Date().toISOString();
  if (!canonicalQuestionId || !normalizedGameId || !classifiedQuestion) {
    throw new Error('A canonical cache row requires question, questionId, and gameId');
  }
  // One immutable identifier crosses cache, delivery, answer, completion, and
  // event-ledger records. Historical rows sometimes carried a payload id that
  // differed from question_id; retaining both creates duplicate cache rows and
  // makes answer receipts ambiguous.
  classifiedQuestion.id = canonicalQuestionId;
  if (!['PIO', 'CHART', 'SCENARIO'].includes(normalizedQuestionKind)) {
    throw new Error(`Unsupported training question kind: ${normalizedQuestionKind || 'missing'}`);
  }
  if (!['cash', 'tournament', 'sng'].includes(normalizedGameType)) {
    throw new Error(`Unsupported training game type: ${normalizedGameType || 'missing'}`);
  }
  const policyValidation = validateSolverPolicyAnswer(policy);
  if (!policyValidation.valid || policy?.kind === 'unavailable') {
    throw new Error(
      `A canonical cache row requires an available canonical policy: ${policyValidation.errors.join(',') || 'unavailable'}`,
    );
  }

  const options = Array.isArray(classifiedQuestion.options) ? classifiedQuestion.options : [];
  const optionIds = options.map((option) => text(option?.id, 100)?.toLowerCase()).filter(Boolean);
  const distribution = Object.fromEntries(
    Object.entries(policy.distribution || {}).map(([keyName, value]) => [
      String(keyName).toLowerCase(),
      Number(value),
    ]),
  );
  const distributionIds = Object.keys(distribution).sort();
  if (
    optionIds.length < 2
    || new Set(optionIds).size !== optionIds.length
    || JSON.stringify([...optionIds].sort()) !== JSON.stringify(distributionIds)
  ) {
    throw new Error('Question options must match the canonical policy action set');
  }
  const correctAnswer = text(classifiedQuestion.correctAnswer, 100)?.toLowerCase();
  const bestFrequency = Math.max(...Object.values(distribution));
  if (
    !correctAnswer
    || !Object.prototype.hasOwnProperty.call(distribution, correctAnswer)
    || Math.abs(distribution[correctAnswer] - bestFrequency) > 1e-9
  ) {
    throw new Error('Question answer key must match a maximum-frequency canonical policy action');
  }

  const scenarioHash = text(
    source?.scenarioHash
      || provenance.scenarioHash
      || scenario.scenarioHash
      || classifiedQuestion.scenarioHash,
    500,
  );
  const sourceAuditedAt = isoOrNull(source?.auditedAt || provenance.auditedAt);
  const sourceCreatedAt = isoOrNull(
    classifiedQuestion.sourceCreatedAt
      || classifiedQuestion.generatedAt
      || generatedTimestamp,
  ) || generatedTimestamp;
  const generatorVersion = text(
    classifiedQuestion.generatorVersion
      || classifiedQuestion.engineVersion
      || classifiedQuestion.questionContract?.generatorVersion
      || `training-cache-contract.1:${sourceClassification.toLowerCase()}`,
    160,
  );
  const exactNode = objectOrNull(policy?.node);
  const publicActionHistory = objectOrNull(key?.publicActionHistory)
    || objectOrNull(scenario.publicActionHistory);
  const sourceChecksum = text(
    source?.sourceArtifactChecksum || provenance.sourceArtifactChecksum,
    128,
  );

  return {
    ...(text(id, 80) ? { id: text(id, 80) } : {}),
    question_id: canonicalQuestionId,
    game_id: normalizedGameId,
    // Kept during the rolling transition for old readers. New code treats this
    // as a question family only; it is never a provenance badge.
    engine_type: normalizedQuestionKind,
    question_kind: normalizedQuestionKind,
    game_type: normalizedGameType,
    level: Math.min(12, Math.max(1, Math.trunc(Number(level) || 1))),
    question_data: classifiedQuestion,
    canonical_policy: policy,
    source_classification: sourceClassification,
    scenario_hash: scenarioHash,
    exact_node: exactNode,
    public_action_history: publicActionHistory,
    policy_version: text(policy?.policyVersion, 160),
    solver_version: text(source?.solverVersion || provenance.solverVersion, 160),
    solver_binary_checksum: text(
      source?.solverBinaryChecksum || provenance.solverBinaryChecksum,
      128,
    ),
    manifest_version: text(source?.manifestVersion || provenance.manifestVersion, 160),
    manifest_checksum: text(source?.manifestChecksum || provenance.manifestChecksum, 128),
    source_checksum: sourceChecksum,
    pipeline_commit: text(source?.pipelineCommit || provenance.pipelineCommit, 80),
    machine_id: text(source?.machineId || provenance.machineId, 80),
    source_created_at: sourceCreatedAt,
    source_audited_at: sourceAuditedAt,
    generator_version: generatorVersion,
    generated_at: generatedTimestamp,
    lineage: {
      contractVersion: 'smarter-poker.training-cache-lineage.v1',
      sourceClassification,
      policyVersion: policy?.policyVersion || null,
      scenarioHash,
      exactNode,
      publicActionHistory,
      sourceArtifact: source,
      sourceCreatedAt,
      sourceAuditedAt,
      generatorVersion,
    },
    quality_status: sourceClassification === TRAINING_SOURCE_CLASSIFICATION.LEGACY_UNVERIFIED
      ? 'active_fallback'
      : 'active',
  };
}

/**
 * Bind the response to the row Postgres accepted. A caller cannot render a
 * provenance badge until the trigger-derived classification and checksum have
 * been read back from the database.
 */
export function withPersistedCacheReceipt(question, row) {
  if (!question || !row?.question_data || !cacheRowIsServingEligible(row)) {
    throw new Error('Persisted cache receipt does not match the served canonical policy');
  }
  if (stablePolicyJson(question.solverPolicy) !== stablePolicyJson(row.canonical_policy)) {
    throw new Error('Persisted cache receipt changed the canonical grading policy');
  }
  const checksum = text(row.policy_checksum, 128)?.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(checksum || '')) {
    throw new Error('Persisted cache receipt is missing its canonical policy checksum');
  }
  const persistedQuestion = alignQuestionToCanonicalPolicy(cacheQuestionFromRow(row));
  if (text(row.policy_version, 160) !== text(persistedQuestion?.solverPolicy?.policyVersion, 160)) {
    throw new Error('Persisted cache receipt policy version does not match the response');
  }
  return {
    ...persistedQuestion,
    sourceClassification: row.source_classification,
    dataQuality: row.source_classification,
    policyChecksum: checksum,
  };
}

export function cacheRowIsServingEligible(row) {
  if (!row || !['active', 'active_fallback'].includes(row.quality_status)) return false;
  const question = cacheQuestionFromRow(row);
  if (!question) return false;
  const policyValidation = validateSolverPolicyAnswer(row.canonical_policy);
  const embeddedPolicy = row.question_data?.solverPolicy;
  return policyValidation.valid
    && row.canonical_policy?.kind !== 'unavailable'
    && stablePolicyJson(embeddedPolicy) === stablePolicyJson(row.canonical_policy)
    && /^[0-9a-f]{64}$/i.test(String(row.policy_checksum || ''))
    && sourceClassificationForQuestion(question) === row.source_classification;
}

/** Record one delivery receipt per returned question in one atomic RPC. */
export async function recordTrainingQuestionsServed(
  db,
  { requestId, userId = null, receipts },
) {
  const canonical = (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
    questionId: text(receipt?.questionId, 180),
    policyChecksum: text(receipt?.policyChecksum, 64)?.toLowerCase(),
  }));
  if (
    !text(requestId, 180)
    || canonical.length === 0
    || canonical.length > 50
    || new Set(canonical.map((receipt) => receipt.questionId)).size !== canonical.length
    || canonical.some((receipt) => (
      !receipt.questionId || !/^[0-9a-f]{64}$/.test(receipt.policyChecksum || '')
    ))
  ) {
    throw new Error('A serve receipt requires unique question IDs and canonical policy checksums');
  }
  const { data, error } = await db.rpc('fn_training_cache_record_served_batch', {
    p_request_key: text(requestId, 180),
    p_question_receipts: canonical,
    p_user_id: userId || null,
  });
  if (error) throw new Error(`training_cache_serve_receipt_failed:${error.message}`);
  if (Number(data?.questionCount) !== canonical.length) {
    throw new Error('training_cache_serve_receipt_count_mismatch');
  }
  return data;
}

/**
 * Persist, read back, and receipt a complete set of questions before any API
 * returns them. This is the shared boundary used by secondary Training
 * surfaces (custom trainer, next street and spot drill) so none can bypass the
 * canonical cache contract implemented by get-question and batch-preload.
 */
export async function persistCanonicalTrainingQuestions(db, {
  questions,
  gameId,
  questionKind = 'PIO',
  gameType = 'cash',
  level = 1,
  userId = null,
  requestId,
  recordServed = true,
  label = 'TrainingCache:canonicalize',
}) {
  const list = Array.isArray(questions) ? questions : [];
  if (list.length < 1 || list.length > 100) {
    throw new Error('Canonical training persistence requires 1 to 100 questions');
  }
  const rows = list.map((question) => buildTrainingCacheRow({
    question,
    questionId: question?.id,
    gameId,
    questionKind: typeof questionKind === 'function' ? questionKind(question) : questionKind,
    gameType: typeof gameType === 'function' ? gameType(question) : gameType,
    level: typeof level === 'function' ? level(question) : level,
  }));
  if (new Set(rows.map((row) => row.question_id)).size !== rows.length) {
    throw new Error('Canonical training persistence received duplicate question IDs');
  }

  const persisted = await runTrainingPersistenceQuery(
    () => db.from('training_question_cache')
      .upsert(rows, { onConflict: 'question_id', defaultToNull: false })
      .select('question_id, question_data, canonical_policy, source_classification, quality_status, policy_version, policy_checksum'),
    { label },
  );
  const receipts = new Map((persisted.data || []).map((row) => [String(row.question_id), row]));
  if (receipts.size !== rows.length) {
    throw new Error('Database did not return one canonical receipt per question');
  }
  const served = rows.map((row) => withPersistedCacheReceipt(
    row.question_data,
    receipts.get(String(row.question_id)),
  ));

  if (recordServed) {
    const baseRequestId = text(requestId, 170);
    if (!baseRequestId) throw new Error('Canonical training persistence requires a request ID');
    for (let offset = 0; offset < rows.length; offset += 50) {
      const slice = rows.slice(offset, offset + 50);
      await recordTrainingQuestionsServed(db, {
        requestId: `${baseRequestId}:${Math.floor(offset / 50)}`,
        userId,
        receipts: slice.map((row) => ({
          questionId: row.question_id,
          policyChecksum: receipts.get(String(row.question_id))?.policy_checksum,
        })),
      });
    }
  }
  return served;
}

export default {
  buildTrainingCacheRow,
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
  persistCanonicalTrainingQuestions,
  recordTrainingQuestionsServed,
  withPersistedCacheReceipt,
};
