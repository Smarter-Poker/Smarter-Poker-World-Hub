#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  createHash,
  createPublicKey,
  randomUUID,
  verify as verifyDetachedSignature,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTrainingAttestationContinuationPrecommit,
  selectPublicAttestationContinuationAnswer,
  TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
} from '../src/lib/training/trainingAttestationContinuationContract.mjs';
import { trainingAttemptConfigHash } from '../src/lib/training/trainingAttemptDelivery.mjs';
import { pioQueryService } from '../src/services/PIOQueryService.js';
import {
  validateStrictTrainingContinuationSnapshotPair,
} from '../src/lib/training/trainingContinuationEligibility.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHA40_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PREDECESSOR_JTI_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?::[01])?$/i;
const ATTEMPT_SCOPED_JTI_RE =
  /^training-attempt:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):hand:([1-9]\d*):decision:([1-9]\d*)$/;
const WRITE_ACKNOWLEDGEMENT = 'I_ACKNOWLEDGE_THIS_CREATES_REAL_TRAINING_ATTEMPTS_AND_ANSWERS';
const GAME_ID = 'cash-002';
const LEVEL = 8;
const TARGET_HANDS = 20;
const MAX_PARENT_CANDIDATES = 20;
const REQUESTED_DIFFICULTY_TIER = 'standard';
const EXPECTED_DIFFICULTY_MODE = 'grouped';
const RECORD_QUESTION_WINDOW_MAX = 28;
const RECORD_QUESTION_WINDOW_MS = 60_000;
const ERROR_SETTLE_WINDOW_MS = 15_000;
const ADMIN_CLOSEOUT_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_THE_ADMIN_CLOSEOUT_EVIDENCE_IS_COMPLETE_AND_ACCESS_CONTROLLED';
const ADMIN_EVIDENCE_KIND = 'phase6-delivery-authority-admin-closeout';
const ADMIN_COLLECTOR_KIND = 'phase6-production-admin-collector-v1';
const ADMIN_COLLECTOR_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_PHASE6_ADMIN_COLLECTION_RUNS_ROLLBACK_ONLY_NEGATIVE_PROBES';
const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass';
const CONTROLLED_REHEARSAL_ACKNOWLEDGEMENT =
  'I_ACKNOWLEDGE_CONTROLLED_REHEARSAL_IS_NOT_AUTHENTIC_PRODUCTION_PREDECESSOR_EVIDENCE';
const AUTHENTIC_PREDECESSOR_KIND = 'phase6-authentic-predecessor-artifact-v1';
const AUTHENTIC_PREDECESSOR_ALGORITHM = 'Ed25519';
const ADMIN_LOG_LIMIT = 10_000;
const PERSISTED_DIFFICULTY_MODE = EXPECTED_DIFFICULTY_MODE;
const MACHINE_COLLECTOR_PROOF = Symbol('phase6-machine-admin-collector-proof');
const FINALIZED_RELEASE_PROOF = Symbol('phase6-finalized-release-proof');
const ADMIN_NEGATIVE_PROBES = [
  'answeredSlotPromotion',
  'changedAnswerReplay',
  'changedSlotBinding',
  'neverServedSnapshot',
  'nonV4PredecessorId',
  'nullOwnerLegacyEvent',
];
const RECEIPT_MATERIAL_RE =
  /(^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{43})(?=$|[^A-Za-z0-9_-])/g;
const JWT_MATERIAL_RE =
  /(^|[^A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{20,}(?=$|[^A-Za-z0-9_-])/g;
const SECRET_PREFIX_RE =
  /(?:^|[^a-z0-9])(?:sb_(?:secret|publishable)_|sk_(?:live|test)_|gh[opusr]_|xox[baprs]-)[a-z0-9_-]{12,}/i;
const SECRET_PREFIX_RE_GLOBAL =
  /(^|[^a-z0-9])(?:sb_(?:secret|publishable)_|sk_(?:live|test)_|gh[opusr]_|xox[baprs]-)[a-z0-9_-]{12,}/gi;
const CONNECTION_CREDENTIAL_RE = /\b(?:postgres(?:ql)?|https?):\/\/([^\s/@:]+):([^\s/@]+)@/gi;

const ADMIN_NEGATIVE_PROBE_EXPECTATIONS = Object.freeze({
  answeredSlotPromotion: Object.freeze({
    outcome: 'error',
    code: '23514',
    message: 'TRAINING_ATTEMPT_DECISION_ALREADY_ANSWERED',
  }),
  changedAnswerReplay: Object.freeze({
    outcome: 'error',
    code: '23514',
    message: 'TRAINING_ATTEMPT_ANSWER_IMMUTABLE',
  }),
  changedSlotBinding: Object.freeze({
    outcome: 'error',
    code: '23514',
    message: 'TRAINING_CONTINUATION_SLOT_IMMUTABLE',
  }),
  neverServedSnapshot: Object.freeze({
    outcome: 'result',
    code: 'TRAINING_DECISION_NOT_SERVED',
  }),
  nonV4PredecessorId: Object.freeze({
    outcome: 'result',
    code: 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID',
  }),
  nullOwnerLegacyEvent: Object.freeze({
    outcome: 'result',
    code: 'TRAINING_LEGACY_PROMOTION_INPUT_INVALID',
  }),
});

export function redactReceiptMaterial(value) {
  return String(value ?? '')
    .replace(RECEIPT_MATERIAL_RE, (_match, prefix) => `${prefix}[REDACTED_GRADING_RECEIPT]`)
    .replace(JWT_MATERIAL_RE, (_match, prefix) => `${prefix}[REDACTED_JWT]`)
    .replace(SECRET_PREFIX_RE_GLOBAL, (_match, prefix) => `${prefix}[REDACTED_CREDENTIAL]`)
    .replace(CONNECTION_CREDENTIAL_RE, (match) =>
      match.replace(/\/\/.*@/, '//[REDACTED_CREDENTIALS]@')
    );
}

const PRE_ANSWER_PRIVATE_SELECTION_KEYS = new Set([
  'correctanswer',
  'correctanswertext',
  'answerkey',
  'bestaction',
  'bestactionid',
  'preferredaction',
  'preferredactionid',
  'optimalaction',
  'optimalactionid',
  'explanation',
  'structuredexplanation',
  'mistakefeedback',
  'feedback',
  'gtofrequencies',
  'frequencies',
  'rawfrequencies',
  'actionevs',
  'evdata',
  'solverstrategy',
  'solverpolicy',
  'distribution',
  'strategy',
  'gtodata',
  'originalcorrect',
  'originalfrequencies',
  'originalactionevs',
  'originaloptions',
  'difficultymembers',
  'nextstreetcontinuation',
  'nextstreetcontinuationaction',
  'contractdistractor',
  'solverrank',
  'hint',
  'tip',
  'recommendation',
  'recommended',
  'isrecommended',
  'isoptimal',
  'privateselection',
  'canonicalanswer',
]);

const RAW_PRIVATE_SELECTION_KEYS = new Set([
  'answerkey',
  'solverpolicy',
  'solverstrategy',
  'difficultymembers',
  'originalcorrect',
  'originalfrequencies',
  'originalactionevs',
  'originaloptions',
  'nextstreetcontinuationaction',
  'privateselection',
  'canonicalanswer',
]);

function normalizedSelectionField(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function walkPublicPayload(value, visit, path = 'payload') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPublicPayload(item, visit, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, `${path}.${key}`);
    walkPublicPayload(child, visit, `${path}.${key}`);
  }
}

export function assertNoPreAnswerPrivateSelectionFields(value, label = 'public pre-answer payload') {
  walkPublicPayload(value, (key, path) => {
    const normalized = normalizedSelectionField(key);
    const permittedReceiptContext = key === '_gradingContext';
    assert.equal(
      (!String(key).startsWith('_') || permittedReceiptContext)
        && !PRE_ANSWER_PRIVATE_SELECTION_KEYS.has(normalized),
      true,
      `${label} leaked a private selection field at ${path}`,
    );
  }, label);
  return value;
}

function assertNoRawPrivateSelectionFields(value, label) {
  walkPublicPayload(value, (key, path) => {
    const normalized = normalizedSelectionField(key);
    assert.equal(
      (!String(key).startsWith('_') || key === '_gradingContext')
        && !RAW_PRIVATE_SELECTION_KEYS.has(normalized),
      true,
      `${label} leaked a raw private selection field at ${path}`,
    );
  }, label);
}

function assertOnlyAllowedKeys(value, allowed, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  assert.deepEqual(unexpected, [], `${label} contains an unintended field`);
}

export function assertRevealedAnswerPayloadContainsOnlyIntendedFields(payload, label = 'answer') {
  assertOnlyAllowedKeys(payload, [
    'success', 'idempotentReplay', 'submissionId', 'sessionId', 'attemptId', 'snapshotKey',
    'handOrdinal', 'decisionOrdinal', 'countsTowardCompletion', 'practiceOnly', 'evidence',
    'feedback',
  ], `${label} response`);
  assertOnlyAllowedKeys(payload?.evidence, [
    'solverVerified', 'classification', 'evLossMeasured', 'isCorrect', 'gradeMode',
    'difficultyMode', 'rng', 'canonicalSolverClassification', 'selectedFrequency',
    'optimalFrequency', 'evLoss', 'optimalAction',
  ], `${label} evidence`);
  assertOnlyAllowedKeys(payload?.feedback, [
    'correctAnswer', 'correctAnswerText', 'explanation', 'structuredExplanation',
    'gtoFrequencies', 'frequencies', 'rawFrequencies', 'evData', 'actionEVs',
    'solverVerified', 'dataQuality', 'continuation',
  ], `${label} feedback`);
  if (payload.feedback.continuation !== null && payload.feedback.continuation !== undefined) {
    assertOnlyAllowedKeys(
      payload.feedback.continuation,
      ['actionId', 'sourceAction'],
      `${label} continuation feedback`,
    );
  }
  assertNoRawPrivateSelectionFields(payload, label);
  return payload;
}

export function validateImmutableDeploymentUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error(
      'TRAINING_PHASE6_DELIVERY_BASE_URL must be an absolute immutable Vercel deployment URL.'
    );
  }
  assert.equal(url.protocol, 'https:', 'delivery attestation requires HTTPS');
  assert.match(
    url.hostname,
    /^hub-vanguard-[a-z0-9]+-smarter-poker\.vercel\.app$/i,
    'delivery attestation requires an immutable Hub Vanguard deployment owned by Smarter.Poker'
  );
  assert.equal(url.pathname, '/', 'immutable deployment URL must not include a path');
  assert.equal(url.search, '', 'immutable deployment URL must not include a query');
  assert.equal(url.hash, '', 'immutable deployment URL must not include a fragment');
  assert.equal(url.username, '', 'immutable deployment URL must not contain credentials');
  assert.equal(url.password, '', 'immutable deployment URL must not contain credentials');
  return url.origin;
}

export function readAttestationConfig(env = process.env) {
  return validateAttestationConfig({
    baseUrl: env.TRAINING_PHASE6_DELIVERY_BASE_URL,
    expectedBuild: env.TRAINING_PHASE6_DELIVERY_EXPECTED_BUILD,
    authState:
      env.TRAINING_PHASE6_DELIVERY_AUTH_STATE || resolve(ROOT, 'playwright/.auth/user.json'),
    output: env.TRAINING_PHASE6_DELIVERY_EVIDENCE,
    expectedAuditUserId: env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID,
    writeAcknowledgement: env.TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_WRITES,
    protectionBypassSecret: env.TRAINING_PHASE6_VERCEL_PROTECTION_BYPASS_SECRET,
  });
}

export function validateAttestationConfig(config) {
  const expectedBuild = String(config?.expectedBuild || '').trim();
  assert.match(
    expectedBuild,
    SHA40_RE,
    'TRAINING_PHASE6_DELIVERY_EXPECTED_BUILD must be the exact 40-character deployed commit SHA'
  );
  assert.equal(
    config?.writeAcknowledgement,
    WRITE_ACKNOWLEDGEMENT,
    `Refusing production writes without TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_WRITES=${WRITE_ACKNOWLEDGEMENT}`
  );
  const expectedAuditUserId = String(config?.expectedAuditUserId || '').trim();
  assert.match(
    expectedAuditUserId,
    UUID_V4_RE,
    'TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID must be the designated audit account canonical lowercase UUID v4'
  );
  const authState = resolve(String(config?.authState || ''));
  assert.ok(existsSync(authState), `Authenticated storage state is missing: ${authState}`);
  assert.ok(
    typeof config?.output === 'string' && config.output.trim().length > 0,
    'TRAINING_PHASE6_DELIVERY_EVIDENCE must be an explicit unique output path'
  );
  return {
    baseUrl: validateImmutableDeploymentUrl(config?.baseUrl),
    expectedBuild: expectedBuild.toLowerCase(),
    expectedAuditUserId,
    authState,
    output: resolve(config.output.trim()),
    writeAcknowledgement: WRITE_ACKNOWLEDGEMENT,
    protectionBypassSecret:
      typeof config?.protectionBypassSecret === 'string' ? config.protectionBypassSecret : '',
  };
}

export function protectionBypassHeaders(targetOrigin, requestOrigin, secret) {
  if (typeof secret !== 'string' || secret.length === 0) return {};
  const canonicalTargetOrigin = validateImmutableDeploymentUrl(targetOrigin);
  if (requestOrigin !== canonicalTargetOrigin) return {};
  return { [VERCEL_PROTECTION_BYPASS_HEADER]: secret };
}

export async function continueRouteWithProtectionBypass(route, targetOrigin, secret) {
  const request = route.request();
  const requestOrigin = new URL(request.url()).origin;
  const bypassHeaders = protectionBypassHeaders(targetOrigin, requestOrigin, secret);

  if (!Object.hasOwn(bypassHeaders, VERCEL_PROTECTION_BYPASS_HEADER)) {
    await route.continue();
    return;
  }

  // route.continue({ headers }) applies the overridden headers to redirects as
  // well. Fetch exactly one response instead, then fulfill the intercepted
  // browser request. A redirect is subsequently issued by the browser as a
  // fresh request and is re-evaluated by this exact-origin boundary.
  const response = await route.fetch({
    headers: { ...request.headers(), ...bypassHeaders },
    maxRedirects: 0,
  });
  await route.fulfill({ response });
}

function isPathInsideRepository(path) {
  const candidate = resolve(path);
  const fromRoot = relative(ROOT, candidate);
  return (
    fromRoot === '' ||
    (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..' && !isAbsolute(fromRoot))
  );
}

function readPrivateCredential({ directValue, filePath, label }) {
  const hasDirect = typeof directValue === 'string' && directValue.length > 0;
  const hasFile = typeof filePath === 'string' && filePath.length > 0;
  assert.notEqual(
    hasDirect,
    hasFile,
    `${label} requires exactly one direct environment value or out-of-repository credential file`
  );
  if (hasDirect) return directValue.trim();
  const absolute = realpathSync(resolve(filePath));
  assert.equal(isAbsolute(filePath), true, `${label} credential file path must be absolute`);
  assert.equal(
    isPathInsideRepository(absolute),
    false,
    `${label} credential file must remain outside the repository`
  );
  const mode = statSync(absolute).mode & 0o777;
  assert.equal(mode & 0o077, 0, `${label} credential file must not be group/world accessible`);
  const value = readFileSync(absolute, 'utf8').trim();
  assert.ok(value.length > 0, `${label} credential file is empty`);
  return value;
}

function validateDatabaseCredential(value, expectedProjectRef = null) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error(
      'Phase 6 administrator database credential is not a PostgreSQL connection URL.'
    );
  }
  assert.ok(
    parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:',
    'Phase 6 administrator database credential must use postgres:// or postgresql://'
  );
  assert.ok(
    parsed.hostname && parsed.username && parsed.password,
    'Phase 6 administrator database credential is incomplete'
  );
  if (expectedProjectRef) {
    assert.match(expectedProjectRef, /^[a-z0-9]{20}$/, 'expected Supabase project ref is invalid');
    const directHost = parsed.hostname === `db.${expectedProjectRef}.supabase.co`;
    const poolerHost =
      parsed.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(parsed.username).endsWith(`.${expectedProjectRef}`);
    assert.ok(
      directHost || poolerHost,
      'Phase 6 administrator database credential targets a different Supabase project'
    );
  }
  return String(value).trim();
}

export function readMachineCollectorConfig(env = process.env) {
  const publicEvidencePath = String(env.TRAINING_PHASE6_DELIVERY_EVIDENCE || '').trim();
  const adminEvidencePath = String(env.TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE || '').trim();
  const finalEvidencePath = String(env.TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE || '').trim();
  assert.ok(
    publicEvidencePath,
    'TRAINING_PHASE6_DELIVERY_EVIDENCE is required for machine collection'
  );
  assert.ok(
    adminEvidencePath,
    'TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE is required for machine collection'
  );
  assert.ok(
    finalEvidencePath,
    'TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE is required for machine collection'
  );
  const paths = [publicEvidencePath, adminEvidencePath, finalEvidencePath].map((path) =>
    resolve(path)
  );
  assert.equal(
    new Set(paths).size,
    paths.length,
    'public, administrator, and final evidence paths must be distinct'
  );
  assert.equal(existsSync(paths[0]), true, 'immutable public evidence file does not exist');
  assert.equal(
    existsSync(paths[1]),
    false,
    'refusing to overwrite existing administrator evidence'
  );
  assert.equal(existsSync(paths[2]), false, 'refusing to overwrite existing final evidence');

  const expectedAuditUserId = String(
    env.TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID || ''
  ).trim();
  assert.match(
    expectedAuditUserId,
    UUID_V4_RE,
    'TRAINING_PHASE6_DELIVERY_EXPECTED_AUDIT_USER_ID must be the designated audit account canonical lowercase UUID v4'
  );
  assert.equal(
    env.TRAINING_PHASE6_ADMIN_COLLECT_ACKNOWLEDGEMENT,
    ADMIN_COLLECTOR_ACKNOWLEDGEMENT,
    `Refusing administrator collection without TRAINING_PHASE6_ADMIN_COLLECT_ACKNOWLEDGEMENT=${ADMIN_COLLECTOR_ACKNOWLEDGEMENT}`
  );
  assert.equal(
    env.TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT,
    ADMIN_CLOSEOUT_ACKNOWLEDGEMENT,
    `Refusing administrator closeout without TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT=${ADMIN_CLOSEOUT_ACKNOWLEDGEMENT}`
  );

  const expectedSupabaseProjectRef = String(
    env.TRAINING_PHASE6_EXPECTED_SUPABASE_PROJECT_REF || ''
  ).trim();
  assert.match(
    expectedSupabaseProjectRef,
    /^[a-z0-9]{20}$/,
    'TRAINING_PHASE6_EXPECTED_SUPABASE_PROJECT_REF is required'
  );
  const databaseUrl = validateDatabaseCredential(
    readPrivateCredential({
      directValue: env.TRAINING_PHASE6_ADMIN_DATABASE_URL,
      filePath: env.TRAINING_PHASE6_ADMIN_DATABASE_CREDENTIAL_FILE,
      label: 'Phase 6 administrator database',
    }),
    expectedSupabaseProjectRef
  );
  const vercelToken = readPrivateCredential({
    directValue: env.TRAINING_PHASE6_VERCEL_TOKEN,
    filePath: env.TRAINING_PHASE6_VERCEL_TOKEN_FILE,
    label: 'Phase 6 Vercel',
  });
  assert.ok(
    vercelToken.length >= 20 && !/\s/.test(vercelToken),
    'Phase 6 Vercel credential has an invalid shape'
  );
  const vercelProject = String(env.TRAINING_PHASE6_VERCEL_PROJECT || '').trim();
  assert.ok(vercelProject.length > 0, 'TRAINING_PHASE6_VERCEL_PROJECT is required');
  assert.equal(
    env.TRAINING_PHASE6_VERCEL_EXECUTABLE,
    undefined,
    'TRAINING_PHASE6_VERCEL_EXECUTABLE overrides are forbidden for finalizing collection'
  );

  const predecessorMode = String(env.TRAINING_PHASE6_PREDECESSOR_MODE || '').trim();
  assert.ok(
    predecessorMode === 'authentic_artifact' || predecessorMode === 'controlled_rehearsal',
    'TRAINING_PHASE6_PREDECESSOR_MODE must be authentic_artifact or controlled_rehearsal'
  );
  const predecessor = { mode: predecessorMode };
  if (predecessorMode === 'controlled_rehearsal') {
    assert.equal(
      env.TRAINING_PHASE6_PREDECESSOR_REHEARSAL_ACKNOWLEDGEMENT,
      CONTROLLED_REHEARSAL_ACKNOWLEDGEMENT,
      `Controlled rehearsal requires TRAINING_PHASE6_PREDECESSOR_REHEARSAL_ACKNOWLEDGEMENT=${CONTROLLED_REHEARSAL_ACKNOWLEDGEMENT}`
    );
    predecessor.rehearsalAcknowledged = true;
  } else {
    const artifactInput = String(env.TRAINING_PHASE6_PREDECESSOR_ARTIFACT || '');
    const publicKeyInput = String(env.TRAINING_PHASE6_PREDECESSOR_PUBLIC_KEY || '');
    assert.equal(isAbsolute(artifactInput), true, 'predecessor artifact path must be absolute');
    assert.equal(isAbsolute(publicKeyInput), true, 'predecessor public-key path must be absolute');
    const artifactPath = realpathSync(resolve(artifactInput));
    const publicKeyPath = realpathSync(resolve(publicKeyInput));
    assert.equal(
      isPathInsideRepository(artifactPath),
      false,
      'predecessor artifact must remain outside the repository'
    );
    assert.equal(
      isPathInsideRepository(publicKeyPath),
      false,
      'predecessor public key must remain outside the repository'
    );
    assert.equal(existsSync(artifactPath), true, 'authentic predecessor artifact does not exist');
    assert.equal(existsSync(publicKeyPath), true, 'trusted predecessor public key does not exist');
    assert.equal(
      statSync(artifactPath).mode & 0o077,
      0,
      'authentic predecessor artifact must not be group/world accessible'
    );
    const trustedKeySha256 = String(env.TRAINING_PHASE6_PREDECESSOR_PUBLIC_KEY_SHA256 || '')
      .trim()
      .toLowerCase();
    assert.match(trustedKeySha256, SHA256_RE, 'trusted predecessor public-key SHA-256 is required');
    predecessor.artifactPath = artifactPath;
    predecessor.publicKeyPath = publicKeyPath;
    predecessor.trustedKeySha256 = trustedKeySha256;
  }

  return {
    publicEvidencePath: paths[0],
    adminEvidencePath: paths[1],
    finalEvidencePath: paths[2],
    expectedAuditUserId,
    expectedSupabaseProjectRef,
    databaseUrl,
    vercelToken,
    vercelProject,
    vercelScope: String(env.TRAINING_PHASE6_VERCEL_SCOPE || '').trim() || null,
    vercelExecutable: 'vercel',
    predecessor,
    acknowledgement: ADMIN_CLOSEOUT_ACKNOWLEDGEMENT,
  };
}

