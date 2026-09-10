import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildTrainingAttestationContinuationPrecommit,
  TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
} from '../src/lib/training/trainingAttestationContinuationContract.mjs';
import { trainingAttemptConfigHash } from '../src/lib/training/trainingAttemptDelivery.mjs';

import {
  assertNoPreAnswerPrivateSelectionFields,
  assertRevealedAnswerPayloadContainsOnlyIntendedFields,
  assertExactReplay,
  attestationExitCode,
  buildAnswerRequest,
  compareReissuedManifest,
  collectMachineAdministratorEvidenceCore,
  continueRouteWithProtectionBypass,
  createSlidingWindowRequestPacer,
  createVercelCliRuntimeLogTransport,
  decodeReceiptObservation,
  finalizeProductionDeliveryAttestation,
  acquireEvidenceRunLock,
  originScopedAuthState,
  protectionBypassHeaders,
  redactReceiptMaterial,
  readDeploymentIdentity,
  readAdministratorCloseoutConfig,
  readMachineCollectorConfig,
  receiptFormatCensus,
  validateAnswerBinding,
  validateAdministratorCloseout,
  validateAttestationConfig,
  validateCompletePublicAttestation,
  validateContinuation,
  validateDesignatedAuditAuthState,
  validateFullAttemptDelivery,
  validateImmutableDeploymentUrl,
  verifyAuthenticPredecessorArtifact,
} from '../scripts/training-phase6-production-delivery-attestation.mjs';
import {
  NODE_SEMANTICS,
  POLICY_KIND,
  QUALITY_SEAL,
  createSolverPolicyAnswer,
  createSolverPolicyKey,
} from '../src/lib/training/solverPolicyContract.js';
import { validateStrictTrainingContinuationSnapshotPair } from '../src/lib/training/trainingContinuationEligibility.mjs';
import { pioQueryService } from '../src/services/PIOQueryService.js';

const SHA = 'a'.repeat(64);
const BUILD = 'a'.repeat(40);
const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const AUDIT_USER = '99999999-9999-4999-8999-999999999999';
const SESSION = 'phase6-session';
const DEPLOYMENT_URL = 'https://hub-vanguard-abc123-smarter-poker.vercel.app';
const DEPLOYMENT_ID = 'dpl_phase6Immutable123';
const ADMIN_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_THE_ADMIN_CLOSEOUT_EVIDENCE_IS_COMPLETE_AND_ACCESS_CONTROLLED';
const STARTED_AT = '2026-09-08T12:00:00.000Z';
const API_COMPLETED_AT = '2026-09-08T12:03:44.000Z';
const COMPLETED_AT = '2026-09-08T12:04:00.000Z';
const VERIFIED_AT = '2026-09-08T12:05:00.000Z';
const SOLVER_BINARY_CHECKSUM = '1'.repeat(64);
const PIPELINE_COMMIT = '2'.repeat(40);
const MANIFEST_CHECKSUM = '3'.repeat(64);

function exactSnapshotProvenance(scenarioHash, sourceArtifactChecksum, machineId = 'M1') {
  return {
    verified: true,
    source: 'PioSOLVER',
    scenarioHash,
    solverVersion: 'PioSOLVER-3.0',
    solverBinaryChecksum: SOLVER_BINARY_CHECKSUM,
    machineId,
    pipelineCommit: PIPELINE_COMMIT,
    manifestVersion: 'phase6-fixture-v1',
    manifestChecksum: MANIFEST_CHECKSUM,
    sourceArtifactChecksum,
    qualityStatus: 'validated',
    auditedAt: '2026-09-08T00:00:00.000Z',
  };
}

function derivedSnapshotPolicy({
  scenarioHash,
  sourceNode,
  street,
  boardCards,
  potBb,
  provenance,
  actions,
}) {
  const key = createSolverPolicyKey({
    variant: 'nlh',
    bettingStructure: 'no_limit',
    tableSize: 2,
    positions: {
      hero: 'BTN',
      villains: ['BB'],
      button: 'BTN',
      smallBlind: 'BTN',
      bigBlind: 'BB',
    },
    stackVector: [
      { seat: 0, position: 'BTN', stackBb: 100, active: true },
      { seat: 1, position: 'BB', stackBb: 100, active: true },
    ],
    blinds: { smallBlind: 0.5, bigBlind: 1, ante: 0, straddles: [], complete: true },
    rake: { percent: 0, capBb: 0, complete: true },
    tournamentUtility: { mode: 'cash', complete: true },
    payouts: [],
    bounties: [],
    street,
    board: boardCards,
    holding: ['9h', '8h'],
    publicActionHistory: { complete: true, actions: [] },
    legalActions: actions.map((action) => ({
      action: action.family,
      exactChips: action.family === 'bet' ? action.size.chips : 0,
    })),
    sidePotEligibility: {
      complete: true,
      pots: [{ id: 'main', amountChips: potBb, eligibleSeats: [0, 1], heroEligible: true }],
    },
  });
  return createSolverPolicyAnswer({
    key,
    kind: POLICY_KIND.DERIVED,
    node: {
      semantics: NODE_SEMANTICS.CHECK_OR_BET,
      sourceNode,
      actor: 'BTN',
      potBb,
      facingBetBb: 0,
    },
    actions,
    sourceArtifact: {
      system: 'solved_spots_gold_v2',
      artifactId: `solved-row:${scenarioHash}:${sourceNode}`,
      ...provenance,
      provenanceComplete: true,
    },
    qualitySeal: QUALITY_SEAL.SOLVER_DERIVED_RESPONSE,
    validDomain: { exactMatchDimensions: ['all'], approximatedDimensions: [], exclusions: [] },
    confidence: 1,
    fallbackReason: 'decision_key_incomplete',
  });
}

function privateContinuationSnapshotQuestions() {
  const actions = [
    {
      id: 'check', sourceCode: 'c', family: 'check', label: 'Check', frequency: 0.1,
      legal: true, size: { unit: 'none', exact: false },
    },
    {
      id: 'bet_33pct', sourceCode: 'b200', family: 'bet', label: 'Bet 33% Pot', frequency: 0.2,
      legal: true,
      size: { unit: 'chips', chips: 200, bigBlinds: 2, potFraction: 0.33, exact: true },
    },
    {
      id: 'bet_75pct', sourceCode: 'b412', family: 'bet', label: 'Bet 75% Pot', frequency: 0.6,
      legal: true,
      size: { unit: 'chips', chips: 412, bigBlinds: 4.12, potFraction: 0.75, exact: true },
    },
    {
      id: 'bet_125pct', sourceCode: 'b700', family: 'bet', label: 'Bet 125% Pot', frequency: 0.1,
      legal: true,
      size: { unit: 'chips', chips: 700, bigBlinds: 7, potFraction: 1.25, exact: true },
    },
  ];
  const parentScenarioHash = 'hu_cash_BTN_100bb_AsKdQc';
  const parentProvenance = exactSnapshotProvenance(parentScenarioHash, '4'.repeat(64));
  const parent = {
    id: 'question-1',
    question: 'The Big Blind checks to you on the flop. What is your best action?',
    dataQuality: 'SOLVER_DERIVED_RESPONSE',
    sourceClassification: 'SOLVER_DERIVED_RESPONSE',
    heroCards: ['9h', '8h'],
    boardCards: ['As', 'Kd', 'Qc'],
    options: actions.map(({ id, label }) => ({ id, text: label })),
    correctAnswer: 'bet_75pct',
    gtoFrequencies: Object.fromEntries(actions.map(({ id, frequency }) => [id, frequency * 100])),
    policyChecksum: SHA,
    solverProvenance: parentProvenance,
    scenario: {
      board: 'As Kd Qc',
      boardCards: ['As', 'Kd', 'Qc'],
      street: 'flop',
      gameType: 'hu_cash',
      scenarioHash: parentScenarioHash,
      heroHand: '98s',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      pot: 5.5,
      stackDepth: 100,
      solverNode: 'r:0:c',
      solverActionUnits: 'chips',
      nodeType: 'hero_bets_or_checks',
      nextStreetContinuationAction: 'b412',
      solverLineage: {
        rootPotBb: 5.5,
        effectiveStackBb: 97.5,
        rake: '0 0',
        treeGeometry: 'srp_parameterized_v2',
        oopPosition: 'BB',
        ipPosition: 'BTN',
      },
    },
  };
  parent.solverPolicy = derivedSnapshotPolicy({
    scenarioHash: parentScenarioHash,
    sourceNode: parent.scenario.solverNode,
    street: 'flop',
    boardCards: parent.boardCards,
    potBb: parent.scenario.pot,
    provenance: parentProvenance,
    actions,
  });

  const childBoard = ['As', 'Kd', 'Qc', '2s'];
  const childScenarioHash = 'turn_hu_cash_BTN_100bb_AsKdQc2s';
  const childNode = 'r:0:c:b412:c:2s:c';
  const childProvenance = exactSnapshotProvenance(childScenarioHash, '5'.repeat(64), 'M2');
  const child = {
    id: 'question-1-2',
    question: 'The Big Blind checks to you on the turn. What is your best action?',
    dataQuality: 'SOLVER_DERIVED_RESPONSE',
    sourceClassification: 'SOLVER_DERIVED_RESPONSE',
    heroCards: ['9h', '8h'],
    boardCards: childBoard,
    options: actions.map(({ id, label }) => ({ id, text: label })),
    correctAnswer: 'bet_75pct',
    gtoFrequencies: Object.fromEntries(actions.map(({ id, frequency }) => [id, frequency * 100])),
    policyChecksum: SHA,
    solverProvenance: childProvenance,
    scenario: {
      scenarioHash: childScenarioHash,
      solverNode: childNode,
      street: 'turn',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      boardCards: childBoard,
      pot: 13.74,
      stackDepth: 95.88,
      solverStackDepth: 100,
      solverLineage: {
        solverVersion: parentProvenance.solverVersion,
        solverBinaryChecksum: parentProvenance.solverBinaryChecksum,
        pipelineCommit: parentProvenance.pipelineCommit,
        manifestVersion: parentProvenance.manifestVersion,
        manifestChecksum: parentProvenance.manifestChecksum,
        rootPotBb: 5.5,
        effectiveStackBb: 97.5,
        rake: '0 0',
        treeGeometry: 'srp_parameterized_v2',
        oopPosition: 'BB',
        ipPosition: 'BTN',
      },
    },
  };
  child.solverPolicy = derivedSnapshotPolicy({
    scenarioHash: childScenarioHash,
    sourceNode: childNode,
    street: 'turn',
    boardCards: childBoard,
    potBb: child.scenario.pot,
    provenance: childProvenance,
    actions,
  });
  return { parent, child };
}

function receipt(payload) {
  return `${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${'a'.repeat(43)}`;
}

test('administrator snapshot fixture preserves derived authority while proving exact lineage', () => {
  const { parent, child } = privateContinuationSnapshotQuestions();
  const validation = validateStrictTrainingContinuationSnapshotPair({
    parentQuestion: parent,
    childQuestion: child,
    persistedAnswerId: 'grouped_medium',
    difficultyMode: 'grouped',
    gameConfig: pioQueryService.getGameConfig('cash-002'),
  });
  assert.deepEqual(validation, {
    ok: true,
    parentSourceClassification: 'SOLVER_DERIVED_RESPONSE',
    childSourceClassification: 'SOLVER_DERIVED_RESPONSE',
    exactWarehouseLineage: true,
  });
});

function receiptPayload(receiptValue) {
  return JSON.parse(Buffer.from(receiptValue.split('.')[0], 'base64url').toString('utf8'));
}

function question(handOrdinal = 1, decisionOrdinal = 1, suffix = '') {
  const id = `question-${handOrdinal}-${decisionOrdinal}${suffix}`;
  const snapshotKey = `${String(handOrdinal).padStart(2, '0')}${String(decisionOrdinal).padStart(2, '0')}${'b'.repeat(60)}`;
  const submissionId = `training-attempt:${ATTEMPT}:hand:${handOrdinal}:decision:${decisionOrdinal}`;
  return {
    id,
    policyChecksum: SHA,
    prompt: 'Choose The Best Action',
    options: [
      { id: 'check', text: 'Check' },
      { id: 'b50', text: 'Bet 50%' },
    ],
    _gradingContext: {
      receipt: receipt({
        v: 2,
        jti: submissionId,
        attemptId: ATTEMPT,
        snapshotKey,
        questionId: id,
        sessionId: SESSION,
        sessionKind: 'campaign',
        sessionTargetHands: 20,
        handOrdinal,
        decisionOrdinal,
        countsTowardCompletion: decisionOrdinal === 1,
        practiceOnly: false,
        difficultyMode: 'grouped',
        iat: 1_800_000_000,
        exp: 1_800_003_600,
      }),
      submissionId,
      sessionId: SESSION,
      attemptId: ATTEMPT,
      snapshotKey,
      sessionKind: 'campaign',
      sessionTargetHands: 20,
      handOrdinal,
      decisionOrdinal,
      countsTowardCompletion: decisionOrdinal === 1,
      practiceOnly: false,
      difficultyMode: 'grouped',
    },
  };
}

