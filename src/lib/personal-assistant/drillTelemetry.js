import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  gradeCanonicalPolicyDecision,
  isSolverEvidenceClassification,
} from '../training/cacheTruthContract.mjs';
import {
  cacheQuestionFromRow,
  cacheRowIsServingEligible,
} from '../training/cacheTruthPersistence.mjs';

export const MIN_VERIFIED_QUESTIONS = 5;
export const MAX_VERIFIED_QUESTIONS = 20;
const TOKEN_TTL_MS = 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 8192;
const LEAK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_:.-]{0,63}$/;

function secretOf(explicitSecret) {
  return explicitSecret || process.env.PERSONAL_ASSISTANT_DRILL_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || '';
}

function normalizeId(value, max = 180) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, max);
}

function uniqueQuestionIds(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const id = normalizeId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length > MAX_VERIFIED_QUESTIONS) return [];
  }
  return out;
}

function canonicalReceipts(values) {
  if (!Array.isArray(values)) return [];
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const id = normalizeId(value?.id);
    const policyChecksum = normalizeId(value?.policyChecksum, 64).toLowerCase();
    if (!id || seen.has(id) || !/^[0-9a-f]{64}$/.test(policyChecksum)) return [];
    seen.add(id);
    out.push({ id, policyChecksum });
    if (out.length > MAX_VERIFIED_QUESTIONS) return [];
  }
  return out;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sealDrillBatch({ leakId, receipts }, userId, options = {}) {
  const secret = secretOf(options.secret);
  const normalizedLeakId = normalizeId(leakId, 64);
  const normalizedUserId = normalizeId(userId, 80);
  const canonical = canonicalReceipts(receipts);
  const ids = canonical.map((receipt) => receipt.id);
  if (!secret || !normalizedUserId || !LEAK_ID_RE.test(normalizedLeakId)
      || ids.length < MIN_VERIFIED_QUESTIONS) return null;

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const payload = Buffer.from(JSON.stringify({
    version: 3,
    batchId: randomUUID(),
    userId: normalizedUserId,
    leakId: normalizedLeakId,
    questionIds: ids,
    policyChecksums: Object.fromEntries(
      canonical.map((receipt) => [receipt.id, receipt.policyChecksum]),
    ),
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function openDrillBatch(token, userId, leakId, options = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > MAX_TOKEN_LENGTH) {
    throw new Error('invalid_drill_token');
  }
  const [payload, suppliedSignature, extra] = token.split('.');
  const secret = secretOf(options.secret);
  if (!payload || !suppliedSignature || extra || !secret) throw new Error('invalid_drill_token');
  const expectedSignature = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(suppliedSignature, expectedSignature)) throw new Error('invalid_drill_token');

  let decoded;
  try { decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch (_) { throw new Error('invalid_drill_token'); }

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const ids = uniqueQuestionIds(decoded?.questionIds);
  const policyChecksums = decoded?.policyChecksums;
  if (decoded?.version !== 3
      || decoded?.userId !== normalizeId(userId, 80)
      || decoded?.leakId !== normalizeId(leakId, 64)
      || ids.length < MIN_VERIFIED_QUESTIONS
      || !Number.isFinite(decoded?.issuedAt) || !Number.isFinite(decoded?.expiresAt)
      || decoded.issuedAt > now + 60_000 || decoded.expiresAt < now
      || decoded.expiresAt - decoded.issuedAt > TOKEN_TTL_MS
      || !policyChecksums || typeof policyChecksums !== 'object' || Array.isArray(policyChecksums)
      || Object.keys(policyChecksums).length !== ids.length
      || ids.some((id) => !/^[0-9a-f]{64}$/.test(String(policyChecksums[id] || '')))) {
    throw new Error('invalid_drill_token');
  }
  return {
    ...decoded,
    questionIds: ids,
    policyChecksums: Object.fromEntries(
      ids.map((id) => [id, String(policyChecksums[id]).toLowerCase()]),
    ),
  };
}

function optimalPolicyAction(policy) {
  return Object.entries(policy?.distribution || {}).reduce((best, [id, value]) => {
    const frequency = Number(value);
    return Number.isFinite(frequency) && (!best || frequency > best.frequency)
      ? { id: String(id).toLowerCase(), frequency }
      : best;
  }, null);
}

export function canonicalAnswerText(cacheRow) {
  if (!cacheRowIsServingEligible(cacheRow)) return '';
  const qd = cacheQuestionFromRow(cacheRow) || {};
  const options = Array.isArray(qd.options) ? qd.options : [];
  const answerId = optimalPolicyAction(cacheRow.canonical_policy)?.id || '';
  const byId = options.find((option) => option && typeof option === 'object'
    && normalizeId(option.id, 100).toLowerCase() === answerId);
  return normalizeId(byId?.text || byId?.id, 100);
}

export function gradeDrillAnswer(cacheRow, selectedAnswer, timedOut = false) {
  const questionData = cacheQuestionFromRow(cacheRow);
  const expected = canonicalAnswerText(cacheRow);
  if (
    !questionData
    || !expected
    || !isSolverEvidenceClassification(cacheRow?.source_classification)
    || !cacheRowIsServingEligible(cacheRow)
  ) {
    return { ok: false, reason: 'question_not_solver_verified' };
  }
  const selected = timedOut === true ? '' : normalizeId(selectedAnswer, 100);
  const options = Array.isArray(questionData?.options) ? questionData.options : [];
  const selectedOption = options.find((option) => {
    const text = option && typeof option === 'object' ? option.text : option;
    const id = option && typeof option === 'object' ? option.id : option;
    return [text, id].some((value) => (
      normalizeId(value, 100).toLowerCase() === selected.toLowerCase()
    ));
  });
  if (timedOut !== true && !selectedOption) {
    return { ok: false, reason: 'selected_action_not_in_policy' };
  }
  const selectedId = selectedOption && typeof selectedOption === 'object'
    ? normalizeId(selectedOption.id, 100)
    : selected;
  const solverGrade = timedOut === true
    ? null
    : gradeCanonicalPolicyDecision(cacheRow.canonical_policy, selectedId);
  const correct = solverGrade?.solverVerified === true && solverGrade.isCorrect === true;
  const optimalAction = optimalPolicyAction(cacheRow.canonical_policy)?.id;
  const optimal = options.find((option) => option && typeof option === 'object'
    && normalizeId(option.id, 100).toLowerCase() === normalizeId(optimalAction, 100).toLowerCase());
  return {
    ok: true,
    selectedAnswer: selected || null,
    correctAnswer: normalizeId(optimal?.text, 100) || expected,
    correct,
    timedOut: timedOut === true,
    explanation: normalizeId(questionData?.explanation, 2000) || null,
    solverSource: solverGrade?.solverSource || cacheRow.canonical_policy?.sourceArtifact?.system || null,
    classification: solverGrade?.classification || 'timeout',
    policyChecksum: String(cacheRow.policy_checksum || '').toLowerCase(),
  };
}

// Pure regression helper. Production records each answer before revealing its
// key and derives the final score from the private answer ledger.
export function gradeDrillRows(rows, questionIds, answers) {
  const ids = uniqueQuestionIds(questionIds);
  if (!ids.length || !Array.isArray(answers) || answers.length !== ids.length) {
    return { ok: false, reason: 'incomplete_drill_evidence' };
  }
  const rowById = new Map((Array.isArray(rows) ? rows : []).map((row) => [normalizeId(row?.id), row]));
  const answerById = new Map();
  for (const raw of answers) {
    const questionId = normalizeId(raw?.questionId);
    if (!questionId || answerById.has(questionId)) return { ok: false, reason: 'invalid_drill_evidence' };
    answerById.set(questionId, raw);
  }
  const evidence = [];
  let correct = 0;
  for (const questionId of ids) {
    const row = rowById.get(questionId);
    const answer = answerById.get(questionId);
    if (!row?.question_data || !answer) return { ok: false, reason: 'incomplete_drill_evidence' };
    const graded = gradeDrillAnswer(row, answer.selectedAnswer, answer.timedOut);
    if (!graded.ok) return graded;
    if (graded.correct) correct += 1;
    evidence.push({ questionId, selectedAnswer: graded.selectedAnswer, timedOut: graded.timedOut, correct: graded.correct });
  }
  return { ok: true, correct, total: ids.length,
    accuracy: Math.round((correct / ids.length) * 1000) / 1000, evidence };
}

export default { sealDrillBatch, openDrillBatch, gradeDrillAnswer, gradeDrillRows };