export function decodeReceiptObservation(receipt) {
  assert.equal(typeof receipt, 'string', 'grading receipt must be a string');
  const parts = receipt.split('.');
  assert.equal(parts.length, 2, 'grading receipt must contain one payload and one signature');
  assert.ok(/^[A-Za-z0-9_-]{43}$/.test(parts[1]), 'grading receipt signature has the wrong shape');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    throw new Error('grading receipt payload could not be decoded for census');
  }
  assert.ok(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    'grading receipt payload is invalid'
  );
  assert.ok(payload.jti, 'grading receipt payload omitted jti');
  const receiptJti = String(payload.jti);
  const attemptScopedMatch = receiptJti.match(ATTEMPT_SCOPED_JTI_RE);
  if (receiptJti.startsWith('training-attempt:')) {
    assert.ok(
      attemptScopedMatch,
      'attempt-scoped receipt jti must use the canonical UUID v4 and ordinal format'
    );
  }
  if (attemptScopedMatch) {
    assert.match(
      String(payload.attemptId || ''),
      UUID_V4_RE,
      'attempt-scoped receipt omitted a canonical UUID v4 attempt'
    );
    assert.ok(
      Number.isSafeInteger(payload.handOrdinal) && payload.handOrdinal >= 1,
      'attempt-scoped receipt hand ordinal must be a positive safe integer'
    );
    assert.ok(
      Number.isSafeInteger(payload.decisionOrdinal) && payload.decisionOrdinal >= 1,
      'attempt-scoped receipt decision ordinal must be a positive safe integer'
    );
    assert.equal(
      attemptScopedMatch[1],
      String(payload.attemptId || ''),
      'attempt-scoped receipt jti embeds a different attempt'
    );
    assert.equal(
      Number(attemptScopedMatch[2]),
      Number(payload.handOrdinal),
      'attempt-scoped receipt jti embeds a different hand'
    );
    assert.equal(
      Number(attemptScopedMatch[3]),
      Number(payload.decisionOrdinal),
      'attempt-scoped receipt jti embeds a different decision'
    );
    assert.equal(
      receiptJti,
      `training-attempt:${payload.attemptId}:hand:${payload.handOrdinal}:decision:${payload.decisionOrdinal}`,
      'attempt-scoped receipt jti is not canonical'
    );
  }
  return {
    version: payload.v ?? null,
    jti: String(payload.jti),
    attemptId: String(payload.attemptId || ''),
    snapshotKey: String(payload.snapshotKey || ''),
    questionId: String(payload.questionId || ''),
    sessionId: String(payload.sessionId || ''),
    sessionKind: String(payload.sessionKind || ''),
    sessionTargetHands: Number(payload.sessionTargetHands),
    handOrdinal: Number(payload.handOrdinal),
    decisionOrdinal: Number(payload.decisionOrdinal),
    countsTowardCompletion: payload.countsTowardCompletion,
    practiceOnly: payload.practiceOnly,
    difficultyMode: String(payload.difficultyMode || ''),
    issuedAt: Number(payload.iat),
    expiresAt: Number(payload.exp),
    format: PREDECESSOR_JTI_RE.test(String(payload.jti))
      ? 'predecessor_uuid_v4'
      : ATTEMPT_SCOPED_JTI_RE.test(String(payload.jti))
        ? 'attempt_scoped_serve'
        : 'unknown',
    // This is an observation only. The API verifies the signature; this
    // harness deliberately has no signing secret and cannot mint receipts.
    signatureVerifiedByHarness: false,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function publicQuestionFingerprint(question) {
  const copy = structuredClone(question);
  delete copy._gradingContext;
  return createHash('sha256').update(stableJson(copy)).digest('hex');
}

export function validateFullAttemptDelivery(
  payload,
  {
    sessionId,
    gameId = GAME_ID,
    level = LEVEL,
    difficultyMode = EXPECTED_DIFFICULTY_MODE,
    continuationCohortPrecommit = null,
  } = {}
) {
  assertNoPreAnswerPrivateSelectionFields(payload, 'initial batch response');
  assert.equal(payload?.success, true, 'initial batch response did not succeed');
  assert.equal(payload?.gameId, gameId, 'initial batch returned the wrong game');
  assert.equal(Number(payload?.level), level, 'initial batch returned the wrong level');
  assert.equal(
    String(payload?.sessionId || ''),
    String(sessionId || ''),
    'initial batch returned the wrong session'
  );
  assert.match(
    String(payload?.attemptId || ''),
    UUID_V4_RE,
    'initial batch omitted a canonical UUID v4 attempt id'
  );
  assert.equal(payload?.sessionKind, 'campaign', 'initial batch was not a campaign');
  assert.equal(
    payload?.targetHands,
    TARGET_HANDS,
    `initial batch targetHands must be exactly ${TARGET_HANDS}`
  );
  assert.ok(Array.isArray(payload?.questions), 'initial batch omitted questions');
  assert.equal(
    payload.questions.length,
    payload.targetHands,
    'initial batch did not deliver the complete attempt'
  );
  assert.equal(payload.count, payload.targetHands, 'initial batch count did not equal targetHands');
  if (continuationCohortPrecommit) {
    assert.deepEqual(
      payload.attestationContinuationCohort,
      continuationCohortPrecommit,
      'initial batch did not echo the public continuation cohort precommit exactly'
    );
    assert.deepEqual(
      Object.keys(payload.attestationContinuationCohort).sort(),
      ['commitment', 'selectionRule', 'version'],
      'continuation cohort response leaked a private selection field'
    );
  }

  const questionIds = new Set();
  const snapshotKeys = new Set();
  const submissionIds = new Set();
  const observations = payload.questions.map((question, index) => {
    const context = question?._gradingContext;
    assert.ok(context?.receipt, `question ${index + 1} omitted its grading receipt`);
    assert.ok(
      SHA256_RE.test(String(question?.policyChecksum || '')),
      `question ${index + 1} omitted its policy checksum`
    );
    assert.equal(context.sessionId, sessionId, `question ${index + 1} session mismatch`);
    assert.equal(context.attemptId, payload.attemptId, `question ${index + 1} attempt mismatch`);
    assert.equal(context.sessionKind, 'campaign', `question ${index + 1} session kind mismatch`);
    assert.equal(
      context.sessionTargetHands,
      payload.targetHands,
      `question ${index + 1} target mismatch`
    );
    assert.equal(context.handOrdinal, index + 1, `question ${index + 1} hand ordinal mismatch`);
    assert.equal(context.decisionOrdinal, 1, `question ${index + 1} decision ordinal mismatch`);
    assert.equal(
      context.countsTowardCompletion,
      true,
      `question ${index + 1} must count toward completion`
    );
    assert.equal(context.practiceOnly, false, `question ${index + 1} must not be practice-only`);
    assert.equal(
      context.difficultyMode,
      difficultyMode,
      `question ${index + 1} returned the wrong difficulty mode`
    );
    assert.ok(
      Array.isArray(question.options) && question.options.length >= 2,
      `question ${index + 1} has no choices`
    );
    const observation = decodeReceiptObservation(context.receipt);
    assert.equal(observation.version, 2, `question ${index + 1} receipt version mismatch`);
    assert.equal(
      observation.jti,
      context.submissionId,
      `question ${index + 1} submission mismatch`
    );
    assert.equal(
      observation.attemptId,
      payload.attemptId,
      `question ${index + 1} receipt attempt mismatch`
    );
    assert.equal(
      observation.snapshotKey,
      context.snapshotKey,
      `question ${index + 1} receipt snapshot mismatch`
    );
    assert.equal(
      observation.questionId,
      String(question.id),
      `question ${index + 1} receipt question mismatch`
    );
    assert.equal(
      observation.sessionId,
      sessionId,
      `question ${index + 1} receipt session mismatch`
    );
    assert.equal(
      observation.sessionKind,
      'campaign',
      `question ${index + 1} receipt session kind mismatch`
    );
    assert.equal(
      observation.sessionTargetHands,
      TARGET_HANDS,
      `question ${index + 1} receipt target mismatch`
    );
    assert.equal(observation.handOrdinal, index + 1, `question ${index + 1} receipt hand mismatch`);
    assert.equal(observation.decisionOrdinal, 1, `question ${index + 1} receipt decision mismatch`);
    assert.equal(
      observation.countsTowardCompletion,
      true,
      `question ${index + 1} receipt completion binding mismatch`
    );
    assert.equal(
      observation.practiceOnly,
      false,
      `question ${index + 1} receipt practice binding mismatch`
    );
    assert.equal(
      observation.difficultyMode,
      difficultyMode,
      `question ${index + 1} receipt difficulty mismatch`
    );
    assert.ok(
      Number.isFinite(observation.issuedAt),
      `question ${index + 1} receipt issue time is invalid`
    );
    assert.ok(
      observation.expiresAt > observation.issuedAt,
      `question ${index + 1} receipt expiry is invalid`
    );
    assert.equal(
      observation.format,
      'attempt_scoped_serve',
      `question ${index + 1} did not use an attempt-scoped serve key`
    );
    assert.equal(
      UUID_V4_RE.test(observation.jti),
      false,
      'new delivery unexpectedly used a predecessor UUID receipt id'
    );
    assert.equal(
      questionIds.has(String(question.id)),
      false,
      `duplicate question id ${question.id}`
    );
    assert.equal(
      snapshotKeys.has(String(context.snapshotKey)),
      false,
      `duplicate snapshot key ${context.snapshotKey}`
    );
    assert.equal(
      submissionIds.has(String(context.submissionId)),
      false,
      `duplicate submission id ${context.submissionId}`
    );
    questionIds.add(String(question.id));
    snapshotKeys.add(String(context.snapshotKey));
    submissionIds.add(String(context.submissionId));
    return observation;
  });
  return { observations, questionIds: [...questionIds] };
}

export function compareReissuedManifest(initial, reissued) {
  assertNoPreAnswerPrivateSelectionFields(reissued, 'reissue response');
  assert.equal(reissued?.success, true, 'reissue response did not succeed');
  assert.equal(
    reissued?.recoveredExistingAttempt,
    true,
    'reissue did not recover the existing attempt'
  );
  assert.equal(reissued?.attemptId, initial.attemptId, 'reissue changed the attempt id');
  assert.equal(reissued?.sessionId, initial.sessionId, 'reissue changed the session id');
  assert.equal(reissued?.targetHands, initial.targetHands, 'reissue changed targetHands');
  assert.equal(reissued?.count, initial.questions.length, 'reissue returned a partial manifest');
  assert.equal(
    reissued?.questions?.length,
    initial.questions.length,
    'reissue changed manifest length'
  );
  return reissued.questions.map((question, index) => {
    const before = initial.questions[index];
    const beforeContext = before._gradingContext;
    const afterContext = question?._gradingContext;
    assert.equal(question.id, before.id, `reissue changed question ${index + 1}`);
    assert.equal(
      publicQuestionFingerprint(question),
      publicQuestionFingerprint(before),
      `reissue changed public question ${index + 1}`
    );
    for (const field of [
      'submissionId',
      'sessionId',
      'attemptId',
      'snapshotKey',
      'sessionKind',
      'sessionTargetHands',
      'handOrdinal',
      'decisionOrdinal',
      'countsTowardCompletion',
      'practiceOnly',
      'difficultyMode',
      'rngRolls',
      'solverEvidenceAvailable',
    ]) {
      assert.deepEqual(
        afterContext?.[field],
        beforeContext?.[field],
        `reissue changed ${field} for hand ${index + 1}`
      );
    }
    const observation = decodeReceiptObservation(afterContext.receipt);
    assert.equal(observation.version, 2, `reissued hand ${index + 1} receipt version mismatch`);
    assert.equal(
      observation.format,
      'attempt_scoped_serve',
      `reissued hand ${index + 1} receipt format mismatch`
    );
    assert.equal(
      observation.jti,
      afterContext.submissionId,
      `reissued hand ${index + 1} submission mismatch`
    );
    assert.equal(
      observation.attemptId,
      afterContext.attemptId,
      `reissued hand ${index + 1} attempt mismatch`
    );
    assert.equal(
      observation.snapshotKey,
      afterContext.snapshotKey,
      `reissued hand ${index + 1} snapshot mismatch`
    );
    assert.equal(
      observation.questionId,
      String(question.id),
      `reissued hand ${index + 1} question mismatch`
    );
    assert.equal(
      observation.sessionId,
      afterContext.sessionId,
      `reissued hand ${index + 1} session mismatch`
    );
    assert.equal(
      observation.sessionKind,
      afterContext.sessionKind,
      `reissued hand ${index + 1} session kind mismatch`
    );
    assert.equal(
      observation.sessionTargetHands,
      afterContext.sessionTargetHands,
      `reissued hand ${index + 1} target mismatch`
    );
    assert.equal(
      observation.handOrdinal,
      afterContext.handOrdinal,
      `reissued hand ${index + 1} hand ordinal mismatch`
    );
    assert.equal(
      observation.decisionOrdinal,
      afterContext.decisionOrdinal,
      `reissued hand ${index + 1} decision ordinal mismatch`
    );
    assert.equal(
      observation.countsTowardCompletion,
      afterContext.countsTowardCompletion,
      `reissued hand ${index + 1} completion binding mismatch`
    );
    assert.equal(
      observation.practiceOnly,
      afterContext.practiceOnly,
      `reissued hand ${index + 1} practice binding mismatch`
    );
    assert.equal(
      observation.difficultyMode,
      afterContext.difficultyMode,
      `reissued hand ${index + 1} difficulty mismatch`
    );
    return {
      questionId: String(question.id),
      handOrdinal: afterContext.handOrdinal,
      snapshotKey: afterContext.snapshotKey,
      submissionId: afterContext.submissionId,
      publicQuestionDigest: publicQuestionFingerprint(question),
      receiptBytesIdentical: afterContext.receipt === beforeContext.receipt,
    };
  });
}

export function buildAnswerRequest(question, selectedAnswer) {
  const context = question?._gradingContext;
  assert.ok(
    context?.receipt && context?.submissionId && context?.attemptId && context?.snapshotKey,
    'question lacks signed grading context'
  );
  assert.ok(
    SHA256_RE.test(String(question?.policyChecksum || '')),
    'question lacks canonical policy checksum'
  );
  assert.ok(
    question.options?.some((option) => String(option?.id ?? option) === String(selectedAnswer)),
    'selected answer is not a public option'
  );
  return {
    gameId: GAME_ID,
    questionId: question.id,
    selectedAnswer,
    policyChecksum: question.policyChecksum,
    gradingReceipt: context.receipt,
    submissionId: context.submissionId,
    sessionId: context.sessionId,
    attemptId: context.attemptId,
    snapshotKey: context.snapshotKey,
    sessionKind: context.sessionKind,
    sessionTargetHands: context.sessionTargetHands,
    handOrdinal: context.handOrdinal,
    decisionOrdinal: context.decisionOrdinal,
    countsTowardCompletion: context.countsTowardCompletion,
    practiceOnly: context.practiceOnly,
    gradingMode: context.difficultyMode,
  };
}

export function immutableAnswerEvidence(payload) {
  assertRevealedAnswerPayloadContainsOnlyIntendedFields(payload, 'record-question');
  assert.equal(payload?.success, true, 'answer response did not succeed');
  assert.ok(
    payload?.feedback && typeof payload?.evidence?.isCorrect === 'boolean',
    'answer omitted authoritative feedback'
  );
  assert.ok(String(payload?.submissionId || '').length > 0, 'answer omitted submissionId');
  assert.ok(String(payload?.sessionId || '').length > 0, 'answer omitted sessionId');
  assert.match(
    String(payload?.attemptId || ''),
    UUID_V4_RE,
    'answer omitted canonical UUID v4 attemptId'
  );
  assert.match(String(payload?.snapshotKey || ''), SHA256_RE, 'answer omitted snapshotKey');
  assert.ok(
    Number.isInteger(payload?.handOrdinal) && payload.handOrdinal >= 1,
    'answer omitted handOrdinal'
  );
  assert.ok(
    Number.isInteger(payload?.decisionOrdinal) && payload.decisionOrdinal >= 1,
    'answer omitted decisionOrdinal'
  );
  assert.equal(
    typeof payload?.countsTowardCompletion,
    'boolean',
    'answer omitted completion binding'
  );
  assert.equal(typeof payload?.practiceOnly, 'boolean', 'answer omitted practice binding');
  return {
    submissionId: payload.submissionId,
    sessionId: payload.sessionId,
    attemptId: payload.attemptId,
    snapshotKey: payload.snapshotKey,
    handOrdinal: payload.handOrdinal,
    decisionOrdinal: payload.decisionOrdinal,
    countsTowardCompletion: payload.countsTowardCompletion,
    practiceOnly: payload.practiceOnly,
    evidence: payload.evidence,
    feedback: payload.feedback,
  };
}

export function validateAnswerBinding(payload, question, label = 'answer') {
  immutableAnswerEvidence(payload);
  const context = question?._gradingContext;
  assert.ok(context, `${label} question omitted grading context`);
  for (const field of [
    'submissionId',
    'sessionId',
    'attemptId',
    'snapshotKey',
    'handOrdinal',
    'decisionOrdinal',
    'countsTowardCompletion',
    'practiceOnly',
  ]) {
    assert.deepEqual(payload[field], context[field], `${label} changed ${field}`);
  }
  return payload;
}

export function assertExactReplay(first, replay, label = 'answer') {
  assert.equal(replay?.idempotentReplay, true, `${label} was not an idempotent replay`);
  assert.deepEqual(
    immutableAnswerEvidence(replay),
    immutableAnswerEvidence(first),
    `${label} replay changed immutable evidence`
  );
}

export function validateContinuation(parentQuestion, parentAnswer, first, replay) {
  assertNoPreAnswerPrivateSelectionFields(first, 'next-street response');
  assertNoPreAnswerPrivateSelectionFields(replay, 'next-street replay response');
  const parent = parentQuestion._gradingContext;
  const child = first?.question?._gradingContext;
  assert.equal(first?.success, true, 'next-street response did not succeed');
  assert.ok(
    first?.question && child?.receipt,
    'next-street response omitted a signed child question'
  );
  assert.equal(first.attemptId, parent.attemptId, 'continuation changed attempt');
  assert.equal(first.sessionId, parent.sessionId, 'continuation changed session');
  assert.equal(first.handOrdinal, parent.handOrdinal, 'continuation changed hand');
  assert.equal(
    first.decisionOrdinal,
    parent.decisionOrdinal + 1,
    'continuation did not advance exactly one decision'
  );
  assert.equal(child.attemptId, parent.attemptId, 'child receipt changed attempt');
  assert.equal(child.sessionId, parent.sessionId, 'child receipt changed session');
  assert.equal(child.sessionKind, parent.sessionKind, 'child receipt changed session kind');
  assert.equal(
    child.sessionTargetHands,
    parent.sessionTargetHands,
    'child receipt changed target hands'
  );
  assert.equal(child.handOrdinal, parent.handOrdinal, 'child receipt changed hand');
  assert.equal(
    child.decisionOrdinal,
    parent.decisionOrdinal + 1,
    'child receipt decision mismatch'
  );
  assert.equal(child.countsTowardCompletion, false, 'continuation must not count as another hand');
  assert.equal(child.practiceOnly, parent.practiceOnly, 'child receipt changed practice binding');
  assert.equal(
    child.difficultyMode,
    parent.difficultyMode,
    'child receipt changed difficulty mode'
  );
  assert.notEqual(child.snapshotKey, parent.snapshotKey, 'continuation reused the parent snapshot');
  assert.notEqual(
    child.submissionId,
    parent.submissionId,
    'continuation reused the parent submission'
  );
  assert.ok(
    SHA256_RE.test(String(first.question.policyChecksum || '')),
    'continuation omitted its policy checksum'
  );
  const childReceipt = decodeReceiptObservation(child.receipt);
  assert.equal(childReceipt.version, 2, 'continuation receipt version mismatch');
  assert.equal(
    childReceipt.format,
    'attempt_scoped_serve',
    'continuation receipt was not attempt-scoped'
  );
  assert.equal(childReceipt.jti, child.submissionId, 'continuation submission mismatch');
  assert.equal(childReceipt.attemptId, child.attemptId, 'continuation receipt attempt mismatch');
  assert.equal(
    childReceipt.snapshotKey,
    child.snapshotKey,
    'continuation receipt snapshot mismatch'
  );
  assert.equal(
    childReceipt.questionId,
    String(first.question.id),
    'continuation receipt question mismatch'
  );
  assert.equal(childReceipt.sessionId, child.sessionId, 'continuation receipt session mismatch');
  assert.equal(
    childReceipt.sessionKind,
    child.sessionKind,
    'continuation receipt session kind mismatch'
  );
  assert.equal(
    childReceipt.sessionTargetHands,
    child.sessionTargetHands,
    'continuation receipt target mismatch'
  );
  assert.equal(childReceipt.handOrdinal, child.handOrdinal, 'continuation receipt hand mismatch');
  assert.equal(
    childReceipt.decisionOrdinal,
    child.decisionOrdinal,
    'continuation receipt decision mismatch'
  );
  assert.equal(
    childReceipt.countsTowardCompletion,
    child.countsTowardCompletion,
    'continuation receipt completion binding mismatch'
  );
  assert.equal(
    childReceipt.practiceOnly,
    child.practiceOnly,
    'continuation receipt practice binding mismatch'
  );
  assert.equal(
    childReceipt.difficultyMode,
    child.difficultyMode,
    'continuation receipt difficulty mismatch'
  );
  assert.equal(
    parentAnswer?.feedback?.continuation?.actionId,
    parentAnswer?.selectedAnswer,
    'saved parent answer did not follow the canonical continuation branch'
  );
  assert.equal(replay?.success, true, 'continuation replay did not succeed');
  assert.equal(
    replay?.recoveredExistingContinuation,
    true,
    'continuation replay did not recover the registered child'
  );
  for (const field of [
    'attemptId',
    'sessionId',
    'handOrdinal',
    'decisionOrdinal',
    'snapshotKey',
    'submissionId',
  ]) {
    const firstValue = field in first ? first[field] : child[field];
    const replayValue = field in replay ? replay[field] : replay.question?._gradingContext?.[field];
    assert.equal(replayValue, firstValue, `continuation replay changed ${field}`);
  }
  const replayContext = replay.question?._gradingContext;
  assert.ok(
    sha256Bytes(String(replayContext?.receipt ?? '')) === sha256Bytes(String(child.receipt ?? '')),
    'continuation replay changed receipt bytes'
  );
  for (const field of [
    'submissionId',
    'sessionId',
    'attemptId',
    'snapshotKey',
    'sessionKind',
    'sessionTargetHands',
    'handOrdinal',
    'decisionOrdinal',
    'countsTowardCompletion',
    'practiceOnly',
    'difficultyMode',
  ]) {
    assert.deepEqual(replayContext?.[field], child[field], `continuation replay changed ${field}`);
  }
  const replayReceipt = decodeReceiptObservation(replayContext?.receipt);
  for (const field of [
    'version',
    'jti',
    'attemptId',
    'snapshotKey',
    'questionId',
    'sessionId',
    'sessionKind',
    'sessionTargetHands',
    'handOrdinal',
    'decisionOrdinal',
    'countsTowardCompletion',
    'practiceOnly',
    'difficultyMode',
    'format',
  ]) {
    assert.deepEqual(
      replayReceipt[field],
      childReceipt[field],
      `continuation replay receipt changed ${field}`
    );
  }
  assert.equal(
    publicQuestionFingerprint(replay.question),
    publicQuestionFingerprint(first.question),
    'continuation replay changed the child question'
  );
  return first.question;
}

export function receiptFormatCensus(observations) {
  const counts = { attemptScopedServe: 0, predecessorUuidV4: 0, unknown: 0 };
  for (const observation of observations) {
    if (observation.format === 'attempt_scoped_serve') counts.attemptScopedServe += 1;
    else if (observation.format === 'predecessor_uuid_v4') counts.predecessorUuidV4 += 1;
    else counts.unknown += 1;
  }
  return {
    observedReceipts: observations.length,
    counts,
    predecessorFormatObserved: counts.predecessorUuidV4 > 0,
    predecessorStatus: counts.predecessorUuidV4 > 0 ? 'observed' : 'not_observed',
    limitation:
      counts.predecessorUuidV4 > 0
        ? null
        : 'The deployed PR-A application only emits attempt-scoped v2 receipts. This harness did not fabricate a predecessor UUID receipt; authentic predecessor compatibility remains an independent release gate.',
  };
}

export function createSlidingWindowRequestPacer({
  maxRequests = RECORD_QUESTION_WINDOW_MAX,
  windowMs = RECORD_QUESTION_WINDOW_MS,
  safetyMs = 250,
  now = () => Date.now(),
  sleep = (delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs)),
} = {}) {
  assert.ok(
    Number.isInteger(maxRequests) && maxRequests >= 1,
    'request pacer maxRequests must be a positive integer'
  );
  assert.ok(Number.isFinite(windowMs) && windowMs > 0, 'request pacer windowMs must be positive');
  assert.ok(
    Number.isFinite(safetyMs) && safetyMs >= 0,
    'request pacer safetyMs must not be negative'
  );
  const issuedAt = [];
  let requestsIssued = 0;
  let totalWaitMs = 0;

  const discardExpired = (currentTime) => {
    while (issuedAt.length > 0 && currentTime > issuedAt[0] + windowMs) issuedAt.shift();
  };

  return {
    async waitForSlot() {
      let currentTime = Number(now());
      discardExpired(currentTime);
      while (issuedAt.length >= maxRequests) {
        const delayMs = Math.max(1, issuedAt[0] + windowMs - currentTime + safetyMs);
        totalWaitMs += delayMs;
        await sleep(delayMs);
        currentTime = Number(now());
        discardExpired(currentTime);
      }
      issuedAt.push(currentTime);
      requestsIssued += 1;
    },
    snapshot() {
      return {
        maxRequests,
        windowMs,
        requestsIssued,
        totalWaitMs,
      };
    },
  };
}