function answer(questionValue, { replay = false, selectedAnswer = 'b50' } = {}) {
  const context = questionValue._gradingContext;
  return {
    success: true,
    idempotentReplay: replay,
    submissionId: context.submissionId,
    sessionId: context.sessionId,
    attemptId: context.attemptId,
    snapshotKey: context.snapshotKey,
    handOrdinal: context.handOrdinal,
    decisionOrdinal: context.decisionOrdinal,
    countsTowardCompletion: context.countsTowardCompletion,
    practiceOnly: context.practiceOnly,
    evidence: { isCorrect: true, classification: 'best' },
    feedback: {
      correctAnswer: selectedAnswer,
      explanation: 'Canonical explanation',
      continuation: { actionId: selectedAnswer, sourceAction: 'b412' },
    },
  };
}

function eventKey(handOrdinal, decisionOrdinal = 1, attemptId = ATTEMPT) {
  return `training-attempt:${attemptId}:hand:${handOrdinal}:decision:${decisionOrdinal}`;
}

function publicCloseoutEvidence(attemptId = ATTEMPT) {
  const sessionId = 'phase6-attestation-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const continuationCohortPrecommit = buildTrainingAttestationContinuationPrecommit({
    selectionRule: TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
    sessionId,
    gameId: 'cash-002',
    level: 8,
    targetHands: 20,
  });
  const parentCandidateAttempts = Array.from({ length: 20 }, (_, index) => ({
    attemptId,
    handOrdinal: index + 1,
    decisionOrdinal: 1,
    eventKey: eventKey(index + 1, 1, attemptId),
    submissionId: eventKey(index + 1, 1, attemptId),
    snapshotKey: `${(index + 1).toString(16).padStart(4, '0')}${'b'.repeat(60)}`,
    questionId: `question-${index + 1}`,
    policyChecksum: SHA,
    selectedAnswer: index === 0 ? 'grouped_medium' : 'check',
    continuationAction: index === 0 ? 'grouped_medium' : null,
    followedContinuationBranch: index === 0,
    responseLossRecovered: index === 0,
    exactReplay: true,
    receiptBytesIdentical: true,
    initialReceiptServerVerified: true,
    reissuedReceiptServerVerified: true,
    reissuedReceiptVerification: 'same_bytes_replayed_through_record_question',
    recordQuestionRequests: index === 0 ? 3 : 2,
  }));
  const continuation = {
    attemptId,
    handOrdinal: 1,
    decisionOrdinal: 2,
    eventKey: eventKey(1, 2, attemptId),
    submissionId: eventKey(1, 2, attemptId),
    parentEventKey: eventKey(1, 1, attemptId),
    snapshotKey: 'c'.repeat(64),
    questionId: 'question-1-2',
    policyChecksum: SHA,
    recoveredExistingContinuation: true,
    parentBindingVerifiedFromPublicReceipts: true,
    childPublicQuestionDigest: 'd'.repeat(64),
  };
  const immutableEvidence = (correlation, countsTowardCompletion) => ({
    submissionId: correlation.submissionId,
    sessionId: 'phase6-attestation-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    attemptId: correlation.attemptId,
    snapshotKey: correlation.snapshotKey,
    handOrdinal: correlation.handOrdinal,
    decisionOrdinal: correlation.decisionOrdinal,
    countsTowardCompletion,
    practiceOnly: false,
    evidence: { isCorrect: true, classification: 'best' },
    feedback: {
      correctAnswer: countsTowardCompletion ? correlation.selectedAnswer : 'check',
      explanation: 'Canonical explanation',
    },
  });
  const selectedParent = {
    ...parentCandidateAttempts[0],
    immutableEvidence: immutableEvidence(parentCandidateAttempts[0], true),
  };
  return {
    schemaVersion: 1,
    success: false,
    publicApiSuccess: true,
    releaseGateReady: false,
    status: 'public_api_verified_admin_correlation_pending',
    startedAt: STARTED_AT,
    apiCompletedAt: API_COMPLETED_AT,
    completedAt: COMPLETED_AT,
    expectedBuild: BUILD,
    auditUserId: AUDIT_USER,
    deployment: {
      commitSha: BUILD,
      version: BUILD,
      deploymentUrl: DEPLOYMENT_URL,
      deploymentId: DEPLOYMENT_ID,
    },
    writeScope: {
      acknowledged: true,
      auditUserId: AUDIT_USER,
      gameId: 'cash-002',
      level: 8,
      effects: [
        'training attempt creation',
        'served delivery events',
        'training answer inserts',
        'audit-account seen-question state',
        'cache accounting events',
      ],
    },
    publicApi: {
      authenticated: true,
      auditUserId: AUDIT_USER,
      authProbe: { status: 'passed', auditUserId: AUDIT_USER },
      initialAttempt: {
        gameId: 'cash-002',
        level: 8,
        requestedDifficultyTier: 'standard',
        difficultyMode: 'grouped',
        sessionId,
        attemptId,
        targetHands: 20,
        deliveredHands: 20,
        completeManifest: true,
        continuationCohortPrecommit,
      },
      parentCandidateAttempts,
      reissue: {
        manifestIdentityExact: true,
        recoveredExistingAttempt: true,
        receiptBytesIdentical: true,
        hands: parentCandidateAttempts.map((parent) => ({
          questionId: parent.questionId,
          handOrdinal: parent.handOrdinal,
          snapshotKey: parent.snapshotKey,
          submissionId: parent.submissionId,
          publicQuestionDigest: 'e'.repeat(64),
          receiptBytesIdentical: true,
        })),
      },
      responseLossRecovery: {
        simulatedAtApplicationBoundary: true,
        firstResponseBodyIntentionallyDiscarded: true,
        exactRetryReturnedIdempotentReplay: true,
      },
      receiptServerVerification: {
        initial: { expected: 20, verified: 20, allAccepted: true },
        reissued: { expected: 20, verified: 20, allAccepted: true },
        receiptBytesIdentical: 20,
        refreshedReceiptBytes: 0,
        recordQuestionRateLimit: {
          productionMaximum: 30,
          maxRequests: 28,
          windowMs: 60_000,
          requestsIssued: 45,
          totalWaitMs: 60_250,
        },
      },
      conflictingReplayRefusals: {
        changedAnswer: { status: 409, code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT' },
        changedSubmissionBinding: {
          status: 400,
          code: 'TRAINING_GRADING_RECEIPT_SUBMISSION_MISMATCH',
        },
      },
      parent: selectedParent,
      continuation,
      childAnswer: {
        selectedAnswer: 'check',
        immutableEvidence: immutableEvidence(continuation, false),
        exactReplay: true,
      },
      receiptFormatCensus: {
        observedReceipts: 42,
        counts: { attemptScopedServe: 42, predecessorUuidV4: 0, unknown: 0 },
        predecessorFormatObserved: false,
        predecessorStatus: 'not_observed',
        limitation: 'The deployed application did not fabricate a predecessor receipt.',
      },
    },
    errorSettle: {
      minimumMs: 15_000,
      windowStart: API_COMPLETED_AT,
      windowEnd: COMPLETED_AT,
      observedMs: 16_000,
      publicClientErrorCount: 0,
    },
    adminVerification: {
      status: 'pending',
      privateAttemptScopedServeAttestation: 'pending',
      negativeRefusalMatrix: 'pending',
      predecessorRollbackCompatibility: 'pending',
      productionErrorStreamReview: 'pending',
      instructionsDocument:
        '.agent/audits/2026-09-08-training-phase-6-production-delivery-attestation.md',
    },
  };
}

