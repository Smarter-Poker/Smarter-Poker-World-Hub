/**
 * Trivia Phase 3 Solo Engine V3 activation readiness hardening tests.
 *
 * Covers:
 *  1. Additive forward SQL migration (`20261124060500_trivia_p3_v3_solo_hardening.sql`):
 *     - Pre-flight live function MD5 checks & overload guards
 *     - Void-safe V3 & legacy sequence/gap predicates in `trivia_solo_miss_status_v1`
 *     - `trivia_p3_expire_session` upgraded to `trivia_p3_finalize_session_v4`
 *     - Post-flight logic + SECURITY DEFINER / search_path / owner-only ACL invariants
 *     - Pasteable `FORWARD ROLLBACK` block, zero destructive DDL or browser grants
 *  2. API V3 resume deadline enforcement (`session-start.js` returns 410 `session_expired`
 *     instead of 200 when resuming an expired-but-open V3 session).
 *  3. Defensive `v3ErrorStatus('answer_sequence_invalid') === 409` mapping in `phase3Engine.mjs`.
 *  4. Fresh V3 solo starts feed the 60-day no-repeat window via `recordQuestionsSeen`
 *     (matching legacy `session-start.js`).
 *  5. `submitV3` (`session-submit.js`) includes `servedTotal` parity with legacy settlement.
 *  6. `.env.example` documents `TRIVIA_P3_SOLO_ENGINE_V3`, `TRIVIA_FREE_LEGACY_FALLBACK_ENABLED`,
 *     and `TRIVIA_P3_SHADOW_SELECTOR` with fail-closed defaults.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { v3ErrorStatus } from '../src/lib/trivia/phase3Engine.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MIGRATION_PATH = 'supabase/migrations/20261124060500_trivia_p3_v3_solo_hardening.sql';

test('migration has Tier 3 header, pre-flight MD5 checks, post-flight security guards, and forward rollback', () => {
    const sql = read(MIGRATION_PATH);
    const rollbackIdx = sql.indexOf('-- FORWARD ROLLBACK:');
    assert.ok(rollbackIdx > 0, 'migration includes FORWARD ROLLBACK section');
    const executable = sql.slice(0, rollbackIdx);
    const rollback = sql.slice(rollbackIdx);

    assert.match(executable, /^-- TIER:\s*3$/m);
    assert.match(executable, /^-- IRREVERSIBLE:\s*no$/m);
    assert.match(executable, /^BEGIN;/m);
    assert.match(executable, /SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;/);
    assert.match(executable, /NOTIFY pgrst,\s*'reload schema';\s*\nCOMMIT;/);

    // Pre-flight exact predecessor MD5 verification & single-overload guards
    assert.match(
        executable,
        /md5\(pg_catalog\.pg_get_functiondef\('public\.trivia_solo_miss_status_v1\(uuid,uuid\)'::regprocedure\)\)\s*<>\s*'6b7b9d1e00fb696cf6d1a360bff1fbd1'/,
    );
    assert.match(
        executable,
        /md5\(pg_catalog\.pg_get_functiondef\('public\.trivia_p3_expire_session\(uuid,text\)'::regprocedure\)\)\s*<>\s*'b4d7208fcae4fb25791a6237472d3249'/,
    );
    assert.match(executable, /to_regprocedure\('public\.trivia_p3_finalize_session_v4\(uuid,text,uuid\)'\) IS NULL/);

    // Post-flight security and ACL preservation (owner-only, no browser or service_role drift)
    assert.match(executable, /DO \$postflight\$/);
    assert.match(executable, /p\.proacl = ARRAY\['postgres=X\/postgres'\]::aclitem\[\]/);
    assert.doesNotMatch(executable, /\bGRANT\b[\s\S]*\bTO\s+(?:anon|authenticated|PUBLIC|service_role)\b/i);
    assert.doesNotMatch(executable, /\bDROP\s+(?:TABLE|FUNCTION|VIEW|TRIGGER)\b/i);

    // Rollback block restores both original functions inside a pasteable transaction
    assert.match(rollback, /\/\*\s*\nBEGIN;/);
    assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.trivia_solo_miss_status_v1/);
    assert.match(rollback, /CREATE OR REPLACE FUNCTION public\.trivia_p3_expire_session/);
    assert.match(rollback, /PERFORM public\.trivia_p3_finalize_session\(s\.id, 'expired', NULL\);/);
});

test('migration excludes server-voided rows from V3 and legacy sequence/gap validation', () => {
    const sql = read(MIGRATION_PATH);
    const executable = sql.slice(0, sql.indexOf('-- FORWARD ROLLBACK:'));
    const missStart = executable.indexOf('CREATE OR REPLACE FUNCTION public.trivia_solo_miss_status_v1');
    const expireStart = executable.indexOf('CREATE OR REPLACE FUNCTION public.trivia_p3_expire_session');
    assert.ok(missStart > 0 && expireStart > missStart);

    const missFn = executable.slice(missStart, expireStart);
    const expireFn = executable.slice(expireStart, executable.indexOf('DO $postflight$'));

    // V3 sequence null/<1, distinct count, monotonicity, and gap upper bound ignore server_voided_at IS NOT NULL
    const nonVoidPredicateCount = (missFn.match(/a\.outcome IS NOT NULL AND a\.server_voided_at IS NULL/g) || []).length;
    assert.equal(nonVoidPredicateCount, 4, 'all four V3 sequence/gap queries exclude server-voided rows');
    assert.match(
        missFn,
        /earlier\.outcome IS NOT NULL AND earlier\.server_voided_at IS NULL\s+AND later\.outcome IS NOT NULL AND later\.server_voided_at IS NULL/,
    );
    // V3 contiguous gap check still allows a voided slot at pos <= max_pos
    assert.match(missFn, /\(a\.outcome IS NOT NULL OR a\.server_voided_at IS NOT NULL\)/);

    // Legacy gap upper bound excludes server-voided entries (`v = true`)
    assert.match(
        missFn,
        /WHERE s\.answers\?q\.question_id::text\s+AND \(s\.answers->q\.question_id::text\)->'v' IS DISTINCT FROM 'true'::jsonb/,
    );

    // Expiry calls Phase 8 finalizer v4, never legacy v1
    assert.match(expireFn, /PERFORM public\.trivia_p3_finalize_session_v4\(s\.id, 'expired', NULL\);/);
    assert.doesNotMatch(expireFn, /trivia_p3_finalize_session\(/);
});

test('v3ErrorStatus maps answer_sequence_invalid to HTTP 409 conflict', () => {
    assert.equal(v3ErrorStatus('answer_sequence_invalid'), 409);
    assert.equal(v3ErrorStatus('session_expired'), 410);
    assert.equal(v3ErrorStatus('insufficient_eligible_pool'), 503);
});

test('session-start validates deadline before resuming V3 sessions and records seen history on fresh V3 starts', () => {
    const startSrc = read('pages/api/trivia/session-start.js');

    // Resume branch enforces deadline before invoking startOrResumeSoloV3(..., true)
    const existingBranch = startSrc.slice(
        startSrc.indexOf('if (existing) {'),
        startSrc.indexOf('if (isSoloEngineV3Enabled(process.env))'),
    );
    assert.match(existingBranch, /if \(existing\.engine_version\)/);
    const deadlineCheckIdx = existingBranch.indexOf('validateTriviaSessionDeadline(existing.expires_at');
    const resumeCallIdx = existingBranch.indexOf('startOrResumeSoloV3(res, sb, userId, mode, startNonce, parentSessionId, true)');
    assert.ok(deadlineCheckIdx > 0 && deadlineCheckIdx < resumeCallIdx, 'V3 resume validates deadline before serving session');
    assert.match(existingBranch, /deadline\.error === 'session_expired' \? 410 : 502/);

    // Fresh V3 starts record served questions in 60-day no-repeat history without blocking response
    const v3StartFn = startSrc.slice(
        startSrc.indexOf('async function startOrResumeSoloV3'),
        startSrc.indexOf('const MAX_QUESTIONS ='),
    );
    assert.match(v3StartFn, /if \(!body\.resumed\)/);
    assert.match(v3StartFn, /recordQuestionsSeen\(sb, userId, servedIds, mode\)/);
    assert.match(v3StartFn, /\.catch\(/);
});

test('submitV3 returns servedTotal for response parity with legacy settlement', () => {
    const submitSrc = read('pages/api/trivia/session-submit.js');
    const submitV3 = submitSrc.slice(
        submitSrc.indexOf('async function submitV3'),
        submitSrc.indexOf('const UUID_RE ='),
    );
    assert.match(submitV3, /const servedTotal = Number\.isInteger\(settled\.total\)/);
    assert.match(submitV3, /total:\s*settled\.graded_total,\s*servedTotal,/);
});

test('.env.example documents Phase 3 solo release controls with fail-closed defaults', () => {
    const envExample = read('.env.example');
    assert.match(envExample, /^TRIVIA_P3_SOLO_ENGINE_V3=false$/m);
    assert.match(envExample, /^TRIVIA_FREE_LEGACY_FALLBACK_ENABLED=false$/m);
    assert.match(envExample, /^TRIVIA_P3_SHADOW_SELECTOR=true$/m);
});