export function attestationExitCode(evidence) {
  return evidence?.success === true &&
    evidence?.publicApiSuccess === true &&
    evidence?.releaseGateReady === true &&
    evidence?.[FINALIZED_RELEASE_PROOF] === true
    ? 0
    : 1;
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseJsonEvidence(path, label) {
  const bytes = readFileSync(path);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON: ${path}`);
  }
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be a JSON object`
  );
  return { value, digest: sha256Bytes(bytes) };
}

function assertEvidenceContainsNoSecrets(value, path = 'admin evidence') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertEvidenceContainsNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'string') {
    RECEIPT_MATERIAL_RE.lastIndex = 0;
    JWT_MATERIAL_RE.lastIndex = 0;
    assert.equal(
      RECEIPT_MATERIAL_RE.test(value),
      false,
      `${path} contains grading-receipt material`
    );
    assert.equal(JWT_MATERIAL_RE.test(value), false, `${path} contains JWT material`);
    assert.equal(
      SECRET_PREFIX_RE.test(value),
      false,
      `${path} contains secret-like credential material`
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    assert.equal(
      [
        'accesstoken',
        'refreshtoken',
        'servicerolekey',
        'gradingreceipt',
        'authorization',
        'cookie',
        'password',
        'secret',
        'credential',
        'privatekey',
        'apikey',
        'token',
        'servicerole',
        'bearer',
        'jwt',
      ].some((forbidden) => normalizedKey.includes(forbidden)),
      false,
      `${path} contains a forbidden secret-bearing field`
    );
    assertEvidenceContainsNoSecrets(item, `${path}.${key}`);
  }
}