function administratorCloseoutEvidence(publicEvidence, publicEvidenceSha256 = 'b'.repeat(64)) {
  const servedEventKeys = publicEvidence.publicApi.parentCandidateAttempts
    .map(({ eventKey: key }) => key)
    .concat(publicEvidence.publicApi.continuation.eventKey);
  return {
    schemaVersion: 1,
    evidenceKind: 'phase6-delivery-authority-admin-closeout',
    publicEvidenceSha256,
    expectedBuild: publicEvidence.expectedBuild,
    auditUserId: publicEvidence.auditUserId,
    attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
    verifiedAt: VERIFIED_AT,
    deployment: {
      expectedBuild: publicEvidence.expectedBuild,
      deploymentUrl: publicEvidence.deployment.deploymentUrl,
      deploymentId: publicEvidence.deployment.deploymentId,
    },
    collector: {
      kind: 'phase6-production-admin-collector-v1',
      status: 'complete',
      generatedAt: VERIFIED_AT,
      queryMode: 'read_only_plus_explicit_rolled_back_probes',
      currentUser: 'phase6_auditor',
      currentDatabase: 'postgres',
      serverVersionNum: '170004',
      supabaseProjectRef: 'a'.repeat(20),
      publicEvidenceSha256,
      correlationReadOnlyVerified: true,
      correlationTransactionRolledBack: true,
      rollbackVerificationCount: 8,
    },
    correlation: {
      status: 'passed',
      attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
      auditUserId: publicEvidence.auditUserId,
      attemptRowBindingExact: true,
      attemptConfigHash: attestationAttemptConfigHash(publicEvidence),
      continuationPrecommitBoundInAttemptConfig: true,
      servedEventCount: 21,
      servedEventKeys,
      allServedFieldBindingsExact: true,
      answerCount: 21,
      answerSubmissionIds: [...servedEventKeys],
      allAnswerFieldBindingsExact: true,
      continuationParentEventKey: publicEvidence.publicApi.continuation.parentEventKey,
      continuationSlotBindingExact: true,
      continuationSnapshotLineageExact: true,
      continuationParentSourceClassification: 'SOLVER_EXACT',
      continuationChildSourceClassification: 'SOLVER_EXACT',
    },
    privateAttemptScopedServeAttestation: {
      status: 'passed',
      rowCount: 1,
      contractVersion: 'training-attempt-decision-authority-v1',
      evidenceKind: 'attempt_scoped_serve',
      evidenceEventKey: eventKey(1, 1, '22222222-2222-4222-8222-222222222222'),
      evidenceEventExists: true,
      evidenceOwnerPresent: true,
    },
    negativeRefusalMatrix: {
      status: 'passed',
      probeCount: 6,
      transactionRolledBack: true,
      probes: {
        answeredSlotPromotion: 'passed',
        changedAnswerReplay: 'passed',
        changedSlotBinding: 'passed',
        neverServedSnapshot: 'passed',
        nonV4PredecessorId: 'passed',
        nullOwnerLegacyEvent: 'passed',
      },
    },
    predecessorRollbackCompatibility: {
      status: 'passed',
      method: 'controlled_rollback_rehearsal',
      provenance: 'controlled_rehearsal_not_authentic',
      artifactSha256: null,
      trustedKeySha256: null,
      verifierSha256: 'f'.repeat(64),
      transactionRolledBack: true,
      initialWrite: 'passed',
      continuationWrite: 'passed',
    },
    productionErrorStreamReview: {
      status: 'passed',
      expectedBuild: publicEvidence.expectedBuild,
      deploymentId: publicEvidence.deployment.deploymentId,
      relevantErrorCount: 0,
      windowStart: publicEvidence.startedAt,
      windowEnd: publicEvidence.completedAt,
      settledWindowCovered: true,
      source: 'vercel_cli_runtime_logs',
      deploymentUrl: publicEvidence.deployment.deploymentUrl,
      queryComplete: true,
      levelsReviewed: ['error', 'fatal'],
    },
  };
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function stableJsonForTest(value) {
  if (Array.isArray(value)) return `[${value.map(stableJsonForTest).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJsonForTest(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function attestationAttemptConfigHash(publicEvidence) {
  return trainingAttemptConfigHash({
    gameMode: 'street',
    handSelection: 'all',
    targetStreet: 'flop',
    attestationContinuationCohort:
      publicEvidence.publicApi.initialAttempt.continuationCohortPrecommit,
    gameId: 'cash-002',
    level: 8,
    sessionKind: 'campaign',
    difficultyMode: 'grouped',
    targetHands: 20,
  });
}

function healthyDeploymentFetch({ deploymentId = DEPLOYMENT_ID, build = BUILD } = {}) {
  return async () => ({
    status: 200,
    async json() {
      return {
        status: 'ok',
        commitSha: build,
        version: build,
        deploymentUrl: new URL(DEPLOYMENT_URL).hostname,
        deploymentId,
        checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
      };
    },
  });
}

function fakeMachineDatabase(
  publicEvidence,
  {
    denyCorrelation = false,
    failRollback = false,
    auditUserId = publicEvidence.auditUserId,
    configHash = attestationAttemptConfigHash(publicEvidence),
    snapshotMutator = null,
  } = {}
) {
  const calls = [];
  let inTransaction = false;
  let deletedServedEvent = false;
  let rollbackCount = 0;
  const parents = publicEvidence.publicApi.parentCandidateAttempts;
  const continuation = publicEvidence.publicApi.continuation;
  const decisions = [...parents, continuation];
  const privateSnapshots = privateContinuationSnapshotQuestions();
  if (typeof snapshotMutator === 'function') snapshotMutator(privateSnapshots);
  const answerBySubmission = new Map(
    parents.map((parent) => [parent.submissionId, parent.selectedAnswer])
  );
  answerBySubmission.set(
    continuation.submissionId,
    publicEvidence.publicApi.childAnswer.selectedAnswer
  );
  return {
    calls,
    get rollbackCount() {
      return rollbackCount;
    },
    closed: false,
    async query(text, params = []) {
      calls.push({ text, params });
      if (/^BEGIN/.test(text)) {
        inTransaction = true;
        return { rows: [], rowCount: null };
      }
      if (text === 'ROLLBACK') {
        if (failRollback) throw new Error('simulated rollback transport failure');
        inTransaction = false;
        deletedServedEvent = false;
        rollbackCount += 1;
        return { rows: [], rowCount: null };
      }
      if (/^SET LOCAL/.test(text)) return { rows: [], rowCount: null };
      if (text.includes('phase6:rollback-state')) {
        return { rows: [{ transactionIdle: !inTransaction }], rowCount: 1 };
      }
      if (text.includes('phase6:transaction-mode')) {
        return {
          rows: [
            {
              transactionReadOnly: 'on',
              currentUser: 'phase6_auditor',
              currentDatabase: 'postgres',
              serverVersionNum: '170004',
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('phase6:attempt-correlation')) {
        if (denyCorrelation) {
          const error = new Error('permission denied for relation training_attempts');
          error.code = '42501';
          throw error;
        }
        return {
          rows: [
            {
              attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
              auditUserId,
              sessionId: publicEvidence.publicApi.initialAttempt.sessionId,
              gameId: 'cash-002',
              level: 8,
              sessionKind: 'campaign',
              difficulty: 'grouped',
              expectedHands: 20,
              configHash,
              practiceOnly: false,
              status: 'open',
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('phase6:served-correlation')) {
        const rows = decisions
          .map((decision) => ({
            eventKey: decision.eventKey,
            questionId: decision.questionId,
            auditUserId,
            policyChecksum: decision.policyChecksum,
            attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
            handOrdinal: decision.handOrdinal,
            decisionOrdinal: decision.decisionOrdinal,
            snapshotKey: decision.snapshotKey,
            difficultyMode: 'grouped',
            rngRolls: { low: 17, high: 83 },
          }))
          .sort((left, right) => left.eventKey.localeCompare(right.eventKey));
        return { rows, rowCount: rows.length };
      }
      if (text.includes('phase6:answer-correlation')) {
        const rows = decisions
          .map((decision) => ({
            submissionId: decision.submissionId,
            auditUserId,
            attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
            sessionId: publicEvidence.publicApi.initialAttempt.sessionId,
            handOrdinal: decision.handOrdinal,
            decisionOrdinal: decision.decisionOrdinal,
            snapshotKey: decision.snapshotKey,
            questionId: decision.questionId,
            answerId: answerBySubmission.get(decision.submissionId),
            isCorrect: true,
            policyChecksum: decision.policyChecksum,
          }))
          .sort((left, right) => left.submissionId.localeCompare(right.submissionId));
        return { rows, rowCount: rows.length };
      }
      if (text.includes('phase6:continuation-slot-correlation')) {
        return {
          rows: [
            {
              attemptId: publicEvidence.publicApi.initialAttempt.attemptId,
              handOrdinal: continuation.handOrdinal,
              decisionOrdinal: continuation.decisionOrdinal,
              snapshotKey: continuation.snapshotKey,
              parentSnapshotKey: parents[0].snapshotKey,
              parentSubmissionId: continuation.parentEventKey,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('phase6:continuation-snapshot-correlation')) {
        return {
          rows: [
            {
              snapshotKey: parents[0].snapshotKey,
              questionId: parents[0].questionId,
              gameId: 'cash-002',
              level: 8,
              questionData: privateSnapshots.parent,
            },
            {
              snapshotKey: continuation.snapshotKey,
              questionId: continuation.questionId,
              gameId: 'cash-002',
              level: 8,
              questionData: privateSnapshots.child,
            },
          ],
          rowCount: 2,
        };
      }
      if (text.includes('phase6:private-attestation-correlation')) {
        return {
          rows: [
            {
              contractVersion: 'training-attempt-decision-authority-v1',
              evidenceKind: 'attempt_scoped_serve',
              evidenceEventKey: eventKey(1, 1, '22222222-2222-4222-8222-222222222222'),
              evidenceEventExists: true,
              evidenceOwnerPresent: true,
            },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('phase6:probe:answeredSlotPromotion')) {
        const error = new Error('TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED');
        error.code = '23514';
        throw error;
      }
      if (text.includes('phase6:probe:changedAnswerReplay')) {
        const error = new Error('TRAINING_ATTEMPT_ANSWER_IMMUTABLE');
        error.code = '23514';
        throw error;
      }
      if (text.includes('phase6:probe:changedSlotBinding')) {
        const error = new Error('TRAINING_CONTINUATION_SLOT_IMMUTABLE');
        error.code = '23514';
        throw error;
      }
      if (text.includes('phase6:probe:neverServedSnapshot:setup')) {
        deletedServedEvent = true;
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('phase6:probe:neverServedSnapshot')) {
        return {
          rows: [
            {
              result: {
                authorized: false,
                code: deletedServedEvent ? 'TRAINING_DECISION_NOT_SERVED' : 'WRONG',
              },
            },
          ],
          rowCount: 1,
        };
      }
      if (
        text.includes('phase6:probe:nonV4PredecessorId') ||
        text.includes('phase6:probe:nullOwnerLegacyEvent')
      ) {
        return {
          rows: [
            { result: { authorized: false, code: 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID' } },
          ],
          rowCount: 1,
        };
      }
      if (text.includes('phase6:probe-postcheck:changedAnswerReplay')) {
        return { rows: [{ answerId: parents[0].selectedAnswer }], rowCount: 1 };
      }
      if (text.includes('phase6:probe-postcheck:changedSlotBinding')) {
        return { rows: [{ snapshotKey: continuation.snapshotKey }], rowCount: 1 };
      }
      if (text.includes('phase6:probe-postcheck:neverServedSnapshot')) {
        return { rows: [{ count: deletedServedEvent ? 0 : 1 }], rowCount: 1 };
      }
      throw new Error(`unexpected fake database query: ${text}`);
    },
    async close() {
      this.closed = true;
    },
  };
}

function passingPredecessorTransport() {
  return {
    async collect() {
      return {
        status: 'passed',
        method: 'controlled_rollback_rehearsal',
        provenance: 'controlled_rehearsal_not_authentic',
        artifactSha256: null,
        trustedKeySha256: null,
        verifierSha256: 'f'.repeat(64),
        transactionRolledBack: true,
        initialWrite: 'passed',
        continuationWrite: 'passed',
      };
    },
  };
}

function passingLogTransport(publicEvidence, overrides = {}) {
  return {
    async collect() {
      return {
        source: 'vercel_cli_runtime_logs',
        deploymentId: publicEvidence.deployment.deploymentId,
        deploymentUrl: publicEvidence.deployment.deploymentUrl,
        expectedBuild: publicEvidence.expectedBuild,
        windowStart: publicEvidence.startedAt,
        windowEnd: publicEvidence.completedAt,
        levelsReviewed: ['error', 'fatal'],
        queryComplete: true,
        relevantErrorCount: 0,
        ...overrides,
      };
    },
  };
}

function machineCoreConfig(publicPath) {
  return {
    publicEvidencePath: publicPath,
    expectedAuditUserId: AUDIT_USER,
    expectedSupabaseProjectRef: 'a'.repeat(20),
    acknowledgement: ADMIN_ACKNOWLEDGEMENT,
    predecessor: { mode: 'controlled_rehearsal', rehearsalAcknowledged: true },
  };
}

test('immutable deployment guard rejects mutable domains and requires an exact URL origin', () => {
  const deploymentUrl = 'https://hub-vanguard-abc123-smarter-poker.vercel.app';
  assert.equal(validateImmutableDeploymentUrl(deploymentUrl), deploymentUrl);
  assert.throws(
    () => validateImmutableDeploymentUrl('https://smarter.poker'),
    /owned by Smarter\.Poker/
  );
  assert.throws(
    () => validateImmutableDeploymentUrl('https://example.vercel.app'),
    /owned by Smarter\.Poker/
  );
  assert.throws(
    () => validateImmutableDeploymentUrl('https://hub-vanguard.vercel.app'),
    /owned by Smarter\.Poker/
  );
  assert.throws(() => validateImmutableDeploymentUrl('http://example.vercel.app'), /HTTPS/);
  assert.throws(
    () => validateImmutableDeploymentUrl(`${deploymentUrl}/path`),
    /must not include a path/
  );
});

test('auth transfer is scoped to the trusted production origin and exact immutable target', () => {
  const session = JSON.stringify({
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
  });
  const state = {
    cookies: [{ name: 'unrelated', value: 'do-not-copy' }],
    origins: [
      {
        origin: 'https://attacker.example',
        localStorage: [{ name: 'smarter-poker-auth', value: 'attacker-value' }],
      },
      {
        origin: 'http://127.0.0.1:3046',
        localStorage: [{ name: 'smarter-poker-auth', value: session }],
      },
    ],
  };
  assert.deepEqual(
    originScopedAuthState(state, 'https://hub-vanguard-abc123-smarter-poker.vercel.app'),
    {
      cookies: [],
      origins: [
        {
          origin: 'https://hub-vanguard-abc123-smarter-poker.vercel.app',
          localStorage: [{ name: 'smarter-poker-auth', value: session }],
        },
      ],
    }
  );
  assert.throws(
    () =>
      originScopedAuthState(
        { origins: state.origins.slice(0, 1) },
        'https://hub-vanguard-abc123-smarter-poker.vercel.app'
      ),
    /exactly one trusted smarter-poker-auth/
  );
});

test('saved auth must contain the explicitly designated audit-account subject before server verification and writes', () => {
  const jwt = (subject) =>
    [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: subject, exp: 1_900_000_000 })).toString('base64url'),
      'signature-not-verified-locally',
    ].join('.');
  const state = {
    origins: [
      {
        origin: 'https://smarter.poker',
        localStorage: [
          {
            name: 'smarter-poker-auth',
            value: JSON.stringify({
              access_token: jwt(AUDIT_USER),
              refresh_token: 'opaque-refresh-value',
              user: { id: AUDIT_USER },
            }),
          },
        ],
      },
    ],
  };
  const validated = validateDesignatedAuditAuthState(state, DEPLOYMENT_URL, AUDIT_USER);
  assert.equal(validated.auditUserId, AUDIT_USER);
  assert.equal(JSON.stringify(validated).includes('opaque-refresh-value'), true);
  assert.throws(
    () => validateDesignatedAuditAuthState(state, DEPLOYMENT_URL, ATTEMPT),
    /token subject does not match the designated audit account/
  );
  const wrongSessionUser = structuredClone(state);
  const stored = JSON.parse(wrongSessionUser.origins[0].localStorage[0].value);
  stored.user.id = ATTEMPT;
  wrongSessionUser.origins[0].localStorage[0].value = JSON.stringify(stored);
  assert.throws(
    () => validateDesignatedAuditAuthState(wrongSessionUser, DEPLOYMENT_URL, AUDIT_USER),
    /auth session user does not match the designated audit account/
  );
});

test('deployment identity core uses its fetch transport and requires exact origin, build, health, and deployment id', async () => {
  const calls = [];
  const healthy = {
    status: 200,
    async json() {
      return {
        status: 'ok',
        commitSha: BUILD,
        version: BUILD,
        deploymentUrl: new URL(DEPLOYMENT_URL).hostname,
        deploymentId: DEPLOYMENT_ID,
        checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
      };
    },
  };
  const fetchFn = async (...args) => {
    calls.push(args);
    return healthy;
  };
  assert.deepEqual(
    await readDeploymentIdentity(DEPLOYMENT_URL, BUILD, { fetchFn, now: () => 123 }),
    { commitSha: BUILD, version: BUILD, deploymentUrl: DEPLOYMENT_URL, deploymentId: DEPLOYMENT_ID }
  );
  assert.match(calls[0][0], /phase6Delivery=123/);
  const noId = {
    ...healthy,
    async json() {
      return { ...(await healthy.json()), deploymentId: null };
    },
  };
  await assert.rejects(
    () => readDeploymentIdentity(DEPLOYMENT_URL, BUILD, { fetchFn: async () => noId }),
    /deploymentId/
  );
});

test('optional Vercel protection bypass is exact-origin only and absent by default', async () => {
  const secret = 'phase6-test-bypass-secret';
  assert.deepEqual(protectionBypassHeaders(DEPLOYMENT_URL, DEPLOYMENT_URL, ''), {});
  assert.deepEqual(protectionBypassHeaders(DEPLOYMENT_URL, DEPLOYMENT_URL, secret), {
    'x-vercel-protection-bypass': secret,
  });
  assert.deepEqual(protectionBypassHeaders(DEPLOYMENT_URL, 'https://smarter.poker', secret), {});

  const calls = [];
  const healthy = {
    status: 200,
    async json() {
      return {
        status: 'ok',
        commitSha: BUILD,
        version: BUILD,
        deploymentUrl: new URL(DEPLOYMENT_URL).hostname,
        deploymentId: DEPLOYMENT_ID,
        checks: { db: { status: 'ok' }, trainingGradingReceipt: { status: 'ok' } },
      };
    },
  };
  await readDeploymentIdentity(DEPLOYMENT_URL, BUILD, {
    fetchFn: async (...args) => {
      calls.push(args);
      return healthy;
    },
    protectionBypassSecret: secret,
    now: () => 456,
  });
  assert.equal(calls[0][1].headers['x-vercel-protection-bypass'], secret);
  assert.equal(String(calls[0][0]).startsWith(DEPLOYMENT_URL), true);
});

test('protected browser routing never forwards the bypass header through a cross-origin redirect', async (t) => {
  const secret = 'phase6-test-bypass-secret';
  const targetHeaders = [];
  const sourceHeaders = [];
  const listen = (server) =>
    new Promise((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolveListen(`http://127.0.0.1:${address.port}`);
      });
    });
  const close = (server) =>
    new Promise((resolveClose, rejectClose) => {
      server.close((error) => (error ? rejectClose(error) : resolveClose()));
    });

  const targetServer = createServer((request, response) => {
    targetHeaders.push(request.headers['x-vercel-protection-bypass'] || null);
    response.writeHead(204);
    response.end();
  });
  const targetOrigin = await listen(targetServer);
  const sourceServer = createServer((request, response) => {
    sourceHeaders.push(request.headers['x-vercel-protection-bypass'] || null);
    response.writeHead(302, { location: `${targetOrigin}/redirect-target` });
    response.end();
  });
  const sourceOrigin = await listen(sourceServer);
  t.after(async () => {
    await Promise.all([close(sourceServer), close(targetServer)]);
  });

  let continued = 0;
  let fulfilledResponse = null;
  const fetchOptions = [];
  const protectedRoute = {
    request() {
      return {
        url: () => `${DEPLOYMENT_URL}/hub/training`,
        headers: () => ({ accept: 'text/html' }),
      };
    },
    async continue() {
      continued += 1;
    },
    async fetch(options) {
      fetchOptions.push(options);
      return fetch(`${sourceOrigin}/protected`, {
        headers: options.headers,
        redirect: options.maxRedirects === 0 ? 'manual' : 'follow',
      });
    },
    async fulfill({ response }) {
      fulfilledResponse = response;
    },
  };

  await continueRouteWithProtectionBypass(protectedRoute, DEPLOYMENT_URL, secret);
  assert.equal(continued, 0);
  assert.equal(fetchOptions.length, 1);
  assert.equal(fetchOptions[0].maxRedirects, 0);
  assert.equal(fetchOptions[0].headers['x-vercel-protection-bypass'], secret);
  assert.equal(sourceHeaders[0], secret);
  assert.equal(fulfilledResponse.status, 302);

  // Fulfillment gives the redirect back to the browser. Its next request is a
  // clean, newly intercepted request, not a continuation of the privileged
  // route.fetch transport.
  await fetch(fulfilledResponse.headers.get('location'));
  assert.deepEqual(targetHeaders, [null]);

  const passthroughCalls = [];
  const passthroughRoute = (requestUrl) => ({
    request: () => ({ url: () => requestUrl, headers: () => ({}) }),
    continue: async () => passthroughCalls.push(requestUrl),
    fetch: async () => assert.fail('passthrough routes must not use the privileged fetch'),
    fulfill: async () => assert.fail('passthrough routes must not be fulfilled'),
  });
  await continueRouteWithProtectionBypass(
    passthroughRoute('https://smarter.poker/hub/training'),
    DEPLOYMENT_URL,
    secret
  );
  await continueRouteWithProtectionBypass(
    passthroughRoute(`${DEPLOYMENT_URL}/hub/training`),
    DEPLOYMENT_URL,
    ''
  );
  assert.deepEqual(passthroughCalls, [
    'https://smarter.poker/hub/training',
    `${DEPLOYMENT_URL}/hub/training`,
  ]);
});

