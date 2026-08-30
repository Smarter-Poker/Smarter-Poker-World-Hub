import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { gradeSolverDecision, isVerifiedSolverQuestion, verifiedSolverSource } from '../training/solverDecisionEvidence.js';

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

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sealDrillBatch({ leakId, questionIds }, userId, options = {}) {
  const secret = secretOf(options.secret);
  const normalizedLeakId = normalizeId(leakId, 64);
  const normalizedUserId = normalizeId(userId, 80);
  const ids = uniqueQuestionIds(questionIds);
  if (!secret || !normalizedUserId || !LEAK_ID_RE.test(normalizedLeakId)
      || ids.length < MIN_VERIFIED_QUESTIONS) return null;

  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const payload = Buffer.from(JSON.stringify({
    version: 2,
    batchId: randomUUID(),
    userId: normalizedUserId,
    leakId: normalizedLeakId,
    questionIds: ids,
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
  if (decoded?.version !== 2
      || decoded?.userId !== normalizeId(userId, 80)
      || decoded?.leakId !== normalizeId(leakId, 64)
      || ids.length < MIN_VERIFIED_QUESTIONS
      || !Number.isFinite(decoded?.issuedAt) || !Number.isFinite(decoded?.expiresAt)
      || decoded.issuedAt > now + 60_000 || decoded.expiresAt < now
      || decoded.expiresAt - decoded.issuedAt > TOKEN_TTL_MS) {
    throw new Error('invalid_drill_token');
  }
  return { ...decoded, questionIds: ids };
}

export function canonicalAnswerText(questionData) {
  const qd = questionData && typeof questionData === 'object' ? questionData : {};
  const options = Array.isArray(qd.options) ? qd.options : [];
  const answerId = normalizeId(qd.correctAnswer, 100).toLowerCase();
  const byId = options.find((option) => option && typeof option === 'object'
    && normalizeId(option.id, 100).toLowerCase() === answerId);
  return normalizeId(qd.correctAnswerText || byId?.text || qd.correctAnswer, 100);
}

export function gradeDrillAnswer(questionData, selectedAnswer, timedOut = false) {
  const expected = canonicalAnswerText(questionData);
  if (!expected || !isVerifiedSolverQuestion(questionData)) {
    return { ok: false, reason: 'question_not_solver_verified' };
  }
  const selected = timedOut === true ? '' : normalizeId(selectedAnswer, 100);
  const options = Array.isArray(questionData?.options) ? questionData.options : [];
  const selectedOption = options.find((option) => {
    const text = option && typeof option === 'object' ? option.text : option;
    return normalizeId(text, 100).toLowerCase() === selected.toLowerCase();
  });
  const selectedId = selectedOption && typeof selectedOption === 'object'
    ? normalizeId(selectedOption.id, 100)
    : selected;
  const solverGrade = timedOut === true ? null : gradeSolverDecision(questionData, selectedId);
  const correct = solverGrade?.solverVerified === true && solverGrade.isCorrect === true;
  const optimal = options.find((option) => option && typeof option === 'object'
    && normalizeId(option.id, 100).toLowerCase() === normalizeId(solverGrade?.optimalAction, 100).toLowerCase());
  return {
    ok: true,
    selectedAnswer: selected || null,
    correctAnswer: normalizeId(optimal?.text, 100) || expected,
    correct,
    timedOut: timedOut === true,
    explanation: normalizeId(questionData?.explanation, 2000) || null,
    solverSource: solverGrade?.solverSource || verifiedSolverSource(questionData),
    classification: solverGrade?.classification || 'timeout',
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
    const graded = gradeDrillAnswer(row.question_data, answer.selectedAnswer, answer.timedOut);
    if (!graded.ok) return graded;
    if (graded.correct) correct += 1;
    evidence.push({ questionId, selectedAnswer: graded.selectedAnswer, timedOut: graded.timedOut, correct: graded.correct });
  }
  return { ok: true, correct, total: ids.length,
    accuracy: Math.round((correct / ids.length) * 1000) / 1000, evidence };
}

export default { sealDrillBatch, openDrillBatch, gradeDrillAnswer, gradeDrillRows };