function assertExactObjectKeys(value, expected, label) {
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} must be an object`
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...expected].sort(),
    `${label} fields do not match the closeout schema`
  );
}

function exactUniqueStrings(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  const strings = value.map((item) => String(item || ''));
  assert.ok(strings.every(Boolean), `${label} contains an empty value`);
  assert.equal(new Set(strings).size, strings.length, `${label} contains duplicates`);
  return strings.sort();
}

function assertExactStringSet(actual, expected, label) {
  assert.deepEqual(
    exactUniqueStrings(actual, label),
    [...expected].sort(),
    `${label} does not match the public evidence`
  );
}

function isoTimestamp(value, label) {
  const text = String(value || '');
  const timestamp = Date.parse(text);
  assert.ok(Number.isFinite(timestamp), `${label} must be an ISO timestamp`);
  assert.equal(
    new Date(timestamp).toISOString(),
    text,
    `${label} must use canonical UTC ISO-8601 milliseconds`
  );
  return timestamp;
}

function canonicalAttemptEventKey({ attemptId, handOrdinal, decisionOrdinal }, label) {
  assert.match(
    String(attemptId || ''),
    UUID_V4_RE,
    `${label} attemptId must be a canonical lowercase UUID v4`
  );
  assert.ok(
    Number.isSafeInteger(handOrdinal) && handOrdinal >= 1,
    `${label} handOrdinal must be a positive safe integer`
  );
  assert.ok(
    Number.isSafeInteger(decisionOrdinal) && decisionOrdinal >= 1,
    `${label} decisionOrdinal must be a positive safe integer`
  );
  return `training-attempt:${attemptId}:hand:${handOrdinal}:decision:${decisionOrdinal}`;
}

function validatePublicCorrelationRecord(
  record,
  { attemptId, expectedHandOrdinal, expectedDecisionOrdinal, label }
) {
  assert.ok(
    record && typeof record === 'object' && !Array.isArray(record),
    `${label} must be an object`
  );
  assert.equal(record.attemptId, attemptId, `${label} attempt mismatch`);
  if (expectedHandOrdinal !== undefined) {
    assert.equal(record.handOrdinal, expectedHandOrdinal, `${label} hand ordinal mismatch`);
  }
  if (expectedDecisionOrdinal !== undefined) {
    assert.equal(
      record.decisionOrdinal,
      expectedDecisionOrdinal,
      `${label} decision ordinal mismatch`
    );
  }
  const eventKey = canonicalAttemptEventKey(record, label);
  assert.equal(
    record.eventKey,
    eventKey,
    `${label} event key is not canonical or does not match its slot`
  );
  assert.equal(
    record.submissionId,
    eventKey,
    `${label} submissionId must equal its canonical event key`
  );
  assert.match(String(record.snapshotKey || ''), SHA256_RE, `${label} snapshotKey is invalid`);
  assert.match(
    String(record.policyChecksum || ''),
    SHA256_RE,
    `${label} policyChecksum is invalid`
  );
  assert.ok(String(record.questionId || '').trim().length > 0, `${label} questionId is missing`);
  return eventKey;
}

function validatePublicAnswerEvidence(value, correlation, label, expectedCountsTowardCompletion) {
  assert.ok(
    value && typeof value === 'object' && !Array.isArray(value),
    `${label} immutable evidence is missing`
  );
  for (const field of [
    'submissionId',
    'attemptId',
    'snapshotKey',
    'handOrdinal',
    'decisionOrdinal',
  ]) {
    assert.deepEqual(value[field], correlation[field], `${label} immutable ${field} mismatch`);
  }
  assert.ok(String(value.sessionId || '').length > 0, `${label} immutable sessionId is missing`);
  assert.equal(
    value.countsTowardCompletion,
    expectedCountsTowardCompletion,
    `${label} completion binding mismatch`
  );
  assert.equal(value.practiceOnly, false, `${label} practice binding mismatch`);
  assert.equal(
    typeof value.evidence?.isCorrect,
    'boolean',
    `${label} authoritative correctness is missing`
  );
  assert.ok(
    value.feedback && typeof value.feedback === 'object',
    `${label} authoritative feedback is missing`
  );
}

/**
 * Validate the entire successful public attestation, not merely the handful of
 * fields needed to construct database lookup keys. Administrator closeout must
 * call this before considering any private evidence.
 */
export function validateCompletePublicAttestation(publicEvidence) {
  assertEvidenceContainsNoSecrets(publicEvidence, 'public evidence');
  assert.equal(publicEvidence?.schemaVersion, 1, 'public evidence schema version mismatch');
  assert.equal(publicEvidence?.publicApiSuccess, true, 'public API evidence has not passed');
  assert.equal(
    publicEvidence?.success,
    false,
    'public evidence was unexpectedly already finalized'
  );
  assert.equal(
    publicEvidence?.releaseGateReady,
    false,
    'public evidence was unexpectedly already release-ready'
  );
  assert.equal(
    publicEvidence?.status,
    'public_api_verified_admin_correlation_pending',
    'public evidence is not awaiting administrator closeout'
  );
  assert.match(
    String(publicEvidence?.expectedBuild || ''),
    SHA40_RE,
    'public evidence build is invalid'
  );
  assert.equal(
    publicEvidence.expectedBuild,
    publicEvidence.expectedBuild.toLowerCase(),
    'public evidence build must be lowercase'
  );

  const deployment = publicEvidence?.deployment;
  assert.ok(
    deployment && typeof deployment === 'object',
    'public evidence deployment identity is missing'
  );
  assertExactObjectKeys(
    deployment,
    ['commitSha', 'version', 'deploymentUrl', 'deploymentId'],
    'public deployment identity'
  );
  assert.equal(
    deployment.commitSha,
    publicEvidence.expectedBuild,
    'public deployment commit mismatch'
  );
  assert.equal(
    deployment.version,
    publicEvidence.expectedBuild,
    'public deployment version mismatch'
  );
  const deploymentUrl = validateImmutableDeploymentUrl(deployment.deploymentUrl);
  assert.equal(deploymentUrl, deployment.deploymentUrl, 'public deployment URL is not canonical');
  assert.ok(
    typeof deployment.deploymentId === 'string' &&
      deployment.deploymentId.trim() === deployment.deploymentId &&
      deployment.deploymentId.length >= 3 &&
      deployment.deploymentId.length <= 200,
    'public deployment ID is missing or invalid'
  );

  const auditUserId = String(publicEvidence?.auditUserId || '');
  assert.match(auditUserId, UUID_V4_RE, 'public evidence audit-account UUID is invalid');
  const writeScope = publicEvidence?.writeScope;
  assertExactObjectKeys(
    writeScope,
    ['acknowledged', 'auditUserId', 'gameId', 'level', 'effects'],
    'public write scope'
  );
  assert.equal(writeScope?.acknowledged, true, 'public write scope was not acknowledged');
  assert.equal(writeScope?.auditUserId, auditUserId, 'public write scope audit account mismatch');
  assert.equal(writeScope?.gameId, GAME_ID, 'public write scope game mismatch');
  assert.equal(writeScope?.level, LEVEL, 'public write scope level mismatch');
  assertExactStringSet(
    writeScope?.effects,
    [
      'training attempt creation',
      'served delivery events',
      'training answer inserts',
      'audit-account seen-question state',
      'cache accounting events',
    ],
    'public write-scope effects'
  );

  const pending = publicEvidence?.adminVerification;
  assertExactObjectKeys(
    pending,
    [
      'status',
      'privateAttemptScopedServeAttestation',
      'negativeRefusalMatrix',
      'predecessorRollbackCompatibility',
      'productionErrorStreamReview',
      'instructionsDocument',
    ],
    'public administrator-pending gates'
  );
  assert.equal(pending?.status, 'pending', 'public administrator status is not pending');
  for (const field of [
    'privateAttemptScopedServeAttestation',
    'negativeRefusalMatrix',
    'predecessorRollbackCompatibility',
    'productionErrorStreamReview',
  ]) {
    assert.equal(pending?.[field], 'pending', `public administrator gate is not pending: ${field}`);
  }
  assert.equal(
    pending?.instructionsDocument,
    '.agent/audits/2026-09-08-training-phase-6-production-delivery-attestation.md',
    'public administrator instructions document mismatch'
  );

  const api = publicEvidence?.publicApi;
  assert.equal(api?.authenticated, true, 'public API authentication was not proved');
  assert.equal(api?.auditUserId, auditUserId, 'public API audit account mismatch');
  assert.equal(api?.authProbe?.status, 'passed', 'public API auth probe did not pass');
  assert.equal(api?.authProbe?.auditUserId, auditUserId, 'public API auth probe account mismatch');

  const initial = api?.initialAttempt;
  assert.equal(initial?.gameId, GAME_ID, 'public evidence game mismatch');
  assert.equal(initial?.level, LEVEL, 'public evidence level mismatch');
  assert.equal(
    initial?.requestedDifficultyTier,
    REQUESTED_DIFFICULTY_TIER,
    'public evidence requested difficulty tier mismatch'
  );
  assert.equal(
    initial?.difficultyMode,
    EXPECTED_DIFFICULTY_MODE,
    'public evidence difficulty mismatch'
  );
  assert.match(
    String(initial?.sessionId || ''),
    /^phase6-attestation-[0-9a-f-]{36}$/,
    'public evidence session id is invalid'
  );
  assert.match(
    String(initial?.attemptId || ''),
    UUID_V4_RE,
    'public evidence attempt id is invalid'
  );
  assert.equal(initial?.targetHands, TARGET_HANDS, 'public evidence targetHands mismatch');
  assert.equal(initial?.deliveredHands, TARGET_HANDS, 'public evidence deliveredHands mismatch');
  assert.equal(initial?.completeManifest, true, 'public evidence manifest is incomplete');
  const expectedContinuationPrecommit = buildTrainingAttestationContinuationPrecommit({
    selectionRule: TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
    sessionId: initial.sessionId,
    gameId: initial.gameId,
    level: initial.level,
    targetHands: initial.targetHands,
  });
  assert.deepEqual(
    initial?.continuationCohortPrecommit,
    expectedContinuationPrecommit,
    'public evidence continuation cohort precommit is not bound to the attempt selection'
  );
  assert.deepEqual(
    Object.keys(initial.continuationCohortPrecommit).sort(),
    ['commitment', 'selectionRule', 'version'],
    'public evidence continuation cohort precommit leaked a private selection field'
  );
  const attemptId = initial.attemptId;

  const parents = api?.parentCandidateAttempts;
  assert.ok(
    Array.isArray(parents) && parents.length === TARGET_HANDS,
    'public evidence does not contain all parent attempts'
  );
  const expectedEventKeys = parents.map((record, index) => {
    const label = `public parent ${index + 1}`;
    const eventKey = validatePublicCorrelationRecord(record, {
      attemptId,
      expectedHandOrdinal: index + 1,
      expectedDecisionOrdinal: 1,
      label,
    });
    assert.ok(
      String(record.selectedAnswer || '').length > 0,
      `${label} selected answer is missing`
    );
    assert.equal(
      typeof record.followedContinuationBranch,
      'boolean',
      `${label} continuation selection is missing`
    );
    assert.equal(
      record.responseLossRecovered,
      index === 0,
      `${label} response-loss result mismatch`
    );
    assert.equal(record.exactReplay, true, `${label} exact replay did not pass`);
    assert.equal(
      record.initialReceiptServerVerified,
      true,
      `${label} initial receipt was not server verified`
    );
    assert.equal(
      record.reissuedReceiptServerVerified,
      true,
      `${label} reissued receipt was not server verified`
    );
    assert.equal(
      typeof record.receiptBytesIdentical,
      'boolean',
      `${label} receipt-byte comparison is missing`
    );
    assert.ok(
      [
        'same_bytes_replayed_through_record_question',
        'refreshed_receipt_replayed_through_record_question',
      ].includes(record.reissuedReceiptVerification),
      `${label} reissued receipt verification is invalid`
    );
    assert.equal(
      record.recordQuestionRequests,
      index === 0 ? 3 : 2,
      `${label} request count is invalid`
    );
    return eventKey;
  });
  assert.equal(
    new Set(expectedEventKeys).size,
    TARGET_HANDS,
    'public parent event keys are not unique'
  );

  const reissue = api?.reissue;
  assert.equal(
    reissue?.manifestIdentityExact,
    true,
    'public reissue manifest identity did not pass'
  );
  assert.equal(
    reissue?.recoveredExistingAttempt,
    true,
    'public reissue did not recover the attempt'
  );
  assert.equal(
    typeof reissue?.receiptBytesIdentical,
    'boolean',
    'public reissue receipt-byte aggregate is missing'
  );
  assert.ok(
    Array.isArray(reissue?.hands) && reissue.hands.length === TARGET_HANDS,
    'public reissue omitted hands'
  );
  reissue.hands.forEach((hand, index) => {
    const parent = parents[index];
    assert.equal(
      hand.questionId,
      parent.questionId,
      `public reissue hand ${index + 1} question mismatch`
    );
    assert.equal(hand.handOrdinal, index + 1, `public reissue hand ${index + 1} ordinal mismatch`);
    assert.equal(
      hand.snapshotKey,
      parent.snapshotKey,
      `public reissue hand ${index + 1} snapshot mismatch`
    );
    assert.equal(
      hand.submissionId,
      parent.submissionId,
      `public reissue hand ${index + 1} submission mismatch`
    );
    assert.match(
      String(hand.publicQuestionDigest || ''),
      SHA256_RE,
      `public reissue hand ${index + 1} digest is invalid`
    );
    assert.equal(
      typeof hand.receiptBytesIdentical,
      'boolean',
      `public reissue hand ${index + 1} byte comparison is missing`
    );
    assert.equal(
      hand.receiptBytesIdentical,
      parent.receiptBytesIdentical,
      `public reissue hand ${index + 1} byte comparison mismatch`
    );
  });
  assert.equal(
    reissue.receiptBytesIdentical,
    reissue.hands.every(({ receiptBytesIdentical }) => receiptBytesIdentical),
    'public reissue receipt-byte aggregate is inconsistent'
  );

  assert.deepEqual(
    api?.responseLossRecovery,
    {
      simulatedAtApplicationBoundary: true,
      firstResponseBodyIntentionallyDiscarded: true,
      exactRetryReturnedIdempotentReplay: true,
    },
    'public response-loss recovery contract did not pass'
  );
  const receiptVerification = api?.receiptServerVerification;
  for (const [label, section] of [
    ['initial', receiptVerification?.initial],
    ['reissued', receiptVerification?.reissued],
  ]) {
    assert.equal(section?.expected, TARGET_HANDS, `${label} receipt expected count mismatch`);
    assert.equal(section?.verified, TARGET_HANDS, `${label} receipt verified count mismatch`);
    assert.equal(section?.allAccepted, true, `${label} receipt server verification did not pass`);
  }
  assert.equal(
    receiptVerification?.receiptBytesIdentical + receiptVerification?.refreshedReceiptBytes,
    TARGET_HANDS,
    'receipt-byte census does not cover the reissued manifest'
  );
  const rate = receiptVerification?.recordQuestionRateLimit;
  assert.equal(rate?.productionMaximum, 30, 'record-question production rate limit mismatch');
  assert.equal(
    rate?.maxRequests,
    RECORD_QUESTION_WINDOW_MAX,
    'record-question attestation pacing maximum mismatch'
  );
  assert.equal(
    rate?.windowMs,
    RECORD_QUESTION_WINDOW_MS,
    'record-question attestation pacing window mismatch'
  );
  assert.equal(rate?.requestsIssued, 45, 'record-question request census mismatch');
  assert.ok(
    Number.isFinite(rate?.totalWaitMs) && rate.totalWaitMs >= 0,
    'record-question pacing wait census is invalid'
  );

  assert.deepEqual(
    api?.conflictingReplayRefusals,
    {
      changedAnswer: { status: 409, code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT' },
      changedSubmissionBinding: {
        status: 400,
        code: 'TRAINING_GRADING_RECEIPT_SUBMISSION_MISMATCH',
      },
    },
    'public replay-conflict refusal contract did not pass'
  );

  const continuation = api?.continuation;
  const continuationEventKey = validatePublicCorrelationRecord(continuation, {
    attemptId,
    label: 'public continuation',
  });
  const continuationParent = parents.find(
    ({ eventKey }) => eventKey === continuation.parentEventKey
  );
  assert.ok(
    continuationParent,
    'public continuation parent event key is not one of the parent events'
  );
  assert.equal(
    continuation.handOrdinal,
    continuationParent.handOrdinal,
    'public continuation changed the parent hand'
  );
  assert.equal(
    continuation.decisionOrdinal,
    continuationParent.decisionOrdinal + 1,
    'public continuation is not the next decision'
  );
  assert.equal(
    continuation.recoveredExistingContinuation,
    true,
    'public continuation replay did not recover the child'
  );
  assert.equal(
    continuation.parentBindingVerifiedFromPublicReceipts,
    true,
    'public continuation parent binding did not pass'
  );
  assert.match(
    String(continuation.childPublicQuestionDigest || ''),
    SHA256_RE,
    'public continuation digest is invalid'
  );
  const selectedParentEventKey = validatePublicCorrelationRecord(api?.parent, {
    attemptId,
    label: 'public selected parent',
  });
  assert.equal(
    selectedParentEventKey,
    continuation.parentEventKey,
    'public selected parent does not bind the continuation'
  );
  for (const field of [
    'snapshotKey',
    'questionId',
    'policyChecksum',
    'submissionId',
    'selectedAnswer',
  ]) {
    assert.deepEqual(
      api.parent[field],
      continuationParent[field],
      `public selected parent changed ${field}`
    );
  }
  assert.equal(
    api.parent.followedContinuationBranch,
    true,
    'public selected parent did not follow its continuation branch'
  );
  assert.equal(api.parent.exactReplay, true, 'public selected parent exact replay did not pass');
  assert.ok(
    String(api.parent.selectedAnswer || '').length > 0,
    'public selected parent answer is missing'
  );
  validatePublicAnswerEvidence(
    api.parent.immutableEvidence,
    api.parent,
    'public selected parent',
    true
  );
  assert.equal(
    api.parent.immutableEvidence.sessionId,
    initial.sessionId,
    'public selected parent immutable session mismatch'
  );
  assert.equal(
    api?.childAnswer?.exactReplay,
    true,
    'public child answer exact replay did not pass'
  );
  assert.ok(
    String(api?.childAnswer?.selectedAnswer || '').length > 0,
    'public child answer selection is missing'
  );
  validatePublicAnswerEvidence(
    api.childAnswer.immutableEvidence,
    continuation,
    'public child answer',
    false
  );
  assert.equal(
    api.childAnswer.immutableEvidence.sessionId,
    initial.sessionId,
    'public child answer immutable session mismatch'
  );

  const census = api?.receiptFormatCensus;
  assert.equal(
    census?.observedReceipts,
    42,
    'public receipt census did not cover every observed receipt'
  );
  assert.deepEqual(
    census?.counts,
    { attemptScopedServe: 42, predecessorUuidV4: 0, unknown: 0 },
    'public receipt census is invalid'
  );
  assert.equal(
    census?.predecessorFormatObserved,
    false,
    'public receipt census falsely claimed predecessor coverage'
  );
  assert.equal(
    census?.predecessorStatus,
    'not_observed',
    'public predecessor receipt status is invalid'
  );
  assert.ok(
    String(census?.limitation || '').includes('did not fabricate'),
    'public predecessor limitation is missing'
  );

  const startedAt = isoTimestamp(publicEvidence?.startedAt, 'public evidence startedAt');
  const apiCompletedAt = isoTimestamp(
    publicEvidence?.apiCompletedAt,
    'public evidence apiCompletedAt'
  );
  const completedAt = isoTimestamp(publicEvidence?.completedAt, 'public evidence completedAt');
  assert.ok(apiCompletedAt >= startedAt, 'public API evidence completed before it started');
  assert.ok(completedAt >= apiCompletedAt, 'public evidence completed before API work');
  const settle = publicEvidence?.errorSettle;
  assert.equal(settle?.minimumMs, ERROR_SETTLE_WINDOW_MS, 'public error-settle minimum mismatch');
  assert.equal(
    settle?.windowStart,
    publicEvidence.apiCompletedAt,
    'public error-settle start mismatch'
  );
  assert.equal(settle?.windowEnd, publicEvidence.completedAt, 'public error-settle end mismatch');
  assert.ok(
    settle?.observedMs >= ERROR_SETTLE_WINDOW_MS,
    'public error-settle window was too short'
  );
  assert.equal(settle?.publicClientErrorCount, 0, 'public client error review found errors');
  assert.equal(
    completedAt - apiCompletedAt,
    settle.observedMs,
    'public error-settle duration is internally inconsistent'
  );

  return {
    attemptId,
    auditUserId,
    deploymentUrl,
    deploymentId: deployment.deploymentId,
    startedAt,
    apiCompletedAt,
    completedAt,
    parents,
    continuation,
    expectedEventKeys: [...expectedEventKeys, continuationEventKey],
  };
}

export function validateAdministratorCloseout(
  publicEvidence,
  adminEvidence,
  publicEvidenceSha256,
  machineCollectorProof = null
) {
  const publicContract = validateCompletePublicAttestation(publicEvidence);
  assertEvidenceContainsNoSecrets(adminEvidence);
  assert.match(
    String(publicEvidenceSha256 || ''),
    SHA256_RE,
    'public evidence checksum is invalid'
  );
  assertExactObjectKeys(
    adminEvidence,
    [
      'schemaVersion',
      'evidenceKind',
      'publicEvidenceSha256',
      'expectedBuild',
      'auditUserId',
      'attemptId',
      'verifiedAt',
      'deployment',
      'collector',
      'correlation',
      'privateAttemptScopedServeAttestation',
      'negativeRefusalMatrix',
      'predecessorRollbackCompatibility',
      'productionErrorStreamReview',
    ],
    'administrator evidence'
  );
  assert.equal(adminEvidence?.schemaVersion, 1, 'administrator evidence schema version mismatch');
  assert.equal(
    adminEvidence?.evidenceKind,
    ADMIN_EVIDENCE_KIND,
    'administrator evidence kind mismatch'
  );
  assert.equal(
    adminEvidence?.publicEvidenceSha256,
    publicEvidenceSha256,
    'administrator evidence binds a different public file'
  );
  assert.equal(
    adminEvidence?.expectedBuild,
    publicEvidence.expectedBuild,
    'administrator evidence build mismatch'
  );
  assert.equal(
    adminEvidence?.auditUserId,
    publicContract.auditUserId,
    'administrator evidence audit account mismatch'
  );

  assert.deepEqual(
    adminEvidence?.deployment,
    {
      expectedBuild: publicEvidence.expectedBuild,
      deploymentUrl: publicContract.deploymentUrl,
      deploymentId: publicContract.deploymentId,
    },
    'administrator evidence deployment identity mismatch'
  );
  const collector = adminEvidence?.collector;
  assertExactObjectKeys(
    collector,
    [
      'kind',
      'status',
      'generatedAt',
      'queryMode',
      'currentUser',
      'currentDatabase',
      'serverVersionNum',
      'supabaseProjectRef',
      'publicEvidenceSha256',
      'correlationReadOnlyVerified',
      'correlationTransactionRolledBack',
      'rollbackVerificationCount',
    ],
    'administrator collector provenance'
  );
  assert.equal(collector?.kind, ADMIN_COLLECTOR_KIND, 'administrator collector kind mismatch');
  assert.equal(collector?.status, 'complete', 'administrator collector did not complete');
  assert.equal(
    collector?.queryMode,
    'read_only_plus_explicit_rolled_back_probes',
    'administrator collector query mode mismatch'
  );
  assert.ok(
    String(collector?.currentUser || '').length > 0,
    'administrator collector database user is missing'
  );
  assert.ok(
    String(collector?.currentDatabase || '').length > 0,
    'administrator collector database name is missing'
  );
  assert.match(
    String(collector?.serverVersionNum || ''),
    /^\d{5,6}$/,
    'administrator collector server version is invalid'
  );
  assert.match(
    String(collector?.supabaseProjectRef || ''),
    /^[a-z0-9]{20}$/,
    'administrator collector Supabase project ref is invalid'
  );
  assert.equal(
    collector?.publicEvidenceSha256,
    publicEvidenceSha256,
    'administrator collector binds a different public file'
  );
  assert.equal(
    collector?.correlationReadOnlyVerified,
    true,
    'administrator correlation was not collected in a read-only transaction'
  );
  assert.equal(
    collector?.correlationTransactionRolledBack,
    true,
    'administrator correlation transaction was not rolled back'
  );
  assert.ok(
    Number.isSafeInteger(collector?.rollbackVerificationCount) &&
      collector.rollbackVerificationCount === ADMIN_NEGATIVE_PROBES.length + 2,
    'administrator collector did not verify every required rollback'
  );
  const collectorGeneratedAt = isoTimestamp(
    collector?.generatedAt,
    'administrator collector generatedAt'
  );

  const { attemptId } = publicContract;
  assert.equal(adminEvidence?.attemptId, attemptId, 'administrator evidence attempt mismatch');
  const publicCompletedAt = isoTimestamp(
    publicEvidence?.completedAt,
    'public evidence completedAt'
  );
  const publicStartedAt = isoTimestamp(publicEvidence?.startedAt, 'public evidence startedAt');
  assert.ok(publicCompletedAt >= publicStartedAt, 'public evidence completed before it started');
  const verifiedAt = isoTimestamp(adminEvidence?.verifiedAt, 'administrator verifiedAt');
  assert.ok(verifiedAt >= publicCompletedAt, 'administrator evidence predates public completion');
  assert.ok(
    collectorGeneratedAt >= publicCompletedAt,
    'administrator collector predates public completion'
  );
  assert.ok(
    verifiedAt >= collectorGeneratedAt,
    'administrator verification predates collector completion'
  );

  const { parents, continuation } = publicContract;
  const expectedEventKeys = [...publicContract.expectedEventKeys];
  const expectedSubmissionIds = [...expectedEventKeys];
  assert.equal(
    new Set(expectedEventKeys).size,
    TARGET_HANDS + 1,
    'public evidence event keys are not unique'
  );
  const correlation = adminEvidence?.correlation;
  assertExactObjectKeys(
    correlation,
    [
      'status',
      'attemptId',
      'auditUserId',
      'attemptRowBindingExact',
      'attemptConfigHash',
      'continuationPrecommitBoundInAttemptConfig',
      'servedEventCount',
      'servedEventKeys',
      'allServedFieldBindingsExact',
      'answerCount',
      'answerSubmissionIds',
      'allAnswerFieldBindingsExact',
      'continuationParentEventKey',
      'continuationSlotBindingExact',
      'continuationSnapshotLineageExact',
      'continuationParentSourceClassification',
      'continuationChildSourceClassification',
    ],
    'administrator correlation'
  );
  assert.equal(correlation?.status, 'passed', 'administrator correlation did not pass');
  assert.equal(correlation?.attemptId, attemptId, 'administrator correlation attempt mismatch');
  assert.equal(
    correlation?.auditUserId,
    publicContract.auditUserId,
    'administrator correlation audit account mismatch'
  );
  assert.equal(
    correlation?.attemptRowBindingExact,
    true,
    'administrator attempt row binding did not pass'
  );
  assert.equal(
    correlation?.attemptConfigHash,
    trainingAttemptConfigHash({
      gameMode: 'street',
      handSelection: 'all',
      targetStreet: 'flop',
      attestationContinuationCohort:
        publicEvidence.publicApi.initialAttempt.continuationCohortPrecommit,
      gameId: GAME_ID,
      level: LEVEL,
      sessionKind: 'campaign',
      difficultyMode: PERSISTED_DIFFICULTY_MODE,
      targetHands: TARGET_HANDS,
    }),
    'administrator attempt config hash did not bind the public continuation precommit'
  );
  assert.equal(
    correlation?.continuationPrecommitBoundInAttemptConfig,
    true,
    'administrator attempt config did not bind the public continuation precommit'
  );
  assert.equal(
    correlation?.servedEventCount,
    TARGET_HANDS + 1,
    'administrator served-event count mismatch'
  );
  assert.equal(correlation?.answerCount, TARGET_HANDS + 1, 'administrator answer count mismatch');
  assertExactStringSet(
    correlation?.servedEventKeys,
    expectedEventKeys,
    'correlated served event keys'
  );
  assert.equal(
    correlation?.allServedFieldBindingsExact,
    true,
    'administrator served-event field binding did not pass'
  );
  assertExactStringSet(
    correlation?.answerSubmissionIds,
    expectedSubmissionIds,
    'correlated answer submission ids'
  );
  assert.equal(
    correlation?.allAnswerFieldBindingsExact,
    true,
    'administrator answer field binding did not pass'
  );
  assert.equal(
    correlation?.continuationParentEventKey,
    continuation.parentEventKey,
    'administrator continuation parent binding mismatch'
  );
  assert.equal(
    correlation?.continuationSlotBindingExact,
    true,
    'administrator continuation-slot binding did not pass'
  );
  assert.equal(
    correlation?.continuationSnapshotLineageExact,
    true,
    'administrator continuation snapshot lineage did not pass'
  );
  assert.ok(
    ['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(
      correlation?.continuationParentSourceClassification,
    ),
    'administrator continuation parent source classification is not solver-backed'
  );
  assert.ok(
    ['SOLVER_EXACT', 'SOLVER_DERIVED_RESPONSE'].includes(
      correlation?.continuationChildSourceClassification,
    ),
    'administrator continuation child source classification is not solver-backed'
  );

  const privateAttestation = adminEvidence?.privateAttemptScopedServeAttestation;
  assertExactObjectKeys(
    privateAttestation,
    [
      'status',
      'rowCount',
      'contractVersion',
      'evidenceKind',
      'evidenceEventKey',
      'evidenceEventExists',
      'evidenceOwnerPresent',
    ],
    'private attempt-scoped attestation'
  );
  assert.equal(
    privateAttestation?.status,
    'passed',
    'private attempt-scoped attestation did not pass'
  );
  assert.equal(
    privateAttestation?.rowCount,
    1,
    'private attempt-scoped attestation must be exactly one row'
  );
  assert.equal(
    privateAttestation?.contractVersion,
    'training-attempt-decision-authority-v1',
    'private attestation contract version mismatch'
  );
  assert.equal(
    privateAttestation?.evidenceKind,
    'attempt_scoped_serve',
    'private attestation kind mismatch'
  );
  assert.match(
    String(privateAttestation?.evidenceEventKey || ''),
    ATTEMPT_SCOPED_JTI_RE,
    'private attestation event key is not canonical attempt-scoped evidence'
  );
  assert.equal(
    privateAttestation?.evidenceEventExists,
    true,
    'private attestation evidence event does not exist'
  );
  assert.equal(
    privateAttestation?.evidenceOwnerPresent,
    true,
    'private attestation evidence event has no owner'
  );

  const refusalMatrix = adminEvidence?.negativeRefusalMatrix;
  assertExactObjectKeys(
    refusalMatrix,
    ['status', 'probeCount', 'transactionRolledBack', 'probes'],
    'negative refusal matrix'
  );
  assert.equal(refusalMatrix?.status, 'passed', 'negative refusal matrix did not pass');
  assert.equal(
    refusalMatrix?.probeCount,
    ADMIN_NEGATIVE_PROBES.length,
    'negative refusal probe count mismatch'
  );
  assert.equal(refusalMatrix?.transactionRolledBack, true, 'negative probes were not rolled back');
  assertExactObjectKeys(refusalMatrix?.probes, ADMIN_NEGATIVE_PROBES, 'negative refusal probes');
  for (const probe of ADMIN_NEGATIVE_PROBES) {
    assert.equal(refusalMatrix.probes[probe], 'passed', `negative probe did not pass: ${probe}`);
  }

  const predecessor = adminEvidence?.predecessorRollbackCompatibility;
  assertExactObjectKeys(
    predecessor,
    [
      'status',
      'method',
      'provenance',
      'artifactSha256',
      'trustedKeySha256',
      'verifierSha256',
      'transactionRolledBack',
      'initialWrite',
      'continuationWrite',
    ],
    'predecessor rollback compatibility'
  );
  assert.equal(predecessor?.status, 'passed', 'predecessor rollback compatibility did not pass');
  assert.ok(
    ['authentic_saved_receipt', 'controlled_rollback_rehearsal'].includes(predecessor?.method),
    'predecessor proof method is invalid'
  );
  if (predecessor.method === 'authentic_saved_receipt') {
    assert.equal(
      predecessor?.provenance,
      'signature_verified_authentic_artifact',
      'authentic predecessor provenance mismatch'
    );
    assert.match(
      String(predecessor?.artifactSha256 || ''),
      SHA256_RE,
      'authentic predecessor artifact digest is invalid'
    );
    assert.match(
      String(predecessor?.trustedKeySha256 || ''),
      SHA256_RE,
      'authentic predecessor trust-key digest is invalid'
    );
    assert.equal(
      predecessor?.verifierSha256,
      null,
      'authentic predecessor evidence must not claim rehearsal provenance'
    );
  } else {
    assert.equal(
      predecessor?.provenance,
      'controlled_rehearsal_not_authentic',
      'controlled rehearsal provenance mismatch'
    );
    assert.equal(
      predecessor?.artifactSha256,
      null,
      'controlled rehearsal must not claim an authentic artifact'
    );
    assert.equal(
      predecessor?.trustedKeySha256,
      null,
      'controlled rehearsal must not claim a trusted artifact key'
    );
    assert.match(
      String(predecessor?.verifierSha256 || ''),
      SHA256_RE,
      'controlled rehearsal verifier digest is invalid'
    );
  }
  assert.equal(
    predecessor?.transactionRolledBack,
    true,
    'predecessor rehearsal was not rolled back'
  );
  assert.equal(predecessor?.initialWrite, 'passed', 'predecessor initial write did not pass');
  assert.equal(
    predecessor?.continuationWrite,
    'passed',
    'predecessor continuation write did not pass'
  );

  const errorReview = adminEvidence?.productionErrorStreamReview;
  assertExactObjectKeys(
    errorReview,
    [
      'status',
      'expectedBuild',
      'deploymentId',
      'relevantErrorCount',
      'windowStart',
      'windowEnd',
      'settledWindowCovered',
      'source',
      'deploymentUrl',
      'queryComplete',
      'levelsReviewed',
    ],
    'production error-stream review'
  );
  assert.equal(errorReview?.status, 'passed', 'production error-stream review did not pass');
  assert.equal(
    errorReview?.expectedBuild,
    publicEvidence.expectedBuild,
    'production error review build mismatch'
  );
  assert.equal(
    errorReview?.deploymentId,
    publicContract.deploymentId,
    'production error review deployment mismatch'
  );
  assert.equal(
    errorReview?.relevantErrorCount,
    0,
    'production error-stream review found relevant errors'
  );
  assert.equal(
    errorReview?.settledWindowCovered,
    true,
    'production error review omitted the settled window'
  );
  assert.equal(
    errorReview?.source,
    'vercel_cli_runtime_logs',
    'production error review source is invalid'
  );
  assert.equal(
    errorReview?.deploymentUrl,
    publicContract.deploymentUrl,
    'production error review deployment URL mismatch'
  );
  assert.equal(errorReview?.queryComplete, true, 'production error log query was incomplete');
  assert.deepEqual(
    errorReview?.levelsReviewed,
    ['error', 'fatal'],
    'production error review did not cover error and fatal levels'
  );
  isoTimestamp(errorReview?.windowStart, 'production error window start');
  isoTimestamp(errorReview?.windowEnd, 'production error window end');
  assert.equal(
    errorReview?.windowStart,
    publicEvidence.startedAt,
    'production error review must start at the exact public attestation start'
  );
  assert.equal(
    errorReview?.windowEnd,
    publicEvidence.completedAt,
    'production error review must end at the exact public attestation completion'
  );

  const validated = {
    status: 'passed',
    verifiedAt: adminEvidence.verifiedAt,
    publicEvidenceSha256,
    correlatedServedEvents: expectedEventKeys.length,
    correlatedAnswers: expectedSubmissionIds.length,
    privateAttemptScopedServeAttestation: 'passed',
    negativeRefusalMatrix: 'passed',
    predecessorRollbackCompatibility: 'passed',
    productionErrorStreamReview: 'passed',
  };
  assert.equal(
    machineCollectorProof,
    MACHINE_COLLECTOR_PROOF,
    'TRAINING_PHASE6_MACHINE_ADMIN_COLLECTOR_REQUIRED: hand-authored administrator JSON cannot finalize this release'
  );
  return validated;
}

function finalizedEvidenceFromMachineCollection({
  publicParsed,
  adminParsed,
  machineCollectorProof,
  finalizedAt = new Date().toISOString(),
}) {
  const adminVerification = validateAdministratorCloseout(
    publicParsed.value,
    adminParsed.value,
    publicParsed.digest,
    machineCollectorProof
  );
  const finalized = {
    ...publicParsed.value,
    success: true,
    releaseGateReady: true,
    status: 'verified_release_gate_ready',
    adminVerification: {
      ...adminVerification,
      adminEvidenceSha256: adminParsed.digest,
    },
    finalizedAt,
  };
  Object.defineProperty(finalized, FINALIZED_RELEASE_PROOF, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return finalized;
}

export function finalizeProductionDeliveryAttestation({
  publicEvidencePath,
  adminEvidencePath,
  outputPath,
  acknowledgement,
}) {
  assert.equal(
    acknowledgement,
    ADMIN_CLOSEOUT_ACKNOWLEDGEMENT,
    `Refusing administrator closeout without TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT=${ADMIN_CLOSEOUT_ACKNOWLEDGEMENT}`
  );
  assert.ok(
    typeof publicEvidencePath === 'string' && publicEvidencePath.length > 0,
    'public evidence path is required'
  );
  assert.ok(
    typeof adminEvidencePath === 'string' && adminEvidencePath.length > 0,
    'administrator evidence path is required'
  );
  assert.ok(
    typeof outputPath === 'string' && outputPath.length > 0,
    'final evidence path is required'
  );
  const publicPath = resolve(publicEvidencePath);
  const adminPath = resolve(adminEvidencePath);
  const finalPath = resolve(outputPath);
  assert.notEqual(
    publicPath,
    adminPath,
    'public and administrator evidence must be separate files'
  );
  assert.notEqual(
    finalPath,
    publicPath,
    'final evidence must not overwrite the immutable public evidence'
  );
  assert.notEqual(
    finalPath,
    adminPath,
    'final evidence must not overwrite the administrator evidence'
  );
  const publicParsed = parseJsonEvidence(publicPath, 'public evidence');
  const adminParsed = parseJsonEvidence(adminPath, 'administrator evidence');
  // Deliberately omit the module-private proof. Filesystem input, even when it
  // looks structurally complete, is not evidence that the machine collector
  // actually ran its transactions, log adapter, and predecessor verifier.
  const finalized = finalizedEvidenceFromMachineCollection({ publicParsed, adminParsed });
  writeOutputAtomic(finalPath, finalized, { overwrite: false });
  return finalized;
}

export function readAdministratorCloseoutConfig(env = process.env) {
  const publicEvidencePath = env.TRAINING_PHASE6_DELIVERY_EVIDENCE;
  const adminEvidencePath = env.TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE;
  const outputPath = env.TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE;
  assert.ok(
    publicEvidencePath,
    'TRAINING_PHASE6_DELIVERY_EVIDENCE is required for administrator closeout'
  );
  assert.ok(
    adminEvidencePath,
    'TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE is required for administrator closeout'
  );
  assert.ok(
    outputPath,
    'TRAINING_PHASE6_DELIVERY_FINAL_EVIDENCE is required for administrator closeout'
  );
  return {
    publicEvidencePath,
    adminEvidencePath,
    outputPath,
    acknowledgement: env.TRAINING_PHASE6_DELIVERY_ACKNOWLEDGE_ADMIN_CLOSEOUT,
  };
}

function writeOutputAtomic(path, value, { overwrite = true } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    if (overwrite) renameSync(temporary, path);
    else linkSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function acquireEvidenceRunLock(outputPath) {
  const path = resolve(String(outputPath || ''));
  assert.ok(path.length > 1, 'evidence output path is required for the exclusive run lock');
  mkdirSync(dirname(path), { recursive: true });
  assert.equal(existsSync(path), false, `Refusing to overwrite existing evidence: ${path}`);
  const lockPath = `${path}.lock`;
  let descriptor;
  try {
    descriptor = openSync(lockPath, 'wx', 0o600);
    writeFileSync(
      descriptor,
      `${JSON.stringify({
        schemaVersion: 1,
        pid: process.pid,
        outputPath: path,
        acquiredAt: new Date().toISOString(),
      })}\n`
    );
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
  let released = false;
  return {
    path,
    lockPath,
    release() {
      if (released) return;
      released = true;
      closeSync(descriptor);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    },
  };
}

function rowsFromQuery(result, label) {
  assert.ok(result && Array.isArray(result.rows), `${label} did not return database rows`);
  return result.rows;
}

async function rollbackAndVerify(database, label, postRollbackCheck = null) {
  await database.query('ROLLBACK');
  const state = rowsFromQuery(
    await database.query(
      `/* phase6:rollback-state */
     SELECT pg_current_xact_id_if_assigned() IS NULL AS "transactionIdle"`
    ),
    `${label} rollback state`
  );
  assert.equal(state.length, 1, `${label} rollback state was ambiguous`);
  assert.equal(
    state[0].transactionIdle,
    true,
    `${label} transaction did not return to an unassigned state`
  );
  if (postRollbackCheck) await postRollbackCheck();
}

async function collectReadOnlyDatabaseCorrelation(database, publicEvidence, publicContract) {
  let transactionStarted = false;
  let rolledBack = false;
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    await database.query("SET LOCAL lock_timeout = '2s'");
    await database.query("SET LOCAL statement_timeout = '30s'");
    const modeRows = rowsFromQuery(
      await database.query(
        `/* phase6:transaction-mode */
       SELECT current_setting('transaction_read_only') AS "transactionReadOnly",
              current_user AS "currentUser", current_database() AS "currentDatabase",
              current_setting('server_version_num') AS "serverVersionNum"`
      ),
      'read-only transaction mode'
    );
    assert.equal(
      modeRows[0]?.transactionReadOnly,
      'on',
      'administrator correlation transaction is not read-only'
    );

    const expectedAttemptConfigHash = trainingAttemptConfigHash({
      gameMode: 'street',
      handSelection: 'all',
      targetStreet: 'flop',
      attestationContinuationCohort:
        publicEvidence.publicApi.initialAttempt.continuationCohortPrecommit,
      gameId: GAME_ID,
      level: LEVEL,
      sessionKind: 'campaign',
      difficultyMode: PERSISTED_DIFFICULTY_MODE,
      targetHands: TARGET_HANDS,
    });
    const attemptRows = rowsFromQuery(
      await database.query(
        `/* phase6:attempt-correlation */
       SELECT id::text AS "attemptId", user_id::text AS "auditUserId",
              client_nonce AS "sessionId", game_id AS "gameId", level,
              session_kind AS "sessionKind", difficulty, expected_hands AS "expectedHands",
              config_hash AS "configHash", practice_only AS "practiceOnly", status
       FROM public.training_attempts
       WHERE id = $1::uuid AND user_id = $2::uuid`,
        [publicContract.attemptId, publicContract.auditUserId]
      ),
      'attempt correlation'
    );
    assert.equal(
      attemptRows.length,
      1,
      'administrator correlation requires exactly one attempt row'
    );
    assert.deepEqual(
      attemptRows[0],
      {
        attemptId: publicContract.attemptId,
        auditUserId: publicContract.auditUserId,
        sessionId: publicEvidence.publicApi.initialAttempt.sessionId,
        gameId: GAME_ID,
        level: LEVEL,
        sessionKind: 'campaign',
        difficulty: PERSISTED_DIFFICULTY_MODE,
        expectedHands: TARGET_HANDS,
        configHash: expectedAttemptConfigHash,
        practiceOnly: false,
        status: 'open',
      },
      'administrator attempt row did not exactly match the public contract'
    );

    const servedRows = rowsFromQuery(
      await database.query(
        `/* phase6:served-correlation */
       SELECT event_key AS "eventKey", question_id AS "questionId",
              user_id::text AS "auditUserId", policy_checksum AS "policyChecksum",
              metadata ->> 'attemptId' AS "attemptId",
              (metadata ->> 'handOrdinal')::integer AS "handOrdinal",
              (metadata ->> 'decisionOrdinal')::integer AS "decisionOrdinal",
              metadata ->> 'snapshotKey' AS "snapshotKey",
              metadata ->> 'difficultyMode' AS "difficultyMode",
              metadata -> 'rngRolls' AS "rngRolls"
       FROM public.training_question_events
       WHERE event_type = 'served' AND event_key = ANY($1::text[])
       ORDER BY event_key`,
        [publicContract.expectedEventKeys]
      ),
      'served-event correlation'
    );
    assert.equal(
      servedRows.length,
      TARGET_HANDS + 1,
      'administrator served-event row count mismatch'
    );
    const publicDecisions = publicEvidence.publicApi.parentCandidateAttempts.concat(
      publicEvidence.publicApi.continuation
    );
    const publicDecisionByKey = new Map(
      publicDecisions.map((decision) => [decision.eventKey, decision])
    );
    for (const row of servedRows) {
      const decision = publicDecisionByKey.get(row.eventKey);
      assert.ok(decision, 'administrator correlation found an unexpected served event');
      assert.equal(row.auditUserId, publicContract.auditUserId, 'served-event owner mismatch');
      assert.equal(row.attemptId, publicContract.attemptId, 'served-event attempt mismatch');
      assert.equal(row.handOrdinal, decision.handOrdinal, 'served-event hand mismatch');
      assert.equal(row.decisionOrdinal, decision.decisionOrdinal, 'served-event decision mismatch');
      assert.equal(row.snapshotKey, decision.snapshotKey, 'served-event snapshot mismatch');
      assert.equal(row.questionId, decision.questionId, 'served-event question mismatch');
      assert.equal(row.policyChecksum, decision.policyChecksum, 'served-event policy mismatch');
      assert.equal(
        row.difficultyMode,
        PERSISTED_DIFFICULTY_MODE,
        'served-event difficulty mismatch'
      );
      assert.ok(
        row.rngRolls && typeof row.rngRolls === 'object',
        'served-event RNG authority is missing'
      );
    }

    const answerRows = rowsFromQuery(
      await database.query(
        `/* phase6:answer-correlation */
       SELECT submission_id AS "submissionId", user_id::text AS "auditUserId",
              attempt_id::text AS "attemptId", session_id AS "sessionId",
              hand_ordinal AS "handOrdinal", decision_ordinal AS "decisionOrdinal",
              snapshot_key AS "snapshotKey", question_id AS "questionId",
              answer_id AS "answerId", is_correct AS "isCorrect",
              lower(evidence_metadata ->> 'policyChecksum') AS "policyChecksum"
       FROM public.training_answers
       WHERE user_id = $1::uuid AND submission_id = ANY($2::text[])
       ORDER BY submission_id`,
        [publicContract.auditUserId, publicContract.expectedEventKeys]
      ),
      'answer correlation'
    );
    assert.equal(answerRows.length, TARGET_HANDS + 1, 'administrator answer row count mismatch');
    const expectedAnswers = new Map(
      publicEvidence.publicApi.parentCandidateAttempts.map((parent) => [
        parent.submissionId,
        { ...parent, answerId: parent.selectedAnswer },
      ])
    );
    expectedAnswers.set(publicEvidence.publicApi.continuation.submissionId, {
      ...publicEvidence.publicApi.continuation,
      answerId: publicEvidence.publicApi.childAnswer.selectedAnswer,
    });
    for (const row of answerRows) {
      const decision = expectedAnswers.get(row.submissionId);
      assert.ok(decision, 'administrator correlation found an unexpected answer');
      assert.equal(row.auditUserId, publicContract.auditUserId, 'answer owner mismatch');
      assert.equal(row.attemptId, publicContract.attemptId, 'answer attempt mismatch');
      assert.equal(
        row.sessionId,
        publicEvidence.publicApi.initialAttempt.sessionId,
        'answer session mismatch'
      );
      assert.equal(row.handOrdinal, decision.handOrdinal, 'answer hand mismatch');
      assert.equal(row.decisionOrdinal, decision.decisionOrdinal, 'answer decision mismatch');
      assert.equal(row.snapshotKey, decision.snapshotKey, 'answer snapshot mismatch');
      assert.equal(row.questionId, decision.questionId, 'answer question mismatch');
      assert.equal(row.answerId, decision.answerId, 'answer action mismatch');
      assert.equal(row.policyChecksum, decision.policyChecksum, 'answer policy mismatch');
      assert.equal(typeof row.isCorrect, 'boolean', 'answer correctness is missing');
    }

    const slotRows = rowsFromQuery(
      await database.query(
        `/* phase6:continuation-slot-correlation */
       SELECT attempt_id::text AS "attemptId", hand_ordinal AS "handOrdinal",
              decision_ordinal AS "decisionOrdinal", snapshot_key AS "snapshotKey",
              parent_snapshot_key AS "parentSnapshotKey",
              parent_submission_id AS "parentSubmissionId"
       FROM public.training_attempt_decision_slots
       WHERE attempt_id = $1::uuid AND hand_ordinal = $2::integer
         AND decision_ordinal = $3::integer`,
        [
          publicContract.attemptId,
          publicContract.continuation.handOrdinal,
          publicContract.continuation.decisionOrdinal,
        ]
      ),
      'continuation slot correlation'
    );
    assert.equal(slotRows.length, 1, 'administrator continuation slot is missing or ambiguous');
    const continuationParent = publicEvidence.publicApi.parentCandidateAttempts.find(
      ({ eventKey }) => eventKey === publicContract.continuation.parentEventKey
    );
    assert.ok(continuationParent, 'administrator continuation parent is missing');
    assert.deepEqual(
      slotRows[0],
      {
        attemptId: publicContract.attemptId,
        handOrdinal: publicContract.continuation.handOrdinal,
        decisionOrdinal: publicContract.continuation.decisionOrdinal,
        snapshotKey: publicContract.continuation.snapshotKey,
        parentSnapshotKey: continuationParent.snapshotKey,
        parentSubmissionId: publicContract.continuation.parentEventKey,
      },
      'administrator continuation slot binding mismatch'
    );

    const continuationSnapshotRows = rowsFromQuery(
      await database.query(
        `/* phase6:continuation-snapshot-correlation */
       SELECT snapshot_key AS "snapshotKey", source_question_id AS "questionId",
              game_id AS "gameId", level, question_data AS "questionData"
       FROM public.training_question_snapshots
       WHERE snapshot_key = ANY($1::text[])
       ORDER BY snapshot_key`,
        [[continuationParent.snapshotKey, publicContract.continuation.snapshotKey]]
      ),
      'continuation snapshot correlation'
    );
    assert.equal(
      continuationSnapshotRows.length,
      2,
      'administrator continuation snapshots are missing or ambiguous'
    );
    const snapshotByKey = new Map(
      continuationSnapshotRows.map((row) => [String(row.snapshotKey), row])
    );
    const parentSnapshot = snapshotByKey.get(String(continuationParent.snapshotKey));
    const childSnapshot = snapshotByKey.get(String(publicContract.continuation.snapshotKey));
    assert.ok(parentSnapshot && childSnapshot, 'administrator continuation snapshot keys mismatch');
    assert.equal(parentSnapshot.questionId, continuationParent.questionId, 'parent snapshot question mismatch');
    assert.equal(childSnapshot.questionId, publicContract.continuation.questionId, 'child snapshot question mismatch');
    for (const snapshot of [parentSnapshot, childSnapshot]) {
      assert.equal(snapshot.gameId, GAME_ID, 'continuation snapshot game mismatch');
      assert.equal(Number(snapshot.level), LEVEL, 'continuation snapshot level mismatch');
      assert.ok(
        snapshot.questionData && typeof snapshot.questionData === 'object',
        'continuation snapshot omitted canonical question data'
      );
    }
    const continuationGameConfig = pioQueryService.getGameConfig(GAME_ID);
    assert.equal(continuationGameConfig?.pioGameType, 'hu_cash', 'attestation game family drifted');
    assert.equal(Number(continuationGameConfig?.pioStackDepth), 100, 'attestation stack contract drifted');
    const strictSnapshotLineage = validateStrictTrainingContinuationSnapshotPair({
      parentQuestion: parentSnapshot.questionData,
      childQuestion: childSnapshot.questionData,
      persistedAnswerId: continuationParent.selectedAnswer,
      difficultyMode: PERSISTED_DIFFICULTY_MODE,
      gameConfig: continuationGameConfig,
    });
    assert.equal(
      strictSnapshotLineage?.ok,
      true,
      'administrator continuation snapshots failed strict solver-lineage verification'
    );

    const attestationRows = rowsFromQuery(
      await database.query(
        `/* phase6:private-attestation-correlation */
       SELECT a.contract_version AS "contractVersion", a.evidence_kind AS "evidenceKind",
              a.evidence_event_key AS "evidenceEventKey",
              (e.event_key IS NOT NULL) AS "evidenceEventExists",
              (e.user_id IS NOT NULL) AS "evidenceOwnerPresent"
       FROM public.training_delivery_authority_attestations a
       LEFT JOIN public.training_question_events e
         ON e.event_type = 'served' AND e.event_key = a.evidence_event_key
       WHERE a.contract_version = $1::text`,
        ['training-attempt-decision-authority-v1']
      ),
      'private delivery attestation correlation'
    );
    assert.equal(
      attestationRows.length,
      1,
      'private delivery attestation must contain exactly one authority row'
    );
    assert.equal(attestationRows[0].contractVersion, 'training-attempt-decision-authority-v1');
    assert.equal(attestationRows[0].evidenceKind, 'attempt_scoped_serve');
    assert.match(String(attestationRows[0].evidenceEventKey || ''), ATTEMPT_SCOPED_JTI_RE);
    assert.equal(attestationRows[0].evidenceEventExists, true);
    assert.equal(attestationRows[0].evidenceOwnerPresent, true);

    await rollbackAndVerify(database, 'read-only correlation');
    rolledBack = true;
    return {
      correlation: {
        status: 'passed',
        attemptId: publicContract.attemptId,
        auditUserId: publicContract.auditUserId,
        attemptRowBindingExact: true,
        attemptConfigHash: expectedAttemptConfigHash,
        continuationPrecommitBoundInAttemptConfig: true,
        servedEventCount: servedRows.length,
        servedEventKeys: servedRows.map(({ eventKey }) => eventKey),
        allServedFieldBindingsExact: true,
        answerCount: answerRows.length,
        answerSubmissionIds: answerRows.map(({ submissionId }) => submissionId),
        allAnswerFieldBindingsExact: true,
        continuationParentEventKey: publicContract.continuation.parentEventKey,
        continuationSlotBindingExact: true,
        continuationSnapshotLineageExact: true,
        continuationParentSourceClassification:
          strictSnapshotLineage.parentSourceClassification,
        continuationChildSourceClassification:
          strictSnapshotLineage.childSourceClassification,
      },
      privateAttemptScopedServeAttestation: {
        status: 'passed',
        rowCount: 1,
        contractVersion: attestationRows[0].contractVersion,
        evidenceKind: attestationRows[0].evidenceKind,
        evidenceEventKey: attestationRows[0].evidenceEventKey,
        evidenceEventExists: true,
        evidenceOwnerPresent: true,
      },
      servedRows,
      answerRows,
      continuationSlot: slotRows[0],
      databaseIdentity: {
        currentUser: modeRows[0].currentUser,
        currentDatabase: modeRows[0].currentDatabase,
        serverVersionNum: modeRows[0].serverVersionNum,
      },
      readOnlyVerified: true,
      transactionRolledBack: true,
    };
  } finally {
    if (transactionStarted && !rolledBack) {
      await rollbackAndVerify(database, 'failed read-only correlation').catch(() => {
        throw new Error('TRAINING_PHASE6_DATABASE_ROLLBACK_FAILED');
      });
    }
  }
}

function probeInputFor(name, publicEvidence, publicContract, databaseEvidence, nowEpochSeconds) {
  const parent = publicEvidence.publicApi.parentCandidateAttempts[0];
  const continuation = publicEvidence.publicApi.continuation;
  const servedParent = databaseEvidence.servedRows.find(
    ({ eventKey }) => eventKey === parent.eventKey
  );
  assert.ok(servedParent, `negative probe ${name} could not locate its exact served parent`);
  const receiptExpiresAt = nowEpochSeconds + 3_600;
  switch (name) {
    case 'answeredSlotPromotion':
      return {
        text: `/* phase6:probe:answeredSlotPromotion */
          SELECT public.fn_training_attempt_record_served_batch_v1(
            $1::uuid, $2::uuid, $3::jsonb
          ) AS result`,
        params: [
          publicContract.attemptId,
          publicContract.auditUserId,
          JSON.stringify([
            {
              handOrdinal: parent.handOrdinal,
              decisionOrdinal: parent.decisionOrdinal,
              snapshotKey: parent.snapshotKey,
              questionId: parent.questionId,
              policyChecksum: parent.policyChecksum,
              difficultyMode: PERSISTED_DIFFICULTY_MODE,
              rngRolls: servedParent.rngRolls,
            },
          ]),
        ],
      };
    case 'changedAnswerReplay':
      return {
        text: `/* phase6:probe:changedAnswerReplay */
          UPDATE public.training_answers
          SET answer_id = answer_id || '__phase6_changed_replay_probe'
          WHERE user_id = $1::uuid AND submission_id = $2::text`,
        params: [publicContract.auditUserId, parent.submissionId],
      };
    case 'changedSlotBinding':
      return {
        text: `/* phase6:probe:changedSlotBinding */
          UPDATE public.training_attempt_decision_slots
          SET snapshot_key = $4::text
          WHERE attempt_id = $1::uuid AND hand_ordinal = $2::integer
            AND decision_ordinal = $3::integer`,
        params: [
          publicContract.attemptId,
          continuation.handOrdinal,
          continuation.decisionOrdinal,
          parent.snapshotKey,
        ],
      };
    case 'neverServedSnapshot':
      return {
        setup: [
          {
            text: `/* phase6:probe:neverServedSnapshot:setup */
            DELETE FROM public.training_question_events
            WHERE event_type = 'served' AND event_key = $1::text
              AND user_id = $2::uuid
              AND metadata ->> 'attemptId' = $3::text`,
            params: [parent.eventKey, publicContract.auditUserId, publicContract.attemptId],
            expectedRowCount: 1,
          },
        ],
        text: `/* phase6:probe:neverServedSnapshot */
          SELECT public.fn_training_authorize_attempt_decision_v1(
            $1::uuid, $2::uuid, $3::integer, $4::integer,
            $5::text, $6::text, $7::text
          ) AS result`,
        params: [
          publicContract.attemptId,
          publicContract.auditUserId,
          parent.handOrdinal,
          parent.decisionOrdinal,
          parent.snapshotKey,
          parent.questionId,
          parent.policyChecksum,
        ],
      };
    case 'nonV4PredecessorId':
      return {
        text: `/* phase6:probe:nonV4PredecessorId */
          SELECT public.fn_training_promote_legacy_signed_decision_v1(
            $1::uuid, $2::uuid, $3::integer, $4::integer,
            $5::text, $6::text, $7::text, $8::text, $9::bigint, $10::bigint
          ) AS result`,
        params: [
          publicContract.attemptId,
          publicContract.auditUserId,
          parent.handOrdinal,
          parent.decisionOrdinal,
          parent.snapshotKey,
          parent.questionId,
          parent.policyChecksum,
          '11111111-1111-1111-8111-111111111111',
          nowEpochSeconds,
          receiptExpiresAt,
        ],
      };
    case 'nullOwnerLegacyEvent':
      return {
        text: `/* phase6:probe:nullOwnerLegacyEvent */
          SELECT public.fn_training_promote_legacy_signed_decision_v1(
            $1::uuid, NULL::uuid, $2::integer, $3::integer,
            $4::text, $5::text, $6::text, $7::text, $8::bigint, $9::bigint
          ) AS result`,
        params: [
          publicContract.attemptId,
          parent.handOrdinal,
          parent.decisionOrdinal,
          parent.snapshotKey,
          parent.questionId,
          parent.policyChecksum,
          '22222222-2222-4222-8222-222222222222',
          nowEpochSeconds,
          receiptExpiresAt,
        ],
      };
    default:
      throw new Error(`Unreviewed Phase 6 negative probe refused: ${name}`);
  }
}

async function verifyProbeRollback(
  database,
  name,
  publicEvidence,
  publicContract,
  databaseEvidence
) {
  const parent = publicEvidence.publicApi.parentCandidateAttempts[0];
  const continuation = publicEvidence.publicApi.continuation;
  if (name === 'changedAnswerReplay') {
    const rows = rowsFromQuery(
      await database.query(
        `/* phase6:probe-postcheck:changedAnswerReplay */
       SELECT answer_id AS "answerId" FROM public.training_answers
       WHERE user_id = $1::uuid AND submission_id = $2::text`,
        [publicContract.auditUserId, parent.submissionId]
      ),
      'changed-answer rollback check'
    );
    assert.deepEqual(
      rows,
      [{ answerId: parent.selectedAnswer }],
      'changed-answer probe was not rolled back'
    );
  } else if (name === 'changedSlotBinding') {
    const rows = rowsFromQuery(
      await database.query(
        `/* phase6:probe-postcheck:changedSlotBinding */
       SELECT snapshot_key AS "snapshotKey"
       FROM public.training_attempt_decision_slots
       WHERE attempt_id = $1::uuid AND hand_ordinal = $2::integer
         AND decision_ordinal = $3::integer`,
        [publicContract.attemptId, continuation.handOrdinal, continuation.decisionOrdinal]
      ),
      'changed-slot rollback check'
    );
    assert.deepEqual(
      rows,
      [{ snapshotKey: databaseEvidence.continuationSlot.snapshotKey }],
      'changed-slot probe was not rolled back'
    );
  } else if (name === 'neverServedSnapshot') {
    const rows = rowsFromQuery(
      await database.query(
        `/* phase6:probe-postcheck:neverServedSnapshot */
       SELECT count(*)::integer AS count
       FROM public.training_question_events
       WHERE event_type = 'served' AND event_key = $1::text AND user_id = $2::uuid`,
        [parent.eventKey, publicContract.auditUserId]
      ),
      'never-served rollback check'
    );
    assert.deepEqual(
      rows,
      [{ count: 1 }],
      'never-served probe did not restore the served event on rollback'
    );
  }
}

async function runOneRollbackNegativeProbe(
  database,
  name,
  publicEvidence,
  publicContract,
  databaseEvidence,
  nowEpochSeconds
) {
  assert.ok(
    ADMIN_NEGATIVE_PROBES.includes(name),
    `Unreviewed Phase 6 negative probe refused: ${name}`
  );
  const expectation = ADMIN_NEGATIVE_PROBE_EXPECTATIONS[name];
  const input = probeInputFor(
    name,
    publicEvidence,
    publicContract,
    databaseEvidence,
    nowEpochSeconds
  );
  let transactionStarted = false;
  let rolledBack = false;
  let matched = false;
  let unexpectedFailure = null;
  try {
    await database.query('BEGIN');
    transactionStarted = true;
    await database.query("SET LOCAL lock_timeout = '2s'");
    await database.query("SET LOCAL statement_timeout = '15s'");
    for (const setup of input.setup || []) {
      const result = await database.query(setup.text, setup.params);
      if (setup.expectedRowCount !== undefined) {
        assert.equal(
          result.rowCount,
          setup.expectedRowCount,
          `${name} setup did not touch exactly the reviewed row`
        );
      }
    }
    try {
      const result = await database.query(input.text, input.params);
      if (expectation.outcome === 'result') {
        const rows = rowsFromQuery(result, `${name} result`);
        matched =
          rows.length === 1 &&
          rows[0]?.result?.authorized === false &&
          rows[0]?.result?.code === expectation.code;
      }
    } catch (error) {
      if (expectation.outcome === 'error') {
        matched =
          String(error?.code || '') === expectation.code &&
          String(error?.message || '').includes(expectation.message);
      } else {
        unexpectedFailure = new Error(`Phase 6 negative probe failed unexpectedly: ${name}`);
      }
    }
    if (!matched && !unexpectedFailure) {
      unexpectedFailure = new Error(`Phase 6 negative probe returned the wrong refusal: ${name}`);
    }
  } finally {
    if (transactionStarted) {
      try {
        await rollbackAndVerify(database, `negative probe ${name}`, () =>
          verifyProbeRollback(database, name, publicEvidence, publicContract, databaseEvidence)
        );
        rolledBack = true;
      } catch {
        throw new Error(`TRAINING_PHASE6_NEGATIVE_PROBE_ROLLBACK_FAILED:${name}`);
      }
    }
  }
  assert.equal(rolledBack, true, `negative probe was not rolled back: ${name}`);
  if (unexpectedFailure) throw unexpectedFailure;
  return 'passed';
}

async function collectNegativeRefusalMatrix(
  database,
  publicEvidence,
  publicContract,
  databaseEvidence,
  nowEpochSeconds
) {
  assert.deepEqual(
    Object.keys(ADMIN_NEGATIVE_PROBE_EXPECTATIONS),
    ADMIN_NEGATIVE_PROBES,
    'negative probe implementation and release contract diverged'
  );
  const probes = {};
  for (const name of ADMIN_NEGATIVE_PROBES) {
    probes[name] = await runOneRollbackNegativeProbe(
      database,
      name,
      publicEvidence,
      publicContract,
      databaseEvidence,
      nowEpochSeconds
    );
  }
  return {
    status: 'passed',
    probeCount: ADMIN_NEGATIVE_PROBES.length,
    transactionRolledBack: true,
    probes,
  };
}

export async function createPostgresMachineCollectorTransport({ connectionString, pgModule } = {}) {
  const credential = validateDatabaseCredential(connectionString);
  const pgLibrary = pgModule || (await import('pg'));
  const Client = pgLibrary.Client || pgLibrary.default?.Client;
  assert.equal(typeof Client, 'function', 'PostgreSQL client implementation is unavailable');
  const client = new Client({
    connectionString: credential,
    application_name: 'smarter-poker-phase6-admin-collector',
    connectionTimeoutMillis: 10_000,
    query_timeout: 30_000,
  });
  try {
    await client.connect();
  } catch {
    throw new Error('TRAINING_PHASE6_DATABASE_CONNECTION_FAILED');
  }
  let closed = false;
  return {
    async query(text, params = []) {
      assert.equal(closed, false, 'Phase 6 database transport is closed');
      assert.equal(typeof text, 'string', 'Phase 6 database query text is required');
      assert.ok(Array.isArray(params), 'Phase 6 database query parameters must be an array');
      return client.query(text, params);
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        await client.end();
      } catch {
        throw new Error('TRAINING_PHASE6_DATABASE_CLOSE_FAILED');
      }
    },
  };
}

function parseVercelJsonLines(stdout, label) {
  const rows = [];
  for (const line of String(stdout || '')
    .split(/\r?\n/)
    .filter((value) => value.trim().length > 0)) {
    try {
      const parsed = JSON.parse(line);
      assert.ok(parsed && typeof parsed === 'object' && !Array.isArray(parsed));
      rows.push(parsed);
    } catch {
      throw new Error(`TRAINING_PHASE6_VERCEL_LOG_OUTPUT_INVALID:${label}`);
    }
  }
  return rows;
}

export function createVercelCliRuntimeLogTransport({
  token,
  project,
  scope = null,
  executable = 'vercel',
  spawnSyncFn = spawnSync,
  environment = process.env,
} = {}) {
  assert.ok(
    typeof token === 'string' && token.length >= 20 && !/\s/.test(token),
    'Vercel log adapter credential is invalid'
  );
  assert.ok(
    typeof project === 'string' && project.trim().length > 0,
    'Vercel log adapter project is required'
  );
  assert.equal(typeof spawnSyncFn, 'function', 'Vercel log adapter process transport is required');
  return {
    async collect({ deploymentId, deploymentUrl, expectedBuild, windowStart, windowEnd }) {
      assert.ok(
        String(deploymentId || '').length > 0,
        'Vercel log adapter requires an exact deployment ID'
      );
      validateImmutableDeploymentUrl(deploymentUrl);
      assert.match(
        String(expectedBuild || ''),
        SHA40_RE,
        'Vercel log adapter requires an exact build SHA'
      );
      isoTimestamp(windowStart, 'Vercel log window start');
      isoTimestamp(windowEnd, 'Vercel log window end');
      assert.ok(
        Date.parse(windowEnd) >= Date.parse(windowStart),
        'Vercel log window ends before it starts'
      );
      const records = [];
      for (const level of ['error', 'fatal']) {
        const args = [
          'logs',
          '--deployment',
          deploymentId,
          '--project',
          project,
          '--level',
          level,
          '--since',
          windowStart,
          '--until',
          windowEnd,
          '--limit',
          String(ADMIN_LOG_LIMIT),
          '--json',
          '--no-follow',
          '--non-interactive',
          '--no-color',
        ];
        if (scope) args.push('--scope', scope);
        const result = spawnSyncFn(executable, args, {
          encoding: 'utf8',
          env: {
            PATH: environment.PATH,
            HOME: environment.HOME,
            TMPDIR: environment.TMPDIR,
            VERCEL_TOKEN: token,
            NO_COLOR: '1',
          },
          maxBuffer: 32 * 1024 * 1024,
        });
        if (result?.error || result?.status !== 0) {
          throw new Error(`TRAINING_PHASE6_VERCEL_LOG_QUERY_FAILED:${level}`);
        }
        const levelRows = parseVercelJsonLines(result.stdout, level);
        assert.ok(
          levelRows.length < ADMIN_LOG_LIMIT,
          `TRAINING_PHASE6_VERCEL_LOG_QUERY_TRUNCATED:${level}`
        );
        for (const row of levelRows) {
          const observedDeploymentId = row.deploymentId || row.deployment?.id || null;
          if (observedDeploymentId !== null) {
            assert.equal(
              observedDeploymentId,
              deploymentId,
              'Vercel log adapter returned a cross-deployment record'
            );
          }
          records.push({ level, record: row });
        }
      }
      return {
        source: 'vercel_cli_runtime_logs',
        deploymentId,
        deploymentUrl,
        expectedBuild,
        windowStart,
        windowEnd,
        levelsReviewed: ['error', 'fatal'],
        queryComplete: true,
        relevantErrorCount: records.length,
      };
    },
  };
}

function createControlledPredecessorRehearsalTransport({ spawnSyncFn = spawnSync } = {}) {
  const verifierPath = resolve(ROOT, 'scripts/verify-training-cache-replay-postgres.mjs');
  const verifierBytes = readFileSync(verifierPath);
  const verifierSha256 = createHash('sha256').update(verifierBytes).digest('hex');
  return {
    async collect() {
      const result = spawnSyncFn(process.execPath, [verifierPath], {
        cwd: ROOT,
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          TMPDIR: process.env.TMPDIR,
          ...(process.env.PHASE6_POSTGRES_BIN
            ? { PHASE6_POSTGRES_BIN: process.env.PHASE6_POSTGRES_BIN }
            : {}),
        },
        maxBuffer: 8 * 1024 * 1024,
      });
      if (result?.error || result?.status !== 0) {
        throw new Error('TRAINING_PHASE6_CONTROLLED_PREDECESSOR_REHEARSAL_FAILED');
      }
      const evidenceLine = String(result.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.slice(line.indexOf('{')).trim())
        .find((line) => line.startsWith('{') && line.endsWith('}'));
      if (!evidenceLine)
        throw new Error('TRAINING_PHASE6_CONTROLLED_PREDECESSOR_REHEARSAL_OUTPUT_INVALID');
      let evidence;
      try {
        evidence = JSON.parse(evidenceLine);
      } catch {
        throw new Error('TRAINING_PHASE6_CONTROLLED_PREDECESSOR_REHEARSAL_OUTPUT_INVALID');
      }
      for (const gate of [
        'schemaFirstPredecessorWritePreserved',
        'twoProtectedPrExpandContractStaging',
        'legacyReceiptRequiresRfc4122V4',
        'legacyDirectUuidSupported',
        'legacyContinuationReconstructed',
        'legacyPromotionWindowBounded',
        'nullOwnerPoisoningBlocked',
        'neverServedSnapshotAuthorizationDenied',
        'answeredSlotRefused',
      ]) {
        assert.equal(
          evidence?.[gate],
          true,
          `controlled predecessor rehearsal did not prove ${gate}`
        );
      }
      return {
        status: 'passed',
        method: 'controlled_rollback_rehearsal',
        provenance: 'controlled_rehearsal_not_authentic',
        artifactSha256: null,
        trustedKeySha256: null,
        verifierSha256,
        transactionRolledBack: true,
        initialWrite: 'passed',
        continuationWrite: 'passed',
      };
    },
  };
}

export function verifyAuthenticPredecessorArtifact(config, publicContract) {
  const artifactBytes = readFileSync(config.artifactPath);
  let artifact;
  try {
    artifact = JSON.parse(artifactBytes.toString('utf8'));
  } catch {
    throw new Error('Authentic predecessor artifact is not valid JSON.');
  }
  assertExactObjectKeys(
    artifact,
    ['schemaVersion', 'evidenceKind', 'signatureAlgorithm', 'keyId', 'payload', 'signature'],
    'authentic predecessor artifact'
  );
  assert.equal(artifact.schemaVersion, 1, 'authentic predecessor artifact schema mismatch');
  assert.equal(
    artifact.evidenceKind,
    AUTHENTIC_PREDECESSOR_KIND,
    'authentic predecessor artifact kind mismatch'
  );
  assert.equal(
    artifact.signatureAlgorithm,
    AUTHENTIC_PREDECESSOR_ALGORITHM,
    'authentic predecessor signature algorithm mismatch'
  );
  assert.ok(
    typeof artifact.keyId === 'string' &&
      artifact.keyId.length >= 3 &&
      artifact.keyId.length <= 120,
    'authentic predecessor key ID is invalid'
  );
  assertExactObjectKeys(
    artifact.payload,
    ['auditUserId', 'attemptId', 'initial', 'continuation'],
    'authentic predecessor payload'
  );
  assert.equal(
    artifact.payload.auditUserId,
    publicContract.auditUserId,
    'authentic predecessor artifact belongs to a different audit account'
  );
  assert.match(
    String(artifact.payload.attemptId || ''),
    UUID_V4_RE,
    'authentic predecessor artifact attempt is invalid'
  );
  for (const [label, decision, expectedDecisionOrdinal] of [
    ['initial', artifact.payload.initial, 1],
    ['continuation', artifact.payload.continuation, 2],
  ]) {
    assertExactObjectKeys(
      decision,
      ['eventKey', 'receiptId', 'handOrdinal', 'decisionOrdinal'],
      `authentic predecessor ${label}`
    );
    assert.match(
      String(decision.receiptId || ''),
      UUID_V4_RE,
      `authentic predecessor ${label} receipt ID is invalid`
    );
    assert.equal(
      decision.decisionOrdinal,
      expectedDecisionOrdinal,
      `authentic predecessor ${label} decision ordinal is invalid`
    );
    assert.ok(
      Number.isSafeInteger(decision.handOrdinal) && decision.handOrdinal >= 1,
      `authentic predecessor ${label} hand ordinal is invalid`
    );
    assert.equal(
      decision.eventKey,
      `training-attempt:${artifact.payload.attemptId}:hand:${decision.handOrdinal}:decision:${decision.decisionOrdinal}`,
      `authentic predecessor ${label} event key is not canonical`
    );
  }
  assert.equal(
    artifact.payload.continuation.handOrdinal,
    artifact.payload.initial.handOrdinal,
    'authentic predecessor continuation changed hand'
  );
  assert.notEqual(
    artifact.payload.initial.receiptId,
    artifact.payload.continuation.receiptId,
    'authentic predecessor receipt IDs must be distinct'
  );
  assert.match(
    String(artifact.signature || ''),
    /^[A-Za-z0-9+/]+={0,2}$/,
    'authentic predecessor signature encoding is invalid'
  );
  const signatureBytes = Buffer.from(artifact.signature, 'base64');
  assert.equal(
    signatureBytes.length,
    64,
    'authentic predecessor Ed25519 signature length is invalid'
  );
  assert.equal(
    signatureBytes.toString('base64'),
    artifact.signature,
    'authentic predecessor signature encoding is not canonical'
  );
  const publicKeyBytes = readFileSync(config.publicKeyPath);
  const trustedKeySha256 = createHash('sha256').update(publicKeyBytes).digest('hex');
  assert.equal(
    trustedKeySha256,
    config.trustedKeySha256,
    'authentic predecessor public key fingerprint mismatch'
  );
  let key;
  try {
    key = createPublicKey(publicKeyBytes);
  } catch {
    throw new Error('Authentic predecessor public key is invalid.');
  }
  const verified = verifyDetachedSignature(
    null,
    Buffer.from(stableJson(artifact.payload)),
    key,
    signatureBytes
  );
  assert.equal(verified, true, 'authentic predecessor detached signature did not verify');
  return {
    payload: artifact.payload,
    artifactSha256: createHash('sha256').update(artifactBytes).digest('hex'),
    trustedKeySha256,
  };
}

async function collectAuthenticPredecessorCompatibility(database, config, publicContract) {
  const artifact = verifyAuthenticPredecessorArtifact(config, publicContract);
  let transactionStarted = false;
  let rolledBack = false;
  try {
    await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;
    await database.query("SET LOCAL lock_timeout = '2s'");
    await database.query("SET LOCAL statement_timeout = '30s'");
    const rows = rowsFromQuery(
      await database.query(
        `/* phase6:authentic-predecessor-correlation */
       SELECT event_key AS "eventKey", user_id::text AS "auditUserId",
              metadata ->> 'attemptId' AS "attemptId",
              (metadata ->> 'handOrdinal')::integer AS "handOrdinal",
              (metadata ->> 'decisionOrdinal')::integer AS "decisionOrdinal",
              metadata ->> 'legacyReceiptId' AS "receiptId",
              metadata ->> 'legacyProofKind' AS "legacyProofKind"
       FROM public.training_question_events
       WHERE event_type = 'served' AND user_id = $1::uuid
         AND metadata ->> 'attemptId' = $2::text
         AND metadata ->> 'legacyReceiptId' = ANY($3::text[])
         AND metadata ->> 'legacySignedReceiptRecovery' = 'true'
       ORDER BY (metadata ->> 'decisionOrdinal')::integer`,
        [
          artifact.payload.auditUserId,
          artifact.payload.attemptId,
          [artifact.payload.initial.receiptId, artifact.payload.continuation.receiptId],
        ]
      ),
      'authentic predecessor correlation'
    );
    assert.equal(
      rows.length,
      2,
      'authentic predecessor artifact did not correlate to both immutable production events'
    );
    for (const [index, expected] of [
      artifact.payload.initial,
      artifact.payload.continuation,
    ].entries()) {
      assert.equal(
        rows[index].eventKey,
        expected.eventKey,
        'authentic predecessor event key mismatch'
      );
      assert.equal(
        rows[index].auditUserId,
        artifact.payload.auditUserId,
        'authentic predecessor owner mismatch'
      );
      assert.equal(
        rows[index].attemptId,
        artifact.payload.attemptId,
        'authentic predecessor attempt mismatch'
      );
      assert.equal(
        rows[index].handOrdinal,
        expected.handOrdinal,
        'authentic predecessor hand mismatch'
      );
      assert.equal(
        rows[index].decisionOrdinal,
        expected.decisionOrdinal,
        'authentic predecessor decision mismatch'
      );
      assert.equal(
        rows[index].receiptId,
        expected.receiptId,
        'authentic predecessor receipt ID mismatch'
      );
      assert.ok(
        ['predecessor_served_event', 'replay_parent_answer'].includes(rows[index].legacyProofKind),
        'authentic predecessor immutable event has invalid provenance'
      );
    }
    await rollbackAndVerify(database, 'authentic predecessor correlation');
    rolledBack = true;
    return {
      status: 'passed',
      method: 'authentic_saved_receipt',
      provenance: 'signature_verified_authentic_artifact',
      artifactSha256: artifact.artifactSha256,
      trustedKeySha256: artifact.trustedKeySha256,
      verifierSha256: null,
      transactionRolledBack: true,
      initialWrite: 'passed',
      continuationWrite: 'passed',
    };
  } finally {
    if (transactionStarted && !rolledBack) {
      await rollbackAndVerify(database, 'failed authentic predecessor correlation').catch(() => {
        throw new Error('TRAINING_PHASE6_PREDECESSOR_ROLLBACK_FAILED');
      });
    }
  }
}

function validateMachineCollectorCoreConfig(config, runtime) {
  assert.ok(config && typeof config === 'object', 'machine collector configuration is required');
  const publicEvidencePath = resolve(String(config.publicEvidencePath || ''));
  assert.equal(
    existsSync(publicEvidencePath),
    true,
    'immutable public evidence file does not exist'
  );
  assert.match(
    String(config.expectedAuditUserId || ''),
    UUID_V4_RE,
    'machine collector expected audit account is invalid'
  );
  assert.match(
    String(config.expectedSupabaseProjectRef || ''),
    /^[a-z0-9]{20}$/,
    'machine collector expected Supabase project ref is invalid'
  );
  assert.equal(
    config.acknowledgement,
    ADMIN_CLOSEOUT_ACKNOWLEDGEMENT,
    'machine collector closeout acknowledgement is invalid'
  );
  assert.ok(
    config.predecessor?.mode === 'authentic_artifact' ||
      config.predecessor?.mode === 'controlled_rehearsal',
    'machine collector predecessor mode is invalid'
  );
  if (config.predecessor.mode === 'controlled_rehearsal') {
    assert.equal(
      config.predecessor.rehearsalAcknowledged,
      true,
      'controlled rehearsal was not explicitly acknowledged as non-authentic'
    );
  }
  if (!runtime.databaseTransport)
    validateDatabaseCredential(config.databaseUrl, config.expectedSupabaseProjectRef);
  if (!runtime.logTransport) {
    assert.ok(
      typeof config.vercelToken === 'string' && config.vercelToken.length >= 20,
      'machine collector Vercel credential is missing'
    );
    assert.ok(
      typeof config.vercelProject === 'string' && config.vercelProject.length > 0,
      'machine collector Vercel project is missing'
    );
  }
  return { ...config, publicEvidencePath };
}

/**
 * Exported orchestration core for fake-transport contract tests. It can create
 * a candidate administrator artifact, but it intentionally cannot receive the
 * module-private proof and therefore cannot finalize or write a green release.
 */
export async function collectMachineAdministratorEvidenceCore(config, runtime = {}) {
  config = validateMachineCollectorCoreConfig(config, runtime);
  const publicParsed = parseJsonEvidence(config.publicEvidencePath, 'public evidence');
  const publicContract = validateCompletePublicAttestation(publicParsed.value);
  assert.equal(
    publicContract.auditUserId,
    config.expectedAuditUserId,
    'public evidence belongs to a different designated audit account'
  );
  const initialDeployment = await readDeploymentIdentity(
    publicContract.deploymentUrl,
    publicParsed.value.expectedBuild,
    { fetchFn: runtime.fetchFn, now: runtime.nowMs }
  );
  assert.deepEqual(
    initialDeployment,
    publicParsed.value.deployment,
    'live deployment health does not match immutable public evidence'
  );

  const database =
    runtime.databaseTransport ||
    (await createPostgresMachineCollectorTransport({
      connectionString: config.databaseUrl,
    }));
  const logTransport =
    runtime.logTransport ||
    createVercelCliRuntimeLogTransport({
      token: config.vercelToken,
      project: config.vercelProject,
      scope: config.vercelScope,
      executable: config.vercelExecutable,
    });
  const now = runtime.now || (() => new Date());
  let databaseEvidence;
  let negativeRefusalMatrix;
  let predecessorRollbackCompatibility;
  try {
    databaseEvidence = await collectReadOnlyDatabaseCorrelation(
      database,
      publicParsed.value,
      publicContract
    );
    negativeRefusalMatrix = await collectNegativeRefusalMatrix(
      database,
      publicParsed.value,
      publicContract,
      databaseEvidence,
      Math.floor(now().getTime() / 1_000)
    );
    if (config.predecessor.mode === 'authentic_artifact') {
      predecessorRollbackCompatibility = runtime.predecessorTransport
        ? await runtime.predecessorTransport.collect({
            database,
            config: config.predecessor,
            publicEvidence: publicParsed.value,
            publicContract,
          })
        : await collectAuthenticPredecessorCompatibility(
            database,
            config.predecessor,
            publicContract
          );
    }
  } finally {
    await database.close();
  }
  if (config.predecessor.mode === 'controlled_rehearsal') {
    const rehearsal =
      runtime.predecessorTransport || createControlledPredecessorRehearsalTransport();
    predecessorRollbackCompatibility = await rehearsal.collect({
      publicEvidence: publicParsed.value,
      publicContract,
    });
  }

  const logReview = await logTransport.collect({
    deploymentId: publicContract.deploymentId,
    deploymentUrl: publicContract.deploymentUrl,
    expectedBuild: publicParsed.value.expectedBuild,
    windowStart: publicParsed.value.startedAt,
    windowEnd: publicParsed.value.completedAt,
  });
  assert.deepEqual(
    logReview,
    {
      source: 'vercel_cli_runtime_logs',
      deploymentId: publicContract.deploymentId,
      deploymentUrl: publicContract.deploymentUrl,
      expectedBuild: publicParsed.value.expectedBuild,
      windowStart: publicParsed.value.startedAt,
      windowEnd: publicParsed.value.completedAt,
      levelsReviewed: ['error', 'fatal'],
      queryComplete: true,
      relevantErrorCount: 0,
    },
    'exact-deployment Vercel error-stream review is incomplete or found relevant errors'
  );

  const finalDeployment = await readDeploymentIdentity(
    publicContract.deploymentUrl,
    publicParsed.value.expectedBuild,
    { fetchFn: runtime.fetchFn, now: runtime.nowMs }
  );
  assert.deepEqual(
    finalDeployment,
    initialDeployment,
    'deployment identity changed during administrator collection'
  );
  const currentPublic = parseJsonEvidence(config.publicEvidencePath, 'public evidence');
  assert.equal(
    currentPublic.digest,
    publicParsed.digest,
    'immutable public evidence changed during administrator collection'
  );

  const verifiedAt = now().toISOString();
  assert.ok(
    Date.parse(verifiedAt) >= publicContract.completedAt,
    'machine collector verification predates public completion'
  );
  const identity = databaseEvidence.databaseIdentity;
  assert.ok(
    String(identity.currentUser || '').length > 0,
    'administrator database current_user is missing'
  );
  assert.ok(
    String(identity.currentDatabase || '').length > 0,
    'administrator database current_database is missing'
  );
  assert.match(
    String(identity.serverVersionNum || ''),
    /^\d{5,6}$/,
    'administrator database server version is invalid'
  );

  const adminEvidence = {
    schemaVersion: 1,
    evidenceKind: ADMIN_EVIDENCE_KIND,
    publicEvidenceSha256: publicParsed.digest,
    expectedBuild: publicParsed.value.expectedBuild,
    auditUserId: publicContract.auditUserId,
    attemptId: publicContract.attemptId,
    verifiedAt,
    deployment: {
      expectedBuild: publicParsed.value.expectedBuild,
      deploymentUrl: publicContract.deploymentUrl,
      deploymentId: publicContract.deploymentId,
    },
    collector: {
      kind: ADMIN_COLLECTOR_KIND,
      status: 'complete',
      generatedAt: verifiedAt,
      queryMode: 'read_only_plus_explicit_rolled_back_probes',
      currentUser: identity.currentUser,
      currentDatabase: identity.currentDatabase,
      serverVersionNum: identity.serverVersionNum,
      supabaseProjectRef: config.expectedSupabaseProjectRef,
      publicEvidenceSha256: publicParsed.digest,
      correlationReadOnlyVerified: databaseEvidence.readOnlyVerified,
      correlationTransactionRolledBack: databaseEvidence.transactionRolledBack,
      rollbackVerificationCount: 1 + ADMIN_NEGATIVE_PROBES.length + 1,
    },
    correlation: databaseEvidence.correlation,
    privateAttemptScopedServeAttestation: databaseEvidence.privateAttemptScopedServeAttestation,
    negativeRefusalMatrix,
    predecessorRollbackCompatibility,
    productionErrorStreamReview: {
      status: 'passed',
      expectedBuild: logReview.expectedBuild,
      deploymentId: logReview.deploymentId,
      relevantErrorCount: logReview.relevantErrorCount,
      windowStart: logReview.windowStart,
      windowEnd: logReview.windowEnd,
      settledWindowCovered: true,
      source: logReview.source,
      deploymentUrl: logReview.deploymentUrl,
      queryComplete: logReview.queryComplete,
      levelsReviewed: logReview.levelsReviewed,
    },
  };
  assertEvidenceContainsNoSecrets(adminEvidence, 'machine-generated administrator evidence');
  // Structural validation is useful to callers, but no exported function has
  // access to MACHINE_COLLECTOR_PROOF; only the private writer below can turn
  // this candidate into finalized evidence.
  assert.throws(
    () => validateAdministratorCloseout(publicParsed.value, adminEvidence, publicParsed.digest),
    /MACHINE_ADMIN_COLLECTOR_REQUIRED/
  );
  return { publicParsed, adminEvidence };
}

async function runMachineAdministratorCollector(config = readMachineCollectorConfig()) {
  const paths = [resolve(config.adminEvidencePath), resolve(config.finalEvidencePath)].sort();
  const leases = [];
  try {
    for (const path of paths) leases.push(acquireEvidenceRunLock(path));
    const collected = await collectMachineAdministratorEvidenceCore(config);
    const adminBytes = `${JSON.stringify(collected.adminEvidence, null, 2)}\n`;
    const adminParsed = {
      value: collected.adminEvidence,
      digest: createHash('sha256').update(adminBytes).digest('hex'),
    };
    const finalized = finalizedEvidenceFromMachineCollection({
      publicParsed: collected.publicParsed,
      adminParsed,
      machineCollectorProof: MACHINE_COLLECTOR_PROOF,
    });
    assert.equal(
      attestationExitCode(finalized),
      0,
      'machine-collected final evidence did not satisfy release exit semantics'
    );
    assert.equal(
      parseJsonEvidence(config.publicEvidencePath, 'public evidence').digest,
      collected.publicParsed.digest,
      'immutable public evidence changed before final output commit'
    );
    writeOutputAtomic(resolve(config.adminEvidencePath), collected.adminEvidence, {
      overwrite: false,
    });
    writeOutputAtomic(resolve(config.finalEvidencePath), finalized, { overwrite: false });
    assert.equal(
      statSync(resolve(config.adminEvidencePath)).mode & 0o777,
      0o600,
      'administrator evidence mode is not 0600'
    );
    assert.equal(
      statSync(resolve(config.finalEvidencePath)).mode & 0o777,
      0o600,
      'final evidence mode is not 0600'
    );
    return finalized;
  } finally {
    for (const lease of leases.reverse()) lease.release();
  }
}

export function originScopedAuthState(state, targetOrigin) {
  const trustedSources = (state?.origins || []).filter(
    ({ origin }) =>
      origin === 'https://smarter.poker' || /^http:\/\/127\.0\.0\.1:\d+$/.test(String(origin || ''))
  );
  const candidates = trustedSources.flatMap((source) =>
    (source.localStorage || [])
      .filter(({ name, value }) => name === 'smarter-poker-auth' && value)
      .map((item) => ({ ...item, sourceOrigin: source.origin }))
  );
  assert.equal(
    candidates.length,
    1,
    'authenticated storage state must contain exactly one trusted smarter-poker-auth value'
  );
  const [item] = candidates;
  assert.ok(item?.value, 'authenticated storage state omitted smarter-poker-auth');
  const session = JSON.parse(item.value);
  assert.ok(session?.access_token, 'authenticated storage state omitted an access token');
  assert.ok(session?.refresh_token, 'authenticated storage state omitted a refresh token');
  return {
    cookies: [],
    origins: [
      {
        origin: targetOrigin,
        localStorage: [{ name: 'smarter-poker-auth', value: item.value }],
      },
    ],
  };
}

function decodeJwtPayload(accessToken) {
  const parts = String(accessToken || '').split('.');
  assert.equal(parts.length, 3, 'saved access token is not a JWT');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('saved access token JWT payload is invalid');
  }
  assert.ok(
    payload && typeof payload === 'object' && !Array.isArray(payload),
    'saved access token JWT payload is invalid'
  );
  return payload;
}

export function validateDesignatedAuditAuthState(state, targetOrigin, expectedAuditUserId) {
  assert.match(
    String(expectedAuditUserId || ''),
    UUID_V4_RE,
    'designated audit account must be a canonical lowercase UUID v4'
  );
  const scoped = originScopedAuthState(state, targetOrigin);
  const session = JSON.parse(scoped.origins[0].localStorage[0].value);
  const tokenPayload = decodeJwtPayload(session.access_token);
  assert.equal(
    tokenPayload.sub,
    expectedAuditUserId,
    'saved access token subject does not match the designated audit account'
  );
  assert.equal(
    session?.user?.id,
    expectedAuditUserId,
    'saved auth session user does not match the designated audit account'
  );
  return { storageState: scoped, auditUserId: expectedAuditUserId };
}

function authStorageState(authStatePath, targetOrigin, expectedAuditUserId) {
  return validateDesignatedAuditAuthState(
    JSON.parse(readFileSync(authStatePath, 'utf8')),
    targetOrigin,
    expectedAuditUserId
  );
}

export async function readDeploymentIdentity(
  baseUrl,
  expectedBuild,
  { fetchFn = globalThis.fetch, now = () => Date.now(), protectionBypassSecret = '' } = {}
) {
  assert.equal(typeof fetchFn, 'function', 'deployment identity requires a fetch transport');
  const immutableOrigin = protectionBypassSecret
    ? validateImmutableDeploymentUrl(baseUrl)
    : baseUrl;
  const response = await fetchFn(`${baseUrl}/api/health?phase6Delivery=${now()}`, {
    headers: {
      'cache-control': 'no-cache',
      ...protectionBypassHeaders(immutableOrigin, immutableOrigin, protectionBypassSecret),
    },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  assert.equal(response.status, 200, `deployment health returned HTTP ${response.status}`);
  const health = await response.json();
  assert.equal(
    String(health?.commitSha || '').toLowerCase(),
    expectedBuild,
    'deployment health commitSha mismatch'
  );
  assert.equal(
    String(health?.version || '').toLowerCase(),
    expectedBuild,
    'deployment health version mismatch'
  );
  assert.ok(health?.deploymentUrl, 'deployment health omitted deploymentUrl');
  const healthDeploymentUrl = String(health.deploymentUrl).includes('://')
    ? String(health.deploymentUrl)
    : `https://${health.deploymentUrl}`;
  assert.equal(
    validateImmutableDeploymentUrl(healthDeploymentUrl),
    baseUrl,
    'health named a different immutable deployment'
  );
  assert.ok(
    typeof health?.deploymentId === 'string' &&
      health.deploymentId.trim() === health.deploymentId &&
      health.deploymentId.length >= 3 &&
      health.deploymentId.length <= 200,
    'deployment health omitted a valid immutable deploymentId'
  );
  assert.equal(health?.status, 'ok', 'deployment health was not ok');
  assert.equal(health?.checks?.db?.status, 'ok', 'deployment database health was not ok');
  assert.equal(
    health?.checks?.trainingGradingReceipt?.status,
    'ok',
    'deployment grading-receipt health was not ok'
  );
  return {
    commitSha: String(health.commitSha).toLowerCase(),
    version: String(health.version).toLowerCase(),
    deploymentUrl: baseUrl,
    deploymentId: health.deploymentId,
  };
}