test('public evidence output lease is exclusive, mode 0600, and refuses existing output', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-delivery-run-lock-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'unique-public.json');
  const lease = acquireEvidenceRunLock(output);
  assert.equal((await stat(lease.lockPath)).mode & 0o777, 0o600);
  assert.throws(() => acquireEvidenceRunLock(output), /EEXIST/);
  lease.release();
  await writeFile(output, '{}\n');
  assert.throws(() => acquireEvidenceRunLock(output), /Refusing to overwrite existing evidence/);
});

test('programmatic invocation cannot bypass the exact build, origin, auth-state, or write acknowledgement', () => {
  const candidate = {
    baseUrl: 'https://hub-vanguard-abc123-smarter-poker.vercel.app',
    expectedBuild: 'a'.repeat(40),
    expectedAuditUserId: AUDIT_USER,
    authState: '/dev/null',
    output: '/tmp/phase6-test-evidence.json',
  };
  assert.throws(() => validateAttestationConfig(candidate), /Refusing production writes/);
  assert.doesNotThrow(() =>
    validateAttestationConfig({
      ...candidate,
      writeAcknowledgement: 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS',
    })
  );
  assert.throws(
    () =>
      validateAttestationConfig({
        ...candidate,
        output: '',
        writeAcknowledgement: 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS',
      }),
    /explicit unique output path/
  );
  assert.throws(
    () =>
      validateAttestationConfig({
        ...candidate,
        expectedAuditUserId: '',
        writeAcknowledgement: 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS',
      }),
    /designated audit account/
  );
});

test('full attempt validation requires every signed, unique, attempt-scoped slot', () => {
  const questions = Array.from({ length: 20 }, (_, index) => question(index + 1));
  const payload = {
    success: true,
    gameId: 'cash-002',
    level: 8,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    sessionKind: 'campaign',
    targetHands: 20,
    count: 20,
    questions,
  };
  const result = validateFullAttemptDelivery(payload, { sessionId: SESSION });
  assert.equal(result.observations.length, 20);
  assert.deepEqual(result.questionIds.slice(0, 2), ['question-1-1', 'question-2-1']);
  assert.throws(
    () => validateFullAttemptDelivery({ ...payload, count: 1 }, { sessionId: SESSION }),
    /count did not equal targetHands/
  );
  assert.throws(
    () =>
      validateFullAttemptDelivery(
        {
          ...payload,
          questions: [questions[0], questions[0], ...questions.slice(2)],
        },
        { sessionId: SESSION }
      ),
    /hand ordinal mismatch|duplicate/
  );

  const mismatchedBindings = [
    {
      label: 'attempt',
      jti: 'training-attempt:22222222-2222-4222-8222-222222222222:hand:1:decision:1',
      error: /embeds a different attempt/,
    },
    {
      label: 'hand',
      jti: `training-attempt:${ATTEMPT}:hand:2:decision:1`,
      error: /embeds a different hand/,
    },
    {
      label: 'decision',
      jti: `training-attempt:${ATTEMPT}:hand:1:decision:2`,
      error: /embeds a different decision/,
    },
  ];
  for (const { label, jti, error } of mismatchedBindings) {
    const tamperedQuestions = structuredClone(questions);
    const claims = receiptPayload(tamperedQuestions[0]._gradingContext.receipt);
    tamperedQuestions[0]._gradingContext.submissionId = jti;
    tamperedQuestions[0]._gradingContext.receipt = receipt({ ...claims, jti });
    assert.throws(
      () =>
        validateFullAttemptDelivery(
          { ...payload, questions: tamperedQuestions },
          { sessionId: SESSION }
        ),
      error,
      `${label} embedded in the jti must be bound to the signed receipt claims`
    );
  }

  assert.throws(
    () =>
      validateFullAttemptDelivery(
        {
          ...payload,
          attemptId: '11111111-1111-1111-1111-111111111111',
        },
        { sessionId: SESSION }
      ),
    /canonical UUID v4 attempt id/
  );

  const wrongDifficulty = structuredClone(payload);
  wrongDifficulty.questions[0]._gradingContext.difficultyMode = 'easy';
  const wrongDifficultyClaims = receiptPayload(
    wrongDifficulty.questions[0]._gradingContext.receipt
  );
  wrongDifficulty.questions[0]._gradingContext.receipt = receipt({
    ...wrongDifficultyClaims,
    difficultyMode: 'easy',
  });
  assert.throws(
    () => validateFullAttemptDelivery(wrongDifficulty, { sessionId: SESSION }),
    /wrong difficulty mode/
  );
});

test('every public delivery surface rejects hidden selection fields while post-answer feedback stays explicit', () => {
  const questions = Array.from({ length: 20 }, (_, index) => question(index + 1));
  const batch = {
    success: true,
    gameId: 'cash-002',
    level: 8,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    sessionKind: 'campaign',
    targetHands: 20,
    count: 20,
    questions,
  };
  const leakyBatch = structuredClone(batch);
  leakyBatch.questions[0].scenario = { correctAnswer: 'b50' };
  assert.throws(
    () => validateFullAttemptDelivery(leakyBatch, { sessionId: SESSION }),
    /initial batch response leaked a private selection field/,
  );

  const reissue = {
    success: true,
    recoveredExistingAttempt: true,
    attemptId: ATTEMPT,
    sessionId: SESSION,
    targetHands: 20,
    count: 20,
    questions: structuredClone(questions),
  };
  reissue.questions[0].options[0].isOptimal = true;
  assert.throws(
    () => compareReissuedManifest(batch, reissue),
    /reissue response leaked a private selection field/,
  );

  const recorded = answer(questions[0]);
  assert.doesNotThrow(() => assertRevealedAnswerPayloadContainsOnlyIntendedFields(recorded));
  const leakyRecorded = structuredClone(recorded);
  leakyRecorded.feedback.evData = { answerKey: 'b50' };
  assert.throws(
    () => assertRevealedAnswerPayloadContainsOnlyIntendedFields(leakyRecorded),
    /leaked a raw private selection field/,
  );

  const child = question(1, 2, '-child');
  const first = {
    success: true,
    question: child,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    handOrdinal: 1,
    decisionOrdinal: 2,
  };
  const replay = { ...structuredClone(first), recoveredExistingContinuation: true };
  const parentAnswer = { ...answer(questions[0]), selectedAnswer: 'b50' };
  const leakyNextStreet = structuredClone(first);
  leakyNextStreet.question._difficultyMembers = { grouped_medium: ['b50'] };
  assert.throws(
    () => validateContinuation(questions[0], parentAnswer, leakyNextStreet, replay),
    /next-street response leaked a private selection field/,
  );
});

