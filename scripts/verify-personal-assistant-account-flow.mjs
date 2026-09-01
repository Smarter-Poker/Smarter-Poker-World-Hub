#!/usr/bin/env node

/**
 * Protected production verifier for the complete Personal Assistant pipeline.
 *
 * Required: TEST_USER_PASSWORD plus the public Supabase variables in
 * `.env.local` (or the process environment). No token, password, cards, hand
 * history, question text, answer text, or leak identifier is printed.
 *
 * `--complete-drill` also locks every answer, completes one server-verified
 * remediation attempt, and verifies answer/review idempotency. That mode
 * intentionally updates the test account's drill schedule.
 */
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', quiet: true });

const baseUrl = String(process.env.VERIFY_BASE_URL || 'https://smarter.poker').replace(/\/$/, '');
const email = process.env.TEST_USER_EMAIL || 'daniel@bekavactrading.com';
const password = process.env.TEST_USER_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const completeDrill = process.argv.includes('--complete-drill');
const skipAudit = process.argv.includes('--skip-audit');
const MAX_AUDIT_BATCHES = 12;

if (!password || !supabaseUrl || !anonKey) {
  throw new Error('Missing TEST_USER_PASSWORD or public Supabase environment variables.');
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function requestJson(path, token, options = {}) {
  const controller = new AbortController();
  // Local development can pay cold TLS + PostgREST schema-cache latency that
  // Vercel does not. Keep the verifier patient enough to observe the response;
  // the route's own 60-second production execution budget remains unchanged.
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    let data = {};
    try { data = await response.json(); } catch (_) { /* handled below */ }
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function assertSuccess(result, label) {
  if (!result.response.ok || result.data?.success === false) {
    const code = result.data?.code || result.data?.reason || `http_${result.response.status}`;
    throw new Error(`${label} failed (${code}).`);
  }
}

async function runDetection(token) {
  let cursor = null;
  let batches = 0;
  let handsScanned = 0;
  let handsAudited = 0;
  let decisionsAnalyzed = 0;
  let privateCardsRecovered = 0;
  let handsMissingPrivateCards = 0;
  let handsRejectedBeforeAudit = 0;
  let handsEligible = 0;
  let handsAlreadyCurrent = 0;
  let handsSkippedNoHeroDecisions = 0;
  let solverVerified = 0;
  let unpriced = 0;
  let retriedRateLimit = false;
  let retriedTransient = false;

  while (batches < MAX_AUDIT_BATCHES) {
    const result = await requestJson('/api/assistant/leaks/detect', token, {
      method: 'POST',
      body: JSON.stringify({ auditCursor: cursor }),
    });
    if (result.response.status === 429 && !retriedRateLimit) {
      retriedRateLimit = true;
      const retrySeconds = Math.min(60, Math.max(1, Number(result.response.headers.get('retry-after') || 1)));
      await sleep(retrySeconds * 1000);
      continue;
    }
    retriedRateLimit = false;
    if ([502, 503, 504].includes(result.response.status)
      && result.data?.retryable === true
      && !retriedTransient) {
      retriedTransient = true;
      const retrySeconds = Math.min(60, Math.max(1, Number(result.response.headers.get('retry-after') || 1)));
      await sleep(retrySeconds * 1000);
      continue;
    }
    retriedTransient = false;
    assertSuccess(result, 'Deterministic audit');

    batches += 1;
    const sync = result.data?.clubArenaSync || {};
    handsScanned += Number(sync.handsFound) || 0;
    handsAudited += Number(sync.handsAudited) || 0;
    decisionsAnalyzed += Number(sync.decisionsAnalyzed) || 0;
    privateCardsRecovered += Number(sync.privateCardsRecovered) || 0;
    handsMissingPrivateCards += Number(sync.handsMissingPrivateCards) || 0;
    handsRejectedBeforeAudit += Number(sync.handsRejectedBeforeAudit) || 0;
    handsEligible += Number(sync.handsEligible) || 0;
    handsAlreadyCurrent += Number(sync.handsAlreadyCurrent) || 0;
    handsSkippedNoHeroDecisions += Number(sync.handsSkippedNoHeroDecisions) || 0;
    solverVerified += Number(sync.solverVerified) || 0;
    unpriced += Number(sync.unpriced) || 0;
    cursor = sync.auditCursor || null;
    if (!cursor) {
      return {
        batches,
        handsScanned,
        handsAudited,
        decisionsAnalyzed,
        privateCardsRecovered,
        handsMissingPrivateCards,
        handsRejectedBeforeAudit,
        handsEligible,
        handsAlreadyCurrent,
        handsSkippedNoHeroDecisions,
        solverVerified,
        unpriced,
        leaksDetected: Number(result.data?.leaksDetected) || 0,
        persisted: result.data?.persisted === true,
      };
    }
  }
  throw new Error('Deterministic audit exceeded its bounded continuation budget.');
}

async function auditDrillCoverage(token, leaks) {
  const diagnostics = { candidates: 0, verified: 0, practice: 0, empty: 0, unmapped: 0, missing: 0, other: 0, scopes: [] };
  let verifiedDrill = null;
  const orderedLeaks = [...leaks].sort((a, b) => {
    const solverRank = leak => leak?.source_system === 'solver_engine' && /^solver_(training|club_arena)_/.test(String(leak?.leak_type || '')) ? 0 : 1;
    return solverRank(a) - solverRank(b);
  });
  for (const leak of orderedLeaks) {
    if (!leak?.id || leak?.status === 'resolved') continue;
    diagnostics.candidates += 1;
    const result = await requestJson(`/api/sandbox/custom-drill?leak=${encodeURIComponent(leak.id)}`, token);
    if (result.response.status === 422) {
      const reason = result.data?.reason === 'no_practice_questions' ? 'empty' : 'unmapped';
      diagnostics[reason] += 1;
      diagnostics.scopes.push({
        type: leak.leak_type || 'unknown',
        source: leak.source_system || 'unknown',
        reason,
      });
      continue;
    }
    if (result.response.status === 404) { diagnostics.missing += 1; continue; }
    if (!result.response.ok || result.data?.success === false) {
      diagnostics.other += 1;
      diagnostics.scopes.push({ type: leak.leak_type || 'unknown', source: leak.source_system || 'unknown', reason: `http_${result.response.status}` });
      continue;
    }
    assertSuccess(result, 'Corrective drill load');
    const questions = Array.isArray(result.data?.pool) ? result.data.pool : [];
    if (result.data?.serverVerified === true && result.data?.drillToken && questions.length >= 5) {
      diagnostics.verified += 1;
      const answerKeysHidden = questions.every(question => (
        question?.answer_locked === true
        && question.correct_answer === undefined
        && question.gto_explanation === undefined
        && Array.isArray(question.options)
        && question.options.length >= 2
      ));
      if (!answerKeysHidden) throw new Error('Verified drill exposed private grading data.');
      if (!verifiedDrill) verifiedDrill = { leak, questions, drillToken: result.data.drillToken };
      continue;
    }
    const practiceSafe = result.data?.practiceOnly === true
      && result.data?.serverVerified === false
      && !result.data?.drillToken
      && typeof result.data?.evidenceDisclosure === 'string'
      && result.data.evidenceDisclosure.length > 0
      && questions.length > 0
      && questions.every(question => (
        question?.answer_locked !== true
        && typeof question?.correct_answer === 'string'
        && Array.isArray(question?.options)
        && question.options.length >= 2
      ));
    if (!practiceSafe) {
      diagnostics.other += 1;
      diagnostics.scopes.push({ type: leak.leak_type || leak.leak_category || 'unknown', source: leak.source_system || 'unknown', reason: 'invalid_practice_contract' });
      continue;
    }
    diagnostics.practice += 1;
    diagnostics.scopes.push({
      type: leak.leak_type || leak.leak_category || 'unknown',
      source: leak.source_system || 'unknown',
      reason: result.data?.verificationReason || 'practice_only',
      questions: questions.length,
    });
  }
  const covered = diagnostics.verified + diagnostics.practice;
  if (covered !== diagnostics.candidates || diagnostics.empty || diagnostics.unmapped || diagnostics.missing || diagnostics.other) {
    throw new Error(`Corrective drill coverage is incomplete (${JSON.stringify(diagnostics)}).`);
  }
  return { diagnostics, verifiedDrill };
}

async function completeVerifiedDrill(token, drill) {
  let firstLocked = null;
  for (const question of drill.questions) {
    const body = {
      leakId: drill.leak.id,
      drillToken: drill.drillToken,
      questionId: String(question.id),
      selectedAnswer: String(question.options[0]),
      timedOut: false,
    };
    const answer = await requestJson('/api/assistant/leaks/drill-answer', token, {
      method: 'POST', body: JSON.stringify(body),
    });
    assertSuccess(answer, 'Verified answer lock');
    if (!firstLocked) {
      firstLocked = { body, result: answer.data?.result };
      const replayBody = { ...body, selectedAnswer: String(question.options[1]) };
      const replay = await requestJson('/api/assistant/leaks/drill-answer', token, {
        method: 'POST', body: JSON.stringify(replayBody),
      });
      assertSuccess(replay, 'Verified answer replay');
      if (replay.data?.idempotent !== true || JSON.stringify(replay.data?.result) !== JSON.stringify(firstLocked.result)) {
        throw new Error('Answer replay was not immutable and idempotent.');
      }
    }
  }

  const reviewId = `account-flow-${randomUUID()}`;
  const reviewBody = {
    leakId: drill.leak.id,
    drillToken: drill.drillToken,
    outcome: { reviewId },
  };
  const review = await requestJson('/api/assistant/leaks/review', token, {
    method: 'POST', body: JSON.stringify(reviewBody),
  });
  assertSuccess(review, 'Verified drill completion');
  if (review.data?.persisted !== true) throw new Error('Verified drill schedule was not persisted.');

  const replay = await requestJson('/api/assistant/leaks/review', token, {
    method: 'POST', body: JSON.stringify(reviewBody),
  });
  assertSuccess(replay, 'Verified review replay');
  if (replay.data?.idempotent !== true) throw new Error('Review replay was not idempotent.');
  return { questionsCompleted: drill.questions.length, answerReplayIdempotent: true, reviewReplayIdempotent: true };
}

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError || !authData?.session?.access_token) throw new Error('Protected test-account authentication failed.');
const token = authData.session.access_token;

try {
  const before = await requestJson('/api/assistant/leaks', token);
  assertSuccess(before, 'Leak history read before audit');
  const beforeLeaks = Array.isArray(before.data?.leaks) ? before.data.leaks : [];

  const audit = skipAudit ? { skipped: true } : await runDetection(token);

  const after = await requestJson('/api/assistant/leaks', token);
  assertSuccess(after, 'Leak history read after audit');
  const afterLeaks = Array.isArray(after.data?.leaks) ? after.data.leaks : [];
  const drillCoverage = await auditDrillCoverage(token, afterLeaks);
  if (completeDrill && !drillCoverage.verifiedDrill) {
    throw new Error('No provenance-sealed corrective drill is available for completion testing.');
  }
  const drillResult = completeDrill ? await completeVerifiedDrill(token, drillCoverage.verifiedDrill) : null;

  console.log(JSON.stringify({
    success: true,
    baseUrl,
    leakHistory: { before: beforeLeaks.length, after: afterLeaks.length },
    deterministicAudit: audit,
    correctiveDrillCoverage: drillCoverage.diagnostics,
    verifiedDrill: {
      available: Boolean(drillCoverage.verifiedDrill),
      questions: drillCoverage.verifiedDrill?.questions.length || 0,
      answerKeysHidden: Boolean(drillCoverage.verifiedDrill),
      ...(drillResult || {}),
    },
  }, null, 2));
} finally {
  await supabase.auth.signOut({ scope: 'local' });
}