async function browserRequest(
  page,
  path,
  { method = 'GET', body = null, discardBody = false } = {}
) {
  return page.evaluate(
    async ({ requestPath, requestMethod, requestBody, shouldDiscard }) => {
      let session;
      try {
        session = JSON.parse(localStorage.getItem('smarter-poker-auth') || 'null');
      } catch {
        session = null;
      }
      if (!session?.access_token) throw new Error('browser session has no access token');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const response = await fetch(requestPath, {
          method: requestMethod,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            ...(requestBody === null ? {} : { 'Content-Type': 'application/json' }),
          },
          body: requestBody === null ? undefined : JSON.stringify(requestBody),
          cache: 'no-store',
          signal: controller.signal,
        });
        if (shouldDiscard) return { status: response.status, discardedResponseBody: true };
        const text = await response.text();
        let payload = null;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch {
          /* asserted by caller */
        }
        return {
          status: response.status,
          payload,
          responseBytes: new TextEncoder().encode(text).length,
        };
      } finally {
        clearTimeout(timeout);
      }
    },
    { requestPath: path, requestMethod: method, requestBody: body, shouldDiscard: discardBody }
  );
}

async function expectApi(page, path, options, label) {
  const result = await browserRequest(page, path, options);
  assert.equal(
    result.status,
    200,
    `${label} returned HTTP ${result.status}: ${result.payload?.code || result.payload?.error || 'no JSON error'}`
  );
  if (!options?.discardBody) assert.ok(result.payload, `${label} did not return JSON`);
  return result;
}