test('receipt observation rejects an absent or malformed signature segment', () => {
  const payloadSegment = question(1)._gradingContext.receipt.split('.')[0];
  assert.throws(
    () => decodeReceiptObservation(`${payloadSegment}.`),
    /signature has the wrong shape/
  );
  assert.throws(
    () => decodeReceiptObservation(`${payloadSegment}.short`),
    /signature has the wrong shape/
  );
  const shapedButInvalidSignature = decodeReceiptObservation(`${payloadSegment}.${'b'.repeat(43)}`);
  assert.equal(shapedButInvalidSignature.signatureVerifiedByHarness, false);
});

test('receipt observation requires canonical UUID v4 attempt ids and exact jti ordinals', () => {
  const claims = receiptPayload(question(1)._gradingContext.receipt);
  assert.throws(
    () =>
      decodeReceiptObservation(
        receipt({
          ...claims,
          attemptId: '11111111-1111-1111-1111-111111111111',
          jti: 'training-attempt:11111111-1111-1111-1111-111111111111:hand:1:decision:1',
        })
      ),
    /canonical UUID v4 and ordinal format|canonical UUID v4 attempt/
  );
  assert.throws(
    () =>
      decodeReceiptObservation(
        receipt({
          ...claims,
          jti: `training-attempt:${ATTEMPT}:hand:01:decision:001`,
        })
      ),
    /canonical UUID v4 and ordinal format/
  );
  assert.throws(
    () =>
      decodeReceiptObservation(
        receipt({
          ...claims,
          handOrdinal: '01',
          decisionOrdinal: '001',
          jti: `training-attempt:${ATTEMPT}:hand:1:decision:1`,
        })
      ),
    /positive safe integer/
  );
});

test('reissue comparison preserves manifest, public question, attempt, slot, and submission identity', () => {
  const questions = Array.from({ length: 20 }, (_, index) => question(index + 1));
  const initial = { attemptId: ATTEMPT, sessionId: SESSION, targetHands: 20, questions };
  const reissued = {
    success: true,
    recoveredExistingAttempt: true,
    attemptId: ATTEMPT,
    sessionId: SESSION,
    targetHands: 20,
    count: 20,
    questions: structuredClone(questions),
  };
  assert.equal(compareReissuedManifest(initial, reissued).length, 20);
  reissued.questions[1].prompt = 'Changed';
  assert.throws(() => compareReissuedManifest(initial, reissued), /changed public question/);
  reissued.questions = structuredClone(questions);
  const tamperedReceipt = decodeReceiptObservation(reissued.questions[1]._gradingContext.receipt);
  reissued.questions[1]._gradingContext.receipt = receipt({
    v: tamperedReceipt.version,
    jti: tamperedReceipt.jti,
    attemptId: tamperedReceipt.attemptId,
    snapshotKey: tamperedReceipt.snapshotKey,
    questionId: tamperedReceipt.questionId,
    sessionId: 'different-session',
    sessionKind: tamperedReceipt.sessionKind,
    sessionTargetHands: tamperedReceipt.sessionTargetHands,
    handOrdinal: tamperedReceipt.handOrdinal,
    decisionOrdinal: tamperedReceipt.decisionOrdinal,
    countsTowardCompletion: tamperedReceipt.countsTowardCompletion,
    practiceOnly: tamperedReceipt.practiceOnly,
    difficultyMode: tamperedReceipt.difficultyMode,
  });
  assert.throws(() => compareReissuedManifest(initial, reissued), /session mismatch/);

  reissued.questions = structuredClone(questions);
  reissued.questions[1]._gradingContext.receipt =
    reissued.questions[1]._gradingContext.receipt.replace(
      /\.[A-Za-z0-9_-]{43}$/,
      `.${'b'.repeat(43)}`
    );
  const comparison = compareReissuedManifest(initial, reissued);
  assert.equal(comparison[1].receiptBytesIdentical, false);
});

test('answer request only accepts a public option and carries the complete signed binding', () => {
  const value = question(1);
  const body = buildAnswerRequest(value, 'b50');
  assert.equal(body.attemptId, ATTEMPT);
  assert.equal(body.submissionId, value._gradingContext.submissionId);
  assert.equal(body.snapshotKey, value._gradingContext.snapshotKey);
  assert.throws(() => buildAnswerRequest(value, 'all-in'), /not a public option/);
});

test('exact answer replay must preserve all immutable grading evidence', () => {
  const value = question(1);
  const first = answer(value);
  const replay = { ...structuredClone(first), idempotentReplay: true };
  assert.doesNotThrow(() => assertExactReplay(first, replay));
  replay.evidence.classification = 'wrong';
  assert.throws(() => assertExactReplay(first, replay), /changed immutable evidence/);
  const omitted = structuredClone(first);
  const omittedReplay = { ...structuredClone(first), idempotentReplay: true };
  delete omitted.attemptId;
  delete omittedReplay.attemptId;
  assert.throws(
    () => assertExactReplay(omitted, omittedReplay),
    /omitted canonical UUID v4 attemptId/
  );
  assert.doesNotThrow(() => validateAnswerBinding(first, value));
});

test('continuation binds one child decision to its parent and replays that exact child', () => {
  const parent = question(1);
  const child = question(1, 2, '-child');
  const first = {
    success: true,
    question: child,
    sessionId: SESSION,
    attemptId: ATTEMPT,
    handOrdinal: 1,
    decisionOrdinal: 2,
  };
  const replay = { ...structuredClone(first), recoveredExistingContinuation: true };
  const parentAnswer = { ...answer(parent), selectedAnswer: 'b50' };
  assert.equal(validateContinuation(parent, parentAnswer, first, replay), child);
  replay.question._gradingContext.snapshotKey = `ff${'b'.repeat(62)}`;
  assert.throws(
    () => validateContinuation(parent, parentAnswer, first, replay),
    /changed snapshotKey/
  );
  replay.question._gradingContext.snapshotKey = child._gradingContext.snapshotKey;
  replay.question._gradingContext.attemptId = '22222222-2222-4222-8222-222222222222';
  assert.throws(
    () => validateContinuation(parent, parentAnswer, first, replay),
    /changed attemptId/
  );
  replay.question._gradingContext.attemptId = child._gradingContext.attemptId;
  const changedReceiptReplay = structuredClone(replay);
  changedReceiptReplay.question._gradingContext.receipt =
    changedReceiptReplay.question._gradingContext.receipt.replace(
      /\.[A-Za-z0-9_-]{43}$/,
      `.${'b'.repeat(43)}`
    );
  assert.throws(
    () => validateContinuation(parent, parentAnswer, first, changedReceiptReplay),
    /changed receipt bytes/
  );
  const originalReceipt = child._gradingContext.receipt;
  const changedReceipt = changedReceiptReplay.question._gradingContext.receipt;
  let receiptMismatch;
  try {
    validateContinuation(parent, parentAnswer, first, changedReceiptReplay);
  } catch (error) {
    receiptMismatch = error;
  }
  assert.ok(receiptMismatch, 'changed receipt must fail');
  assert.equal(String(receiptMismatch?.message).includes(originalReceipt), false);
  assert.equal(String(receiptMismatch?.message).includes(changedReceipt), false);
  assert.equal(String(receiptMismatch?.stack).includes(originalReceipt), false);
  assert.equal(String(receiptMismatch?.stack).includes(changedReceipt), false);
  const tamperedChild = structuredClone(child);
  const childReceipt = decodeReceiptObservation(tamperedChild._gradingContext.receipt);
  tamperedChild._gradingContext.receipt = receipt({
    v: childReceipt.version,
    jti: childReceipt.jti,
    attemptId: childReceipt.attemptId,
    snapshotKey: childReceipt.snapshotKey,
    questionId: childReceipt.questionId,
    sessionId: childReceipt.sessionId,
    sessionKind: childReceipt.sessionKind,
    sessionTargetHands: childReceipt.sessionTargetHands,
    handOrdinal: childReceipt.handOrdinal,
    decisionOrdinal: childReceipt.decisionOrdinal,
    countsTowardCompletion: true,
    practiceOnly: childReceipt.practiceOnly,
    difficultyMode: childReceipt.difficultyMode,
  });
  assert.throws(
    () => validateContinuation(parent, parentAnswer, { ...first, question: tamperedChild }, replay),
    /completion binding mismatch/
  );
});

test('receipt redaction prevents secret-bearing bytes from reaching persisted or stderr text', () => {
  const first = receipt({ sentinel: 'first-secret-receipt' });
  const second = receipt({ sentinel: 'second-secret-receipt' });
  const unsafe = `Assertion failed: actual ${first}; expected ${second}`;
  const safe = redactReceiptMaterial(unsafe);
  assert.equal(safe.includes(first), false);
  assert.equal(safe.includes(second), false);
  assert.equal((safe.match(/\[REDACTED_GRADING_RECEIPT\]/g) || []).length, 2);
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdWRpdC11c2VyIn0.signaturebyteslongenough';
  const connection = 'postgresql://auditor:never-print-this@db.example.invalid/postgres';
  const additional = redactReceiptMaterial(
    `${jwt} ${connection} sb_secret_examplecredentialmaterial12345`
  );
  assert.equal(additional.includes(jwt), false);
  assert.equal(additional.includes('never-print-this'), false);
  assert.equal(additional.includes('examplecredentialmaterial12345'), false);
});

test('receipt census reports predecessor reality but never turns absence into success', () => {
  const current = decodeReceiptObservation(question(1)._gradingContext.receipt);
  const census = receiptFormatCensus([current]);
  assert.equal(census.predecessorFormatObserved, false);
  assert.equal(census.predecessorStatus, 'not_observed');
  assert.match(census.limitation, /did not fabricate/);
});

test('record-question pacing stays below a conservative sliding-window write budget', async () => {
  let currentTime = 0;
  const waits = [];
  const pacer = createSlidingWindowRequestPacer({
    maxRequests: 2,
    windowMs: 100,
    safetyMs: 5,
    now: () => currentTime,
    sleep: async (delayMs) => {
      waits.push(delayMs);
      currentTime += delayMs;
    },
  });
  await pacer.waitForSlot();
  await pacer.waitForSlot();
  await pacer.waitForSlot();
  assert.deepEqual(waits, [105]);
  assert.deepEqual(pacer.snapshot(), {
    maxRequests: 2,
    windowMs: 100,
    requestsIssued: 3,
    totalWaitMs: 105,
  });
});

test('complete public evidence passes every public gate but hand-authored administrator JSON cannot finalize', () => {
  const publicEvidence = publicCloseoutEvidence();
  const adminEvidence = administratorCloseoutEvidence(publicEvidence);
  assert.equal(validateCompletePublicAttestation(publicEvidence).expectedEventKeys.length, 21);
  assert.throws(
    () => validateAdministratorCloseout(publicEvidence, adminEvidence, 'b'.repeat(64)),
    /MACHINE_ADMIN_COLLECTOR_REQUIRED/
  );
});

test('complete public validation rejects omitted or weakened health, auth, reissue, receipt, replay, census, continuation, and settle gates', () => {
  const cases = [
    [
      'deployment id',
      /deployment ID/,
      (value) => {
        value.deployment.deploymentId = null;
      },
    ],
    [
      'deployment build',
      /deployment commit mismatch/,
      (value) => {
        value.deployment.commitSha = 'f'.repeat(40);
      },
    ],
    [
      'audit account',
      /auth probe account mismatch/,
      (value) => {
        value.publicApi.authProbe.auditUserId = ATTEMPT;
      },
    ],
    [
      'write effects',
      /write-scope effects/,
      (value) => {
        value.writeScope.effects.pop();
      },
    ],
    [
      'reissue manifest',
      /reissue manifest identity/,
      (value) => {
        value.publicApi.reissue.manifestIdentityExact = false;
      },
    ],
    [
      'reissued server verification',
      /reissued receipt was not server verified/,
      (value) => {
        value.publicApi.parentCandidateAttempts[4].reissuedReceiptServerVerified = false;
      },
    ],
    [
      'all receipt count',
      /reissued receipt verified count/,
      (value) => {
        value.publicApi.receiptServerVerification.reissued.verified = 19;
      },
    ],
    [
      'response-loss replay',
      /response-loss recovery/,
      (value) => {
        value.publicApi.responseLossRecovery.exactRetryReturnedIdempotentReplay = false;
      },
    ],
    [
      'conflict refusal',
      /replay-conflict refusal/,
      (value) => {
        value.publicApi.conflictingReplayRefusals.changedAnswer.status = 200;
      },
    ],
    [
      'selected parent binding',
      /selected parent changed snapshotKey/,
      (value) => {
        value.publicApi.parent.snapshotKey = 'f'.repeat(64);
        value.publicApi.parent.immutableEvidence.snapshotKey = 'f'.repeat(64);
      },
    ],
    [
      'child replay',
      /child answer exact replay/,
      (value) => {
        value.publicApi.childAnswer.exactReplay = false;
      },
    ],
    [
      'unknown receipt',
      /receipt census is invalid/,
      (value) => {
        value.publicApi.receiptFormatCensus.counts.unknown = 1;
        value.publicApi.receiptFormatCensus.counts.attemptScopedServe = 41;
      },
    ],
    [
      'settling window',
      /error-settle window was too short/,
      (value) => {
        value.completedAt = '2026-09-08T12:03:58.999Z';
        value.errorSettle.windowEnd = value.completedAt;
        value.errorSettle.observedMs = 14_999;
      },
    ],
    [
      'client errors',
      /client error review found errors/,
      (value) => {
        value.errorSettle.publicClientErrorCount = 1;
      },
    ],
  ];
  for (const [label, error, mutate] of cases) {
    const value = publicCloseoutEvidence();
    mutate(value);
    assert.throws(() => validateCompletePublicAttestation(value), error, label);
  }
});

test('administrator closeout rejects noncanonical public identity, slot, and continuation bindings', () => {
  const cases = [
    {
      name: 'non-v4 attempt id',
      error: /public evidence attempt id is invalid/,
      mutate(publicEvidence, adminEvidence) {
        const invalidAttempt = '11111111-1111-1111-8111-111111111111';
        publicEvidence.publicApi.initialAttempt.attemptId = invalidAttempt;
        adminEvidence.attemptId = invalidAttempt;
      },
    },
    {
      name: 'uppercase UUID is not canonical',
      error: /public evidence attempt id is invalid/,
      mutate(publicEvidence, adminEvidence) {
        const uppercaseAttempt = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
        publicEvidence.publicApi.initialAttempt.attemptId = uppercaseAttempt;
        adminEvidence.attemptId = uppercaseAttempt;
      },
    },
    {
      name: 'leading-zero hand in event key',
      error: /event key is not canonical/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.parentCandidateAttempts[0].eventKey = `training-attempt:${ATTEMPT}:hand:01:decision:1`;
      },
    },
    {
      name: 'event key bound to another UUID',
      error: /event key is not canonical or does not match its slot/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.parentCandidateAttempts[0].eventKey = eventKey(
          1,
          1,
          '22222222-2222-4222-8222-222222222222'
        );
      },
    },
    {
      name: 'submission id differs from event key',
      error: /submissionId must equal its canonical event key/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.parentCandidateAttempts[0].submissionId = eventKey(2);
      },
    },
    {
      name: 'parent slots are not contiguous',
      error: /hand ordinal mismatch/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.parentCandidateAttempts[1].handOrdinal = 3;
      },
    },
    {
      name: 'continuation parent is not a public parent',
      error: /parent event key is not one of the parent events/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.continuation.parentEventKey = eventKey(99);
      },
    },
    {
      name: 'continuation changes hand',
      error: /changed the parent hand/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.continuation.handOrdinal = 2;
        publicEvidence.publicApi.continuation.eventKey = eventKey(2, 2);
        publicEvidence.publicApi.continuation.submissionId = eventKey(2, 2);
      },
    },
    {
      name: 'continuation skips a decision',
      error: /not the next decision/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.continuation.decisionOrdinal = 3;
        publicEvidence.publicApi.continuation.eventKey = eventKey(1, 3);
        publicEvidence.publicApi.continuation.submissionId = eventKey(1, 3);
      },
    },
    {
      name: 'selected parent differs from continuation parent',
      error: /selected parent does not bind the continuation/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.parent = structuredClone(
          publicEvidence.publicApi.parentCandidateAttempts[1]
        );
      },
    },
  ];

  for (const { name, error, mutate } of cases) {
    const publicEvidence = publicCloseoutEvidence();
    const adminEvidence = administratorCloseoutEvidence(publicEvidence);
    mutate(publicEvidence, adminEvidence);
    assert.throws(
      () => validateAdministratorCloseout(publicEvidence, adminEvidence, 'b'.repeat(64)),
      error,
      name
    );
  }
});

test('administrator closeout rejects mismatched digests, exact counts, inventories, gates, and time window', () => {
  const cases = [
    {
      name: 'public API did not pass',
      error: /public API evidence has not passed/,
      mutate(publicEvidence) {
        publicEvidence.publicApiSuccess = false;
      },
    },
    {
      name: 'public file was already finalized',
      error: /unexpectedly already finalized/,
      mutate(publicEvidence) {
        publicEvidence.success = true;
      },
    },
    {
      name: 'public build is not canonical lowercase',
      error: /public evidence build must be lowercase/,
      mutate(publicEvidence, adminEvidence) {
        publicEvidence.expectedBuild = 'A'.repeat(40);
        adminEvidence.expectedBuild = 'A'.repeat(40);
      },
    },
    {
      name: 'public target count',
      error: /targetHands mismatch/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.initialAttempt.targetHands = 19;
      },
    },
    {
      name: 'public delivered count',
      error: /deliveredHands mismatch/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.initialAttempt.deliveredHands = 19;
      },
    },
    {
      name: 'public manifest incomplete',
      error: /manifest is incomplete/,
      mutate(publicEvidence) {
        publicEvidence.publicApi.initialAttempt.completeManifest = false;
      },
    },
    {
      name: 'public completion predates start',
      error: /completed before API work|completed before it started/,
      mutate(publicEvidence, adminEvidence) {
        publicEvidence.completedAt = '2026-09-08T11:59:59.999Z';
        adminEvidence.productionErrorStreamReview.windowEnd = publicEvidence.completedAt;
      },
    },
    {
      name: 'different public digest',
      error: /binds a different public file/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.publicEvidenceSha256 = 'c'.repeat(64);
      },
    },
    {
      name: 'administrator schema version',
      error: /administrator evidence schema version mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.schemaVersion = 2;
      },
    },
    {
      name: 'administrator evidence kind',
      error: /administrator evidence kind mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.evidenceKind = 'claimed';
      },
    },
    {
      name: 'administrator build',
      error: /administrator evidence build mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.expectedBuild = 'c'.repeat(40);
      },
    },
    {
      name: 'administrator deployment',
      error: /administrator evidence deployment identity mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.deployment.deploymentId = 'dpl_other';
      },
    },
    {
      name: 'administrator audit account',
      error: /administrator evidence audit account mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.auditUserId = ATTEMPT;
      },
    },
    {
      name: 'collector public digest',
      error: /collector binds a different public file/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.collector.publicEvidenceSha256 = 'c'.repeat(64);
      },
    },
    {
      name: 'collector query mode',
      error: /collector query mode mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.collector.queryMode = 'read_only';
      },
    },
    {
      name: 'administrator attempt',
      error: /administrator evidence attempt mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.attemptId = '22222222-2222-4222-8222-222222222222';
      },
    },
    {
      name: 'correlation status',
      error: /administrator correlation did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.status = 'pending';
      },
    },
    {
      name: 'correlation attempt',
      error: /administrator correlation attempt mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.attemptId = '22222222-2222-4222-8222-222222222222';
      },
    },
    {
      name: 'correlation attempt row',
      error: /attempt row binding did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.attemptRowBindingExact = false;
      },
    },
    {
      name: 'correlation served fields',
      error: /served-event field binding did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.allServedFieldBindingsExact = false;
      },
    },
    {
      name: 'correlation answer fields',
      error: /answer field binding did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.allAnswerFieldBindingsExact = false;
      },
    },
    {
      name: 'correlation continuation slot',
      error: /continuation-slot binding did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.continuationSlotBindingExact = false;
      },
    },
    {
      name: 'served count',
      error: /served-event count mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.servedEventCount = 20;
      },
    },
    {
      name: 'answer count',
      error: /answer count mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.answerCount = 20;
      },
    },
    {
      name: 'missing served event',
      error: /does not match the public evidence/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.servedEventKeys.pop();
      },
    },
    {
      name: 'duplicate answer id',
      error: /contains duplicates/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.answerSubmissionIds[20] =
          adminEvidence.correlation.answerSubmissionIds[0];
      },
    },
    {
      name: 'administrator continuation parent',
      error: /administrator continuation parent binding mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.continuationParentEventKey = eventKey(2);
      },
    },
    {
      name: 'private status',
      error: /private attempt-scoped attestation did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.privateAttemptScopedServeAttestation.status = 'pending';
      },
    },
    {
      name: 'private row count',
      error: /must be exactly one row/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.privateAttemptScopedServeAttestation.rowCount = 2;
      },
    },
    {
      name: 'private contract version',
      error: /private attestation contract version mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.privateAttemptScopedServeAttestation.contractVersion = 'v2';
      },
    },
    {
      name: 'private evidence kind',
      error: /private attestation kind mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.privateAttemptScopedServeAttestation.evidenceKind = 'legacy';
      },
    },
    {
      name: 'private event is not canonical attempt-scoped evidence',
      error: /not canonical attempt-scoped evidence/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.privateAttemptScopedServeAttestation.evidenceEventKey = 'legacy-random-event';
      },
    },
    {
      name: 'negative matrix status',
      error: /negative refusal matrix did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.negativeRefusalMatrix.status = 'pending';
      },
    },
    {
      name: 'negative probe count',
      error: /negative refusal probe count mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.negativeRefusalMatrix.probeCount = 5;
      },
    },
    {
      name: 'negative probe failed',
      error: /negative probe did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.negativeRefusalMatrix.probes.changedSlotBinding = 'failed';
      },
    },
    {
      name: 'negative probe was not rolled back',
      error: /negative probes were not rolled back/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.negativeRefusalMatrix.transactionRolledBack = false;
      },
    },
    {
      name: 'negative probe inventory',
      error: /negative refusal probes fields do not match/,
      mutate(_publicEvidence, adminEvidence) {
        delete adminEvidence.negativeRefusalMatrix.probes.nullOwnerLegacyEvent;
      },
    },
    {
      name: 'predecessor status',
      error: /predecessor rollback compatibility did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.predecessorRollbackCompatibility.status = 'pending';
      },
    },
    {
      name: 'predecessor method',
      error: /predecessor proof method is invalid/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.predecessorRollbackCompatibility.method = 'claimed';
      },
    },
    {
      name: 'predecessor transaction was not rolled back',
      error: /predecessor rehearsal was not rolled back/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.predecessorRollbackCompatibility.transactionRolledBack = false;
      },
    },
    {
      name: 'predecessor initial write',
      error: /predecessor initial write did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.predecessorRollbackCompatibility.initialWrite = 'failed';
      },
    },
    {
      name: 'predecessor continuation write',
      error: /predecessor continuation write did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.predecessorRollbackCompatibility.continuationWrite = 'failed';
      },
    },
    {
      name: 'production review status',
      error: /production error-stream review did not pass/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.status = 'pending';
      },
    },
    {
      name: 'production errors',
      error: /found relevant errors/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.relevantErrorCount = 1;
      },
    },
    {
      name: 'production review deployment',
      error: /production error review deployment mismatch/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.deploymentId = 'dpl_other';
      },
    },
    {
      name: 'production review did not include settle',
      error: /omitted the settled window/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.settledWindowCovered = false;
      },
    },
    {
      name: 'window starts early',
      error: /must start at the exact public attestation start/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.windowStart = '2026-09-08T11:59:59.999Z';
      },
    },
    {
      name: 'window ends late',
      error: /must end at the exact public attestation completion/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.productionErrorStreamReview.windowEnd = '2026-09-08T12:04:00.001Z';
      },
    },
    {
      name: 'noncanonical timestamp',
      error: /canonical UTC ISO-8601 milliseconds/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.verifiedAt = '2026-09-08T12:05:00Z';
      },
    },
    {
      name: 'verification predates public run',
      error: /predates public completion/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.verifiedAt = STARTED_AT;
      },
    },
    {
      name: 'unknown field',
      error: /fields do not match the closeout schema/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.notes = 'not allowed';
      },
    },
    {
      name: 'unknown nested field',
      error: /administrator correlation fields do not match/,
      mutate(_publicEvidence, adminEvidence) {
        adminEvidence.correlation.notes = 'not allowed';
      },
    },
  ];

  for (const { name, error, mutate } of cases) {
    const publicEvidence = publicCloseoutEvidence();
    const adminEvidence = administratorCloseoutEvidence(publicEvidence);
    mutate(publicEvidence, adminEvidence);
    assert.throws(
      () => validateAdministratorCloseout(publicEvidence, adminEvidence, 'b'.repeat(64)),
      error,
      name
    );
  }
});