async function expectRecordQuestion(page, pacer, body, label, { discardBody = false } = {}) {
  await pacer.waitForSlot();
  return expectApi(
    page,
    '/api/training/record-question',
    {
      method: 'POST',
      body,
      discardBody,
    },
    label
  );
}

async function expectRecordQuestionRefusal(page, pacer, body, label, { status, code }) {
  await pacer.waitForSlot();
  const result = await browserRequest(page, '/api/training/record-question', {
    method: 'POST',
    body,
  });
  assert.equal(
    result.status,
    status,
    `${label} returned HTTP ${result.status} instead of ${status}`
  );
  assert.equal(result.payload?.success, false, `${label} did not fail closed`);
  assert.equal(result.payload?.code, code, `${label} returned the wrong refusal code`);
  return result;
}

function correlationRecord(question) {
  const context = question._gradingContext;
  return {
    eventKey: `training-attempt:${context.attemptId}:hand:${context.handOrdinal}:decision:${context.decisionOrdinal}`,
    attemptId: context.attemptId,
    handOrdinal: context.handOrdinal,
    decisionOrdinal: context.decisionOrdinal,
    snapshotKey: context.snapshotKey,
    questionId: question.id,
    policyChecksum: question.policyChecksum,
    submissionId: context.submissionId,
  };
}