test('administrator closeout rejects secret-bearing field spellings at any depth', () => {
  for (const forbiddenKey of [
    'access_token',
    'Refresh-Token',
    'sessionToken',
    'service_role_key',
    'bearerJwt',
    'api-key',
    'operatorCredential',
  ]) {
    const publicEvidence = publicCloseoutEvidence();
    const adminEvidence = administratorCloseoutEvidence(publicEvidence);
    adminEvidence.correlation[forbiddenKey] = 'must-not-be-written';
    assert.throws(
      () => validateAdministratorCloseout(publicEvidence, adminEvidence, 'b'.repeat(64)),
      /forbidden secret-bearing field/,
      forbiddenKey
    );
  }
  const publicEvidence = publicCloseoutEvidence();
  const adminEvidence = administratorCloseoutEvidence(publicEvidence);
  publicEvidence.publicApi.operator = { grading_receipt: 'must-not-be-written' };
  assert.throws(
    () => validateAdministratorCloseout(publicEvidence, adminEvidence, 'b'.repeat(64)),
    /public evidence.*forbidden secret-bearing field/
  );
  for (const [value, error] of [
    [`${'a'.repeat(16)}.${'b'.repeat(43)}`, /grading-receipt material/],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhdWRpdC11c2VyIn0.signaturebyteslongenough', /JWT material/],
    ['sb_secret_examplecredentialmaterial12345', /secret-like credential material/],
  ]) {
    const valuePublic = publicCloseoutEvidence();
    const valueAdmin = administratorCloseoutEvidence(valuePublic);
    valueAdmin.correlation.status = value;
    assert.throws(
      () => validateAdministratorCloseout(valuePublic, valueAdmin, 'b'.repeat(64)),
      error
    );
  }
});

test('administrator closeout configuration is explicit and complete', () => {
  assert.throws(() => readAdministratorCloseoutConfig({}), /EVIDENCE is required/);
  assert.throws(
    () =>
      readAdministratorCloseoutConfig({ TRAINING_PHASE6_DELIVERY_EVIDENCE: '/tmp/public.json' }),
    /ADMIN_EVIDENCE is required/
  );
  assert.deepEqual(
    readAdministratorCloseoutConfig({
      TRAINING_PHASE6_DELIVERY_EVIDENCE: '/tmp/public.json',
      TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE: '/tmp/admin.json',
      TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE: '/tmp/final.json',
      TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT: ADMIN_ACKNOWLEDGEMENT,
    }),
    {
      publicEvidencePath: '/tmp/public.json',
      adminEvidencePath: '/tmp/admin.json',
      outputPath: '/tmp/final.json',
      acknowledgement: ADMIN_ACKNOWLEDGEMENT,
    }
  );
});

test('machine collector accepts credentials from private out-of-repository files and refuses ambiguity or permissive modes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-machine-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const databaseCredentialPath = join(directory, 'database-url');
  const vercelCredentialPath = join(directory, 'vercel-token');
  await writeFile(publicPath, jsonBytes(publicCloseoutEvidence()));
  await writeFile(
    databaseCredentialPath,
    `postgresql://phase6:private-password@db.${'a'.repeat(20)}.supabase.co/postgres\n`
  );
  await writeFile(vercelCredentialPath, 'vercel-private-token-material-123456\n');
  await chmod(databaseCredentialPath, 0o600);
  await chmod(vercelCredentialPath, 0o600);
  const env = {
    TRAINING_PHASE6_DELIVERY_EVIDENCE: publicPath,
    TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE: join(directory, 'admin.json'),
    TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE: join(directory, 'final.json'),
    TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID: AUDIT_USER,
    TRAINING_PHASE6_EXPECTED_SUPABASE_PROJECT_REF: 'a'.repeat(20),
    TRAINING_PHASE6_ADMIN_DATABASE_CREDENTIAL_FILE: databaseCredentialPath,
    TRAINING_PHASE6_VERCEL_TOKEN_FILE: vercelCredentialPath,
    TRAINING_PHASE6_VERCEL_PROJECT: 'hub-vanguard',
    TRAINING_PHASE6_PREDECESSOR_MODE: 'controlled_rehearsal',
    TRAINING_PHASE6_PREDECESSOR_REHEARSAL_ACKNOWLEDGEMENT:
      'I_ACKNOWLEDGE_CONTROLLED_REHEARSAL_IS_NOT_AUTHENTIC_PRODUCTION_PREDECESSOR_EVIDENCE',
    TRAINING_PHASE6_ADMIN_COLLECT_ACKNOWLEDGEMENT:
      'I_ACKNOWLEDGE_PHASE6_ADMIN_COLLECTION_RUNS_ROLLBACK_ONLY_NEGATIVE_PROBES',
    TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT: ADMIN_ACKNOWLEDGEMENT,
  };
  const config = readMachineCollectorConfig(env);
  assert.equal(config.predecessor.mode, 'controlled_rehearsal');
  assert.equal(config.predecessor.rehearsalAcknowledged, true);
  assert.equal(config.vercelProject, 'hub-vanguard');
  assert.throws(
    () =>
      readMachineCollectorConfig({
        ...env,
        TRAINING_PHASE6_ADMIN_DATABASE_URL: `postgresql://phase6:another@db.${'a'.repeat(20)}.supabase.co/postgres`,
      }),
    /exactly one direct environment value or out-of-repository credential file/
  );
  await chmod(vercelCredentialPath, 0o644);
  assert.throws(() => readMachineCollectorConfig(env), /must not be group\/world accessible/);
});

test('machine collector core orchestrates exact health, parameterized read-only correlation, six rollback probes, logs, and predecessor rehearsal', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-machine-core-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const publicEvidence = publicCloseoutEvidence();
  await writeFile(publicPath, jsonBytes(publicEvidence));
  const database = fakeMachineDatabase(publicEvidence);
  let healthCalls = 0;
  const fetchFn = async (...args) => {
    healthCalls += 1;
    return healthyDeploymentFetch()(...args);
  };
  const collected = await collectMachineAdministratorEvidenceCore(machineCoreConfig(publicPath), {
    databaseTransport: database,
    logTransport: passingLogTransport(publicEvidence),
    predecessorTransport: passingPredecessorTransport(),
    fetchFn,
    now: () => new Date(VERIFIED_AT),
    nowMs: () => 123,
  });
  assert.equal(healthCalls, 2);
  assert.equal(database.closed, true);
  assert.equal(
    database.rollbackCount,
    7,
    'one correlation plus six production probes must be rolled back'
  );
  assert.equal(
    collected.adminEvidence.collector.rollbackVerificationCount,
    8,
    'collector also binds the disposable predecessor rehearsal rollback'
  );
  assert.equal(collected.adminEvidence.correlation.servedEventCount, 21);
  assert.equal(collected.adminEvidence.correlation.answerCount, 21);
  assert.equal(
    collected.adminEvidence.correlation.attemptConfigHash,
    attestationAttemptConfigHash(publicEvidence),
  );
  assert.equal(
    collected.adminEvidence.correlation.continuationPrecommitBoundInAttemptConfig,
    true,
  );
  assert.equal(collected.adminEvidence.correlation.continuationSnapshotLineageExact, true);
  assert.equal(
    collected.adminEvidence.correlation.continuationParentSourceClassification,
    'SOLVER_DERIVED_RESPONSE',
  );
  assert.equal(
    collected.adminEvidence.correlation.continuationChildSourceClassification,
    'SOLVER_DERIVED_RESPONSE',
  );
  assert.deepEqual(collected.adminEvidence.negativeRefusalMatrix.probes, {
    answeredSlotPromotion: 'passed',
    changedAnswerReplay: 'passed',
    changedSlotBinding: 'passed',
    neverServedSnapshot: 'passed',
    nonV4PredecessorId: 'passed',
    nullOwnerLegacyEvent: 'passed',
  });
  for (const call of database.calls.filter(({ text }) =>
    /phase6:(?:attempt|served|answer|continuation-slot|continuation-snapshot|private-attestation)-correlation/.test(text)
  )) {
    assert.ok(call.params.length > 0, 'every correlation lookup must carry bind parameters');
    assert.equal(
      call.text.includes(ATTEMPT),
      false,
      'attempt UUID must not be interpolated into correlation SQL'
    );
    assert.equal(
      call.text.includes(AUDIT_USER),
      false,
      'audit UUID must not be interpolated into correlation SQL'
    );
  }
  assert.throws(
    () =>
      validateAdministratorCloseout(
        collected.publicParsed.value,
        collected.adminEvidence,
        collected.publicParsed.digest
      ),
    /MACHINE_ADMIN_COLLECTOR_REQUIRED/,
    'even machine-core output cannot be finalized after crossing a file/API boundary'
  );
});

test('machine collector core fails closed on database denial and rollback failure', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-machine-denial-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const publicEvidence = publicCloseoutEvidence();
  await writeFile(publicPath, jsonBytes(publicEvidence));
  const common = {
    logTransport: passingLogTransport(publicEvidence),
    predecessorTransport: passingPredecessorTransport(),
    fetchFn: healthyDeploymentFetch(),
    now: () => new Date(VERIFIED_AT),
  };
  const denied = fakeMachineDatabase(publicEvidence, { denyCorrelation: true });
  await assert.rejects(
    () =>
      collectMachineAdministratorEvidenceCore(machineCoreConfig(publicPath), {
        ...common,
        databaseTransport: denied,
      }),
    /permission denied/
  );
  assert.equal(denied.closed, true);
  const rollbackFailure = fakeMachineDatabase(publicEvidence, { failRollback: true });
  await assert.rejects(
    () =>
      collectMachineAdministratorEvidenceCore(machineCoreConfig(publicPath), {
        ...common,
        databaseTransport: rollbackFailure,
      }),
    /DATABASE_ROLLBACK_FAILED/
  );
  assert.equal(rollbackFailure.closed, true);
});

test('machine collector rejects incomplete logs, cross-account rows, and cross-deployment health/logs', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-machine-binding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const publicEvidence = publicCloseoutEvidence();
  await writeFile(publicPath, jsonBytes(publicEvidence));
  const run = (overrides = {}) =>
    collectMachineAdministratorEvidenceCore(machineCoreConfig(publicPath), {
      databaseTransport: overrides.database || fakeMachineDatabase(publicEvidence),
      logTransport: overrides.logs || passingLogTransport(publicEvidence),
      predecessorTransport: passingPredecessorTransport(),
      fetchFn: overrides.fetchFn || healthyDeploymentFetch(),
      now: () => new Date(VERIFIED_AT),
    });
  await assert.rejects(
    () => run({ logs: passingLogTransport(publicEvidence, { queryComplete: false }) }),
    /error-stream review is incomplete/
  );
  await assert.rejects(
    () => run({ database: fakeMachineDatabase(publicEvidence, { auditUserId: ATTEMPT }) }),
    /attempt row did not exactly match|owner mismatch/
  );
  await assert.rejects(
    () => run({ database: fakeMachineDatabase(publicEvidence, { configHash: '0'.repeat(64) }) }),
    /attempt row did not exactly match/
  );
  await assert.rejects(
    () => run({
      database: fakeMachineDatabase(publicEvidence, {
        snapshotMutator: ({ child }) => {
          child.scenario.solverNode = `${child.scenario.solverNode}:c`;
        },
      }),
    }),
    /continuation snapshots failed strict solver-lineage verification/
  );
  await assert.rejects(
    () => run({ fetchFn: healthyDeploymentFetch({ deploymentId: 'dpl_otherDeployment' }) }),
    /live deployment health does not match immutable public evidence/
  );
  await assert.rejects(
    () =>
      run({ logs: passingLogTransport(publicEvidence, { deploymentId: 'dpl_otherDeployment' }) }),
    /error-stream review is incomplete/
  );
});

test('Vercel runtime-log adapter binds exact deployment/window without placing credentials in argv or errors', async () => {
  const token = 'vercel-private-token-material-never-print';
  const calls = [];
  const adapter = createVercelCliRuntimeLogTransport({
    token,
    project: 'hub-vanguard',
    scope: 'smarter-poker',
    spawnSyncFn(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0, stdout: '', stderr: '' };
    },
    environment: { PATH: '/usr/bin', HOME: '/tmp', TMPDIR: '/tmp' },
  });
  const result = await adapter.collect({
    deploymentId: DEPLOYMENT_ID,
    deploymentUrl: DEPLOYMENT_URL,
    expectedBuild: BUILD,
    windowStart: STARTED_AT,
    windowEnd: COMPLETED_AT,
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls.map(({ args }) => args[args.indexOf('--level') + 1]),
    ['error', 'fatal']
  );
  for (const call of calls) {
    assert.equal(
      call.args.includes(token),
      false,
      'Vercel credential must not enter the process argument list'
    );
    assert.equal(call.options.env.VERCEL_TOKEN, token);
    assert.equal(call.args[call.args.indexOf('--deployment') + 1], DEPLOYMENT_ID);
    assert.equal(call.args[call.args.indexOf('--since') + 1], STARTED_AT);
    assert.equal(call.args[call.args.indexOf('--until') + 1], COMPLETED_AT);
  }
  assert.equal(result.queryComplete, true);
  const denied = createVercelCliRuntimeLogTransport({
    token,
    project: 'hub-vanguard',
    spawnSyncFn: () => ({ status: 1, stdout: '', stderr: `denied ${token}` }),
  });
  let denial;
  try {
    await denied.collect({
      deploymentId: DEPLOYMENT_ID,
      deploymentUrl: DEPLOYMENT_URL,
      expectedBuild: BUILD,
      windowStart: STARTED_AT,
      windowEnd: COMPLETED_AT,
    });
  } catch (error) {
    denial = error;
  }
  assert.ok(denial);
  assert.equal(
    String(denial.stack).includes(token),
    false,
    'Vercel subprocess stderr must not leak credentials'
  );
  assert.match(denial.message, /VERCEL_LOG_QUERY_FAILED/);
});

test('controlled rehearsal cannot claim authentic predecessor provenance', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-machine-predecessor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const publicEvidence = publicCloseoutEvidence();
  await writeFile(publicPath, jsonBytes(publicEvidence));
  const falseAuthentic = {
    async collect() {
      return {
        ...(await passingPredecessorTransport().collect()),
        method: 'authentic_saved_receipt',
      };
    },
  };
  await assert.rejects(
    () =>
      collectMachineAdministratorEvidenceCore(machineCoreConfig(publicPath), {
        databaseTransport: fakeMachineDatabase(publicEvidence),
        logTransport: passingLogTransport(publicEvidence),
        predecessorTransport: falseAuthentic,
        fetchFn: healthyDeploymentFetch(),
        now: () => new Date(VERIFIED_AT),
      }),
    /authentic predecessor provenance mismatch/
  );
});

test('authentic predecessor artifact requires a pinned Ed25519 key, exact account, canonical decisions, and an untampered signature', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-authentic-predecessor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const artifactPath = join(directory, 'predecessor.json');
  const publicKeyPath = join(directory, 'predecessor-public.pem');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const publicKeyBytes = publicKey.export({ type: 'spki', format: 'pem' });
  await writeFile(publicKeyPath, publicKeyBytes);
  const predecessorAttempt = '22222222-2222-4222-8222-222222222222';
  const payload = {
    auditUserId: AUDIT_USER,
    attemptId: predecessorAttempt,
    initial: {
      eventKey: eventKey(1, 1, predecessorAttempt),
      receiptId: '33333333-3333-4333-8333-333333333333',
      handOrdinal: 1,
      decisionOrdinal: 1,
    },
    continuation: {
      eventKey: eventKey(1, 2, predecessorAttempt),
      receiptId: '44444444-4444-4444-8444-444444444444',
      handOrdinal: 1,
      decisionOrdinal: 2,
    },
  };
  const artifact = {
    schemaVersion: 1,
    evidenceKind: 'phase6-authentic-predecessor-artifact-v1',
    signatureAlgorithm: 'Ed25519',
    keyId: 'phase6-release-authority',
    payload,
    signature: sign(null, Buffer.from(stableJsonForTest(payload)), privateKey).toString('base64'),
  };
  await writeFile(artifactPath, jsonBytes(artifact));
  await chmod(artifactPath, 0o600);
  const config = {
    artifactPath,
    publicKeyPath,
    trustedKeySha256: sha256(publicKeyBytes),
  };
  const verified = verifyAuthenticPredecessorArtifact(
    config,
    validateCompletePublicAttestation(publicCloseoutEvidence())
  );
  assert.equal(verified.trustedKeySha256, config.trustedKeySha256);
  assert.equal(verified.artifactSha256, sha256(jsonBytes(artifact)));
  const tampered = structuredClone(artifact);
  tampered.payload.continuation.handOrdinal = 2;
  tampered.payload.continuation.eventKey = eventKey(2, 2, predecessorAttempt);
  await writeFile(artifactPath, jsonBytes(tampered));
  await assert.rejects(
    async () =>
      verifyAuthenticPredecessorArtifact(
        config,
        validateCompletePublicAttestation(publicCloseoutEvidence())
      ),
    /continuation changed hand|detached signature did not verify/
  );
});

test('filesystem finalization refuses a hand-authored administrator file and never creates green evidence', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-delivery-closeout-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const adminPath = join(directory, 'admin.json');
  const finalPath = join(directory, 'final.json');
  const publicEvidence = publicCloseoutEvidence();
  const publicBytes = jsonBytes(publicEvidence);
  const publicDigest = sha256(publicBytes);
  const adminEvidence = administratorCloseoutEvidence(publicEvidence, publicDigest);
  await writeFile(publicPath, publicBytes);
  await writeFile(adminPath, jsonBytes(adminEvidence));

  assert.throws(
    () =>
      finalizeProductionDeliveryAttestation({
        publicEvidencePath: publicPath,
        adminEvidencePath: adminPath,
        outputPath: finalPath,
        acknowledgement: ADMIN_ACKNOWLEDGEMENT,
      }),
    /MACHINE_ADMIN_COLLECTOR_REQUIRED/
  );
  assert.equal(await readFile(publicPath, 'utf8'), publicBytes);
  assert.equal((await readdir(directory)).includes('final.json'), false);
});

test('filesystem finalization fails closed before output for bad acknowledgement, paths, JSON, or evidence', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-delivery-closeout-negative-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const adminPath = join(directory, 'admin.json');
  const finalPath = join(directory, 'final.json');
  const publicEvidence = publicCloseoutEvidence();
  const publicBytes = jsonBytes(publicEvidence);
  await writeFile(publicPath, publicBytes);
  await writeFile(
    adminPath,
    jsonBytes(administratorCloseoutEvidence(publicEvidence, sha256(publicBytes)))
  );
  const config = {
    publicEvidencePath: publicPath,
    adminEvidencePath: adminPath,
    outputPath: finalPath,
    acknowledgement: ADMIN_ACKNOWLEDGEMENT,
  };

  assert.throws(
    () => finalizeProductionDeliveryAttestation({ ...config, acknowledgement: 'yes' }),
    /Refusing administrator closeout/
  );
  assert.throws(
    () => finalizeProductionDeliveryAttestation({ ...config, outputPath: '' }),
    /final evidence path is required/
  );
  assert.throws(
    () => finalizeProductionDeliveryAttestation({ ...config, outputPath: publicPath }),
    /must not overwrite the immutable public evidence/
  );
  assert.throws(
    () => finalizeProductionDeliveryAttestation({ ...config, publicEvidencePath: adminPath }),
    /must be separate files/
  );
  await writeFile(publicPath, `${publicBytes}\n`);
  assert.throws(
    () => finalizeProductionDeliveryAttestation(config),
    /binds a different public file/
  );
  assert.equal((await readdir(directory)).includes('final.json'), false);
  await writeFile(publicPath, publicBytes);
  await writeFile(adminPath, '{not-json}\n');
  assert.throws(
    () => finalizeProductionDeliveryAttestation(config),
    /administrator evidence is not valid JSON/
  );
  assert.equal((await readdir(directory)).includes('final.json'), false);
});

test('administrator finalization CLI cannot turn hand-authored JSON into release evidence', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'phase6-delivery-closeout-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const publicPath = join(directory, 'public.json');
  const adminPath = join(directory, 'admin.json');
  const finalPath = join(directory, 'final.json');
  const rejectedPath = join(directory, 'rejected.json');
  const publicEvidence = publicCloseoutEvidence();
  const publicBytes = jsonBytes(publicEvidence);
  await writeFile(publicPath, publicBytes);
  await writeFile(
    adminPath,
    jsonBytes(administratorCloseoutEvidence(publicEvidence, sha256(publicBytes)))
  );
  const scriptPath = fileURLToPath(
    new URL('../scripts/training-phase6-production-delivery-attestation.mjs', import.meta.url)
  );
  const baseEnv = {
    ...process.env,
    TRAINING_PHASE6_DELIVERY_EVIDENCE: publicPath,
    TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE: adminPath,
    TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE: finalPath,
  };

  const rejected = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...baseEnv,
      TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE: rejectedPath,
      TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT: 'yes',
    },
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Refusing administrator closeout/);
  assert.equal((await readdir(directory)).includes('rejected.json'), false);

  const blocked = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...baseEnv,
      TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT: ADMIN_ACKNOWLEDGEMENT,
    },
  });
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /MACHINE_ADMIN_COLLECTOR_REQUIRED/);
  assert.equal((await readdir(directory)).includes('final.json'), false);
});

test('CLI exit semantics fail closed until every release gate is genuinely ready', () => {
  assert.equal(
    attestationExitCode({ success: false, publicApiSuccess: true, releaseGateReady: false }),
    1
  );
  assert.equal(
    attestationExitCode({ success: true, publicApiSuccess: true, releaseGateReady: false }),
    1
  );
  assert.equal(
    attestationExitCode({ success: true, publicApiSuccess: false, releaseGateReady: true }),
    1
  );
  assert.equal(
    attestationExitCode({ success: true, publicApiSuccess: true, releaseGateReady: true }),
    1,
    'a synthetic green-looking object must not acquire the module-private finalization proof'
  );
});

test('runtime source has a hard write acknowledgement and keeps admin gates separate', async () => {
  const source = await readFile(
    new URL('../scripts/training-phase6-production-delivery-attestation.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS/);
  assert.match(
    source,
    /I_ACKNOWLEDGE_THE_ADMIN_CLOSEOUT_EVIDENCE_IS_COMPLETE_AND_ACCESS_CONTROLLED/
  );
  assert.match(source, /releaseGateReady:\s*false/);
  assert.match(source, /privateAttemptScopedServeAttestation:\s*'pending'/);
  assert.match(source, /negativeRefusalMatrix:\s*'pending'/);
  assert.match(source, /predecessorRollbackCompatibility:\s*'pending'/);
  assert.match(source, /productionErrorStreamReview:\s*'pending'/);
  assert.match(source, /response-loss parent candidate/);
  assert.match(source, /recoveredExistingContinuation/);
  assert.match(source, /TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT/);
  assert.match(source, /TRAINING_GRADING_RECEIPT_SUBMISSION_MISMATCH/);
  assert.match(source, /process\.exitCode = attestationExitCode\(evidence\)/);
  assert.doesNotMatch(source, /TRAINING_GRADING_RECEIPT_SECRET/);
  assert.doesNotMatch(source, /createHmac|signPayload/);
  assert.doesNotMatch(source, /addInitScript/);
  assert.doesNotMatch(source, /import\s+\{?\s*chromium\s*\}?\s+from\s+['"]playwright['"]/);
  assert.match(source, /await import\(['"]playwright['"]\)/);
  assert.match(source, /new URL\(pageResponse\.url\(\)\)\.origin/);
  assert.match(source, /TRAINING_PHASE6_VERCEL_PROTECTION_BYPASS_SECRET/);
  assert.match(source, /x-vercel-protection-bypass/);
  assert.match(source, /new URL\(request\.url\(\)\)\.origin/);
  assert.match(source, /await page\.route\(['"]\*\*\/\*['"]/);
  assert.match(source, /route\.fetch\(\{/);
  assert.match(source, /maxRedirects:\s*0/);
  assert.match(source, /route\.fulfill\(\{ response \}\)/);
  assert.doesNotMatch(source, /route\.continue\(\{[\s\S]*?x-vercel-protection-bypass/);
  assert.doesNotMatch(source, /setExtraHTTPHeaders/);
  assert.doesNotMatch(source, /page\.goto\([^;]*headers:/s);
  assert.doesNotMatch(source, /process\.argv[^\n]*PROTECTION_BYPASS/);
});