export async function runProductionDeliveryAttestation(
  config = readAttestationConfig(),
  runtime = {}
) {
  config = validateAttestationConfig(config);
  // Pure contract tests import this module without launching a browser. Keep
  // Playwright out of module initialization and load it only for the explicit
  // live-write attestation entrypoint.
  const chromium = runtime.chromium || (await import('playwright')).chromium;
  const now = runtime.now || (() => new Date());
  const sleep =
    runtime.sleep ||
    ((delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs)));
  const designatedAuth = authStorageState(
    config.authState,
    config.baseUrl,
    config.expectedAuditUserId
  );
  const lease = acquireEvidenceRunLock(config.output);
  const startedAt = now().toISOString();
  const evidence = {
    schemaVersion: 1,
    success: false,
    publicApiSuccess: false,
    releaseGateReady: false,
    status: 'in_progress',
    startedAt,
    expectedBuild: config.expectedBuild,
    auditUserId: designatedAuth.auditUserId,
    deployment: { deploymentUrl: config.baseUrl },
    writeScope: {
      acknowledged: true,
      auditUserId: designatedAuth.auditUserId,
      gameId: GAME_ID,
      level: LEVEL,
      effects: [
        'training attempt creation',
        'served delivery events',
        'training answer inserts',
        'audit-account seen-question state',
        'cache accounting events',
      ],
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
  const observations = [];
  const publicClientErrors = [];
  let browser;
  let outputOwned = false;
  try {
    writeOutputAtomic(config.output, evidence, { overwrite: false });
    outputOwned = true;
    evidence.deployment = await readDeploymentIdentity(config.baseUrl, config.expectedBuild, {
      fetchFn: runtime.fetchFn,
      now: runtime.nowMs,
      protectionBypassSecret: config.protectionBypassSecret,
    });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: designatedAuth.storageState });
    const page = await context.newPage();
    if (config.protectionBypassSecret) {
      await page.route('**/*', (route) =>
        continueRouteWithProtectionBypass(route, config.baseUrl, config.protectionBypassSecret)
      );
    }
    page.on('pageerror', (error) => {
      publicClientErrors.push({
        kind: 'pageerror',
        message: redactReceiptMaterial(error?.message || String(error)),
      });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        publicClientErrors.push({
          kind: 'console',
          message: redactReceiptMaterial(message.text()),
        });
      }
    });
    const pageResponse = await page.goto(
      `${config.baseUrl}/hub/training?revision=phase6-delivery-attestation`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      }
    );
    assert.ok(
      pageResponse && pageResponse.status() < 400,
      `authenticated bootstrap returned HTTP ${pageResponse?.status() || 'none'}`
    );
    assert.equal(
      new URL(pageResponse.url()).origin,
      config.baseUrl,
      'authenticated bootstrap response escaped the immutable deployment origin'
    );
    assert.equal(
      new URL(page.url()).origin,
      config.baseUrl,
      'authenticated page escaped the immutable deployment origin'
    );

    const authProbe = await expectApi(
      page,
      '/api/training/get-sessions?limit=1',
      {},
      'authenticated session probe'
    );
    assert.equal(authProbe.payload?.success, true, 'authenticated session probe did not succeed');

    const sessionId = `phase6-attestation-${randomUUID()}`;
    const continuationCohortPrecommit = buildTrainingAttestationContinuationPrecommit({
      selectionRule: TRAINING_ATTESTATION_CONTINUATION_SELECTION_RULE,
      sessionId,
      gameId: GAME_ID,
      level: LEVEL,
      targetHands: TARGET_HANDS,
    });
    assert.ok(
      continuationCohortPrecommit,
      'public continuation cohort precommit could not be constructed before delivery'
    );
    const params = new URLSearchParams({
      gameId: GAME_ID,
      level: String(LEVEL),
      count: String(TARGET_HANDS),
      difficulty: REQUESTED_DIFFICULTY_TIER,
      sessionId,
      gameMode: 'street',
      handSelection: 'all',
      targetStreet: 'flop',
      attestationContinuationRule: continuationCohortPrecommit.selectionRule,
      attestationContinuationPrecommit: continuationCohortPrecommit.commitment,
    });
    const initialResult = await expectApi(
      page,
      `/api/training/batch-preload?${params}`,
      {},
      'fresh full attempt'
    );
    const initial = initialResult.payload;
    const validatedInitial = validateFullAttemptDelivery(initial, {
      sessionId,
      difficultyMode: EXPECTED_DIFFICULTY_MODE,
      continuationCohortPrecommit,
    });
    observations.push(...validatedInitial.observations);
    evidence.publicApi = {
      authenticated: true,
      auditUserId: designatedAuth.auditUserId,
      authProbe: { status: 'passed', auditUserId: designatedAuth.auditUserId },
      initialAttempt: {
        gameId: GAME_ID,
        level: LEVEL,
        requestedDifficultyTier: REQUESTED_DIFFICULTY_TIER,
        difficultyMode: EXPECTED_DIFFICULTY_MODE,
        sessionId,
        attemptId: initial.attemptId,
        targetHands: initial.targetHands,
        deliveredHands: initial.questions.length,
        completeManifest: true,
        continuationCohortPrecommit: initial.attestationContinuationCohort,
      },
      parentCandidateAttempts: [],
      receiptFormatCensus: receiptFormatCensus(observations),
    };
    // Preserve the real attempt identity even if a later write fails. An
    // administrator must be able to account for every partial audit run.
    writeOutputAtomic(config.output, evidence);

    const reissueResult = await expectApi(
      page,
      '/api/training/reissue-questions',
      {
        method: 'POST',
        body: {
          gameId: GAME_ID,
          questionIds: initial.questions.map((question) => question.id),
          level: LEVEL,
          sessionId,
          sessionKind: 'campaign',
          attemptId: initial.attemptId,
        },
      },
      'untouched full-attempt reissue'
    );
    const reissued = reissueResult.payload;
    const reissueManifest = compareReissuedManifest(initial, reissued);
    observations.push(
      ...reissued.questions.map((question) =>
        decodeReceiptObservation(question._gradingContext.receipt)
      )
    );
    evidence.publicApi.reissue = {
      manifestIdentityExact: true,
      recoveredExistingAttempt: true,
      receiptBytesIdentical: reissueManifest.every(
        ({ receiptBytesIdentical }) => receiptBytesIdentical
      ),
      hands: reissueManifest,
    };
    evidence.publicApi.receiptFormatCensus = receiptFormatCensus(observations);
    writeOutputAtomic(config.output, evidence);

    const recordQuestionPacer = createSlidingWindowRequestPacer();
    let selectedParent = null;
    const parentAttempts = [];
    for (
      let index = 0;
      index < Math.min(MAX_PARENT_CANDIDATES, reissued.questions.length);
      index += 1
    ) {
      const initialQuestion = initial.questions[index];
      const question = reissued.questions[index];
      const continuationRuleAnswer = selectPublicAttestationContinuationAnswer(
        question,
        continuationCohortPrecommit.selectionRule,
      );
      const selectedAnswer = continuationRuleAnswer
        || String(question.options?.[0]?.id ?? question.options?.[0] ?? '');
      assert.ok(selectedAnswer, `public answer selection failed for hand ${index + 1}`);
      const initialBody = buildAnswerRequest(initialQuestion, selectedAnswer);
      const reissuedBody = buildAnswerRequest(question, selectedAnswer);
      const initialRequestBinding = structuredClone(initialBody);
      const reissuedRequestBinding = structuredClone(reissuedBody);
      delete initialRequestBinding.gradingReceipt;
      delete reissuedRequestBinding.gradingReceipt;
      assert.deepEqual(
        reissuedRequestBinding,
        initialRequestBinding,
        `reissued hand ${index + 1} changed the answer request binding`
      );
      const receiptBytesIdentical = initialBody.gradingReceipt === reissuedBody.gradingReceipt;
      const requestsBefore = recordQuestionPacer.snapshot().requestsIssued;
      let recorded;
      let responseLossRecovered = false;
      let exactReplayVerified = false;
      let initialReceiptServerVerified = false;
      let reissuedReceiptServerVerified = false;
      let reissuedReceiptVerification = receiptBytesIdentical
        ? 'same_bytes_as_server_verified_initial_receipt'
        : 'server_verified_idempotent_replay';
      if (index === 0) {
        // Exercise response-loss recovery once. Every call is also routed
        // through a conservative sliding-window pacer below the endpoint's
        // 30/min production write limit.
        const lostResponse = await expectRecordQuestion(
          page,
          recordQuestionPacer,
          initialBody,
          'response-loss parent candidate',
          { discardBody: true }
        );
        assert.equal(
          lostResponse.discardedResponseBody,
          true,
          'response-loss probe unexpectedly retained a response body'
        );
        recorded = (
          await expectRecordQuestion(
            page,
            recordQuestionPacer,
            initialBody,
            'response-loss recovery'
          )
        ).payload;
        assert.equal(
          recorded.idempotentReplay,
          true,
          'the committed response loss did not recover idempotently'
        );
        validateAnswerBinding(recorded, initialQuestion, 'response-loss answer');
        initialReceiptServerVerified = true;
        const exactReplay = (
          await expectRecordQuestion(
            page,
            recordQuestionPacer,
            reissuedBody,
            'reissued response-loss replay'
          )
        ).payload;
        assertExactReplay(recorded, exactReplay, 'response-loss answer');
        validateAnswerBinding(exactReplay, question, 'reissued response-loss answer');
        reissuedReceiptServerVerified = true;
        reissuedReceiptVerification = receiptBytesIdentical
          ? 'same_bytes_replayed_through_record_question'
          : 'refreshed_receipt_replayed_through_record_question';
        responseLossRecovered = true;
        exactReplayVerified = true;
      } else {
        recorded = (
          await expectRecordQuestion(
            page,
            recordQuestionPacer,
            initialBody,
            `fresh initial-receipt candidate ${index + 1}`
          )
        ).payload;
        assert.equal(
          recorded.idempotentReplay,
          false,
          `candidate ${index + 1} was unexpectedly already answered`
        );
        validateAnswerBinding(
          recorded,
          initialQuestion,
          `fresh initial-receipt candidate ${index + 1}`
        );
        initialReceiptServerVerified = true;
        const reissuedReplay = (
          await expectRecordQuestion(
            page,
            recordQuestionPacer,
            reissuedBody,
            `${receiptBytesIdentical ? 'same-byte' : 'refreshed'} reissued-receipt replay ${index + 1}`
          )
        ).payload;
        assertExactReplay(recorded, reissuedReplay, `reissued receipt ${index + 1}`);
        validateAnswerBinding(reissuedReplay, question, `reissued-receipt replay ${index + 1}`);
        reissuedReceiptServerVerified = true;
        reissuedReceiptVerification = receiptBytesIdentical
          ? 'same_bytes_replayed_through_record_question'
          : 'refreshed_receipt_replayed_through_record_question';
        exactReplayVerified = true;
      }
      const continuationAction = recorded?.feedback?.continuation?.actionId || null;
      const selectsFirstContinuation =
        continuationAction === selectedAnswer && selectedParent === null;
      if (selectsFirstContinuation && !exactReplayVerified) {
        const exactReplay = (
          await expectRecordQuestion(
            page,
            recordQuestionPacer,
            reissuedBody,
            `exact selected-parent replay ${index + 1}`
          )
        ).payload;
        assertExactReplay(recorded, exactReplay, `selected parent candidate ${index + 1}`);
        validateAnswerBinding(exactReplay, question, `selected parent candidate ${index + 1}`);
        reissuedReceiptServerVerified = true;
        exactReplayVerified = true;
      }
      parentAttempts.push({
        ...correlationRecord(question),
        questionId: question.id,
        handOrdinal: question._gradingContext.handOrdinal,
        selectedAnswer,
        continuationAction,
        followedContinuationBranch: continuationAction === selectedAnswer,
        responseLossRecovered,
        exactReplay: exactReplayVerified,
        receiptBytesIdentical,
        initialReceiptServerVerified,
        reissuedReceiptServerVerified,
        reissuedReceiptVerification,
        recordQuestionRequests: recordQuestionPacer.snapshot().requestsIssued - requestsBefore,
      });
      evidence.publicApi.parentCandidateAttempts = parentAttempts;
      writeOutputAtomic(config.output, evidence);
      if (selectsFirstContinuation) {
        selectedParent = { question, selectedAnswer, answer: { ...recorded, selectedAnswer } };
      }
    }
    assert.ok(
      selectedParent,
      `no real continuation branch was reached in ${parentAttempts.length} bounded parent candidates`
    );
    assert.equal(
      parentAttempts.length,
      initial.questions.length,
      'not every initial receipt reached record-question'
    );
    assert.ok(
      parentAttempts.every(({ initialReceiptServerVerified }) => initialReceiptServerVerified),
      'an initial receipt was not server-verified'
    );
    assert.ok(
      parentAttempts.every(({ reissuedReceiptServerVerified }) => reissuedReceiptServerVerified),
      'a reissued receipt was not server-verified'
    );

    const selectedParentBody = buildAnswerRequest(
      selectedParent.question,
      selectedParent.selectedAnswer
    );
    const conflictingAnswer = selectedParent.question.options
      .map((option) => String(option?.id ?? option))
      .find((candidate) => candidate !== selectedParent.selectedAnswer);
    assert.ok(
      conflictingAnswer,
      'selected parent did not expose a distinct answer for the replay-conflict probe'
    );
    const changedAnswerRefusal = await expectRecordQuestionRefusal(
      page,
      recordQuestionPacer,
      { ...selectedParentBody, selectedAnswer: conflictingAnswer },
      'changed-answer replay conflict',
      { status: 409, code: 'TRAINING_GRADING_RECEIPT_REPLAY_CONFLICT' }
    );
    const differentSubmissionId = reissued.questions.find(
      (candidate) =>
        candidate._gradingContext.submissionId !==
        selectedParent.question._gradingContext.submissionId
    )?._gradingContext.submissionId;
    assert.ok(
      differentSubmissionId,
      'submission-binding refusal probe could not select another signed slot'
    );
    const changedSubmissionRefusal = await expectRecordQuestionRefusal(
      page,
      recordQuestionPacer,
      { ...selectedParentBody, submissionId: differentSubmissionId },
      'changed-submission binding refusal',
      { status: 400, code: 'TRAINING_GRADING_RECEIPT_SUBMISSION_MISMATCH' }
    );

    const firstContinuation = (
      await expectApi(
        page,
        '/api/training/next-street',
        {
          method: 'POST',
          body: { gradingReceipt: selectedParent.question._gradingContext.receipt },
        },
        'real next-street continuation'
      )
    ).payload;
    const continuationReplay = (
      await expectApi(
        page,
        '/api/training/next-street',
        {
          method: 'POST',
          body: { gradingReceipt: selectedParent.question._gradingContext.receipt },
        },
        'next-street child replay'
      )
    ).payload;
    const childQuestion = validateContinuation(
      selectedParent.question,
      selectedParent.answer,
      firstContinuation,
      continuationReplay
    );
    observations.push(
      decodeReceiptObservation(firstContinuation.question._gradingContext.receipt),
      decodeReceiptObservation(continuationReplay.question._gradingContext.receipt)
    );

    const childOption = String(childQuestion.options[0]?.id ?? childQuestion.options[0]);
    const childBody = buildAnswerRequest(childQuestion, childOption);
    const childAnswer = (
      await expectRecordQuestion(page, recordQuestionPacer, childBody, 'child answer')
    ).payload;
    assert.equal(
      childAnswer.idempotentReplay,
      false,
      'fresh child answer was unexpectedly a replay'
    );
    validateAnswerBinding(childAnswer, childQuestion, 'child answer');
    const childAnswerReplay = (
      await expectRecordQuestion(page, recordQuestionPacer, childBody, 'child answer replay')
    ).payload;
    assertExactReplay(childAnswer, childAnswerReplay, 'child answer');

    const formatCensus = receiptFormatCensus(observations);
    evidence.publicApi = {
      ...evidence.publicApi,
      responseLossRecovery: {
        simulatedAtApplicationBoundary: true,
        firstResponseBodyIntentionallyDiscarded: true,
        exactRetryReturnedIdempotentReplay: true,
      },
      receiptServerVerification: {
        initial: {
          expected: initial.questions.length,
          verified: parentAttempts.filter(
            ({ initialReceiptServerVerified }) => initialReceiptServerVerified
          ).length,
          allAccepted: parentAttempts.every(
            ({ initialReceiptServerVerified }) => initialReceiptServerVerified
          ),
        },
        reissued: {
          expected: reissued.questions.length,
          verified: parentAttempts.filter(
            ({ reissuedReceiptServerVerified }) => reissuedReceiptServerVerified
          ).length,
          allAccepted: parentAttempts.every(
            ({ reissuedReceiptServerVerified }) => reissuedReceiptServerVerified
          ),
        },
        receiptBytesIdentical: parentAttempts.filter(
          ({ receiptBytesIdentical }) => receiptBytesIdentical
        ).length,
        refreshedReceiptBytes: parentAttempts.filter(
          ({ receiptBytesIdentical }) => !receiptBytesIdentical
        ).length,
        recordQuestionRateLimit: {
          productionMaximum: 30,
          ...recordQuestionPacer.snapshot(),
        },
      },
      conflictingReplayRefusals: {
        changedAnswer: {
          status: changedAnswerRefusal.status,
          code: changedAnswerRefusal.payload.code,
        },
        changedSubmissionBinding: {
          status: changedSubmissionRefusal.status,
          code: changedSubmissionRefusal.payload.code,
        },
      },
      parent: {
        ...correlationRecord(selectedParent.question),
        selectedAnswer: selectedParent.selectedAnswer,
        immutableEvidence: immutableAnswerEvidence(selectedParent.answer),
        exactReplay: true,
      },
      continuation: {
        ...correlationRecord(childQuestion),
        parentEventKey: correlationRecord(selectedParent.question).eventKey,
        recoveredExistingContinuation: continuationReplay.recoveredExistingContinuation === true,
        parentBindingVerifiedFromPublicReceipts: true,
        childPublicQuestionDigest: publicQuestionFingerprint(childQuestion),
      },
      childAnswer: {
        selectedAnswer: childOption,
        immutableEvidence: immutableAnswerEvidence(childAnswer),
        exactReplay: true,
      },
      receiptFormatCensus: formatCensus,
    };
    evidence.publicApiSuccess = true;
    evidence.success = false;
    evidence.status = 'public_api_verified_admin_correlation_pending';
    evidence.releaseGateReady = false;
    evidence.apiCompletedAt = now().toISOString();
    await sleep(ERROR_SETTLE_WINDOW_MS);
    evidence.completedAt = now().toISOString();
    const observedSettleMs = Date.parse(evidence.completedAt) - Date.parse(evidence.apiCompletedAt);
    evidence.errorSettle = {
      minimumMs: ERROR_SETTLE_WINDOW_MS,
      windowStart: evidence.apiCompletedAt,
      windowEnd: evidence.completedAt,
      observedMs: observedSettleMs,
      publicClientErrorCount: publicClientErrors.length,
    };
    assert.ok(
      observedSettleMs >= ERROR_SETTLE_WINDOW_MS,
      'post-run error-settle window was shorter than required'
    );
    assert.deepEqual(
      publicClientErrors,
      [],
      'public client emitted errors during the attestation window'
    );
    validateCompletePublicAttestation(evidence);
    writeOutputAtomic(config.output, evidence);
    await context.close();
    return evidence;
  } catch (error) {
    evidence.success = false;
    evidence.publicApiSuccess = false;
    evidence.releaseGateReady = false;
    evidence.status = 'failed_closed';
    evidence.failedAt = now().toISOString();
    evidence.failure = {
      name: redactReceiptMaterial(error?.name || 'Error'),
      message: redactReceiptMaterial(error?.message || String(error)),
    };
    evidence.receiptFormatCensus = receiptFormatCensus(observations);
    if (outputOwned) writeOutputAtomic(config.output, evidence);
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    lease.release();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  const run =
    process.env.TRAINING_PHASE6_ADMIN_COLLECT === '1'
      ? runMachineAdministratorCollector(readMachineCollectorConfig())
      : process.env.TRAINING_PHASE6_DELIVERY_ADMIN_EVIDENCE
        ? Promise.resolve().then(() =>
            finalizeProductionDeliveryAttestation(readAdministratorCloseoutConfig())
          )
        : runProductionDeliveryAttestation();
  run
    .then((evidence) => {
      process.stdout.write(
        `${JSON.stringify({
          success: evidence.success,
          publicApiSuccess: evidence.publicApiSuccess,
          releaseGateReady: evidence.releaseGateReady,
          status: evidence.status,
        })}\n`
      );
      process.exitCode = attestationExitCode(evidence);
    })
    .catch((error) => {
      process.stderr.write(
        `[phase6-delivery-attestation] ${redactReceiptMaterial(error?.stack || error)}\n`
      );
      process.exitCode = 1;
    });
}
