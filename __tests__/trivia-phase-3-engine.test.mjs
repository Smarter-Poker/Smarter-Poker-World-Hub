/**
 * Trivia Phase 3 - question eligibility, deterministic engine v3, session integrity.
 *
 * 1. 1,000 golden seeds exported from the database engine (docs/trivia/evidence/
 *    phase3-golden-seeds.json, produced by scripts/trivia/phase3-replica-tests.cjs on two
 *    independently built replicas) replay identically in the JS reference: roster,
 *    per-player permutation, grading and score.
 * 2. Request guards and DTO sanitization.
 * 3. Source contracts: paid/competitive selection reads only the eligibility definition,
 *    grading is database-owned for engine v3, report intake is the rate-limited function,
 *    the audit drains the review queue, domain alerts are wired, migrations lock ACLs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { gradeRun, optionPermutation, selectRoster, sha256Hex } from '../src/lib/trivia/deterministicEngine.mjs';
import {
    CLIENT_TIMING_FIELDS, SELF_GRADED_FIELDS, findForbiddenFields, isFreeLegacyFallbackEnabled,
    isShadowSelectorEnabled, isSoloEngineV3Enabled, phase3HealthFailureEvent, stripKeyBearing, toSoloStartResponse,
    v3ErrorStatus,
} from '../src/lib/trivia/phase3Engine.mjs';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const golden = JSON.parse(read('docs/trivia/evidence/phase3-golden-seeds.json'));
const md5uuid = (s) => { const h = createHash('md5').update(s).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; };

test('1,000 golden seeds replay identically (roster, permutation, grading, score)', () => {
    const secret = Buffer.from(golden.secret, 'utf8');
    const cats = golden.pool.categories;
    const pool = [];
    const index = new Map();
    for (let i = 0; i < golden.pool.size; i++) {
        const id = md5uuid(`p3-golden-q-${i}`);
        index.set(id, i);
        pool.push({ id, category: cats[i % 10], difficulty: ['easy', 'medium', 'hard'][Math.floor(i / 10) % 3] });
    }
    const profileIds = ['tournament.nightly/roster@1', 'pvp.standard/roster@1', 'solo.arcade/roster@1', 'solo.mixed/roster@1'];
    assert.equal(golden.seeds.length, 1000);
    const rows = [];
    for (const [seed, digestPrefix, expectedCorrect] of golden.seeds) {
        const profile = golden.profiles[profileIds[seed % 4]];
        const withPlayer = seed % 10 === 0;
        const candidates = pool.filter(q => profile.categories.includes(q.category))
            .map(q => ({ ...q, tier: withPlayer && index.get(q.id) % 5 === 0 ? 2 : 0 }));
        const roster = selectRoster({ secret, label: `golden:${seed}`, profile, candidates });
        assert.equal(roster.length, profile.questionCount, `seed ${seed} size`);
        assert.equal(new Set(roster.map(q => q.id)).size, roster.length, `seed ${seed} unique`);
        const session = md5uuid(`p3-golden-session-${seed}`);
        const perms = roster.map(q => optionPermutation(secret, session, q.id, 4));
        const permutations = Object.fromEntries(roster.map((q, i) => [q.id, perms[i]]));
        const answers = Object.fromEntries(roster.map((q, i) => [q.id, ((seed + i + 1) % 5) - 1]));
        const keys = Object.fromEntries(roster.map(q => [q.id, index.get(q.id) % 4]));
        const graded = gradeRun({ roster, permutations, answers, keys, pointsPerCorrect: profile.points });
        assert.equal(graded.correct, expectedCorrect, `seed ${seed} grade`);
        const digest = sha256Hex(JSON.stringify({ ids: roster.map(q => q.id), tiers: roster.map(q => q.tier), perms,
            correct: graded.correct, score: graded.score }));
        assert.equal(digest.slice(0, 16), digestPrefix, `seed ${seed} digest`);
        rows.push([seed, digestPrefix, expectedCorrect]);
    }
    assert.equal(sha256Hex(JSON.stringify(rows)), golden.aggregate);
});

test('player history is avoided first and categories/difficulty stay balanced', () => {
    const secret = Buffer.from('balance-probe', 'utf8');
    const profile = golden.profiles['tournament.nightly/roster@1'];
    const cats = golden.pool.categories;
    const candidates = [];
    for (let i = 0; i < 600; i++) candidates.push({ id: md5uuid(`b-${i}`), category: cats[i % 10],
        difficulty: ['easy', 'medium', 'hard'][Math.floor(i / 10) % 3], tier: Math.floor(i / 10) % 2 === 0 ? 2 : 0 });
    const roster = selectRoster({ secret, label: 'probe', profile, candidates });
    assert.equal(roster.length, 10);
    assert.ok(roster.every(q => q.tier === 0), 'fresh questions are preferred over a player\'s history');
    assert.equal(new Set(roster.map(q => q.category)).size, 10, 'one per category for a 10-question round');
    const diff = roster.reduce((m, q) => ({ ...m, [q.difficulty]: (m[q.difficulty] || 0) + 1 }), {});
    assert.deepEqual(diff, { easy: 2, medium: 5, hard: 3 });
});

test('release controls: only exact lowercase true enables; shadow selector defaults on', () => {
    for (const v of [undefined, '', 'TRUE', 'True', '1', 'yes', ' true']) {
        assert.equal(isSoloEngineV3Enabled({ TRIVIA_P3_SOLO_ENGINE_V3: v }), false);
        assert.equal(isFreeLegacyFallbackEnabled({ TRIVIA_FREE_LEGACY_FALLBACK_ENABLED: v }), false);
    }
    assert.equal(isSoloEngineV3Enabled({ TRIVIA_P3_SOLO_ENGINE_V3: 'true' }), true);
    assert.equal(isShadowSelectorEnabled({}), true);
    assert.equal(isShadowSelectorEnabled({ TRIVIA_P3_SHADOW_SELECTOR: 'false' }), false);
});

test('self-graded shapes and client clocks are detected anywhere in a request', () => {
    assert.deepEqual(findForbiddenFields({ sessionId: 'x', answers: [{ questionId: 'q', displayIndex: 1 }], cashedOut: true },
        SELF_GRADED_FIELDS), []);
    assert.deepEqual(findForbiddenFields({ score: 900, answers: [{ questionId: 'q', isCorrect: true }] }, SELF_GRADED_FIELDS),
        ['score', 'answers[].isCorrect']);
    assert.deepEqual(findForbiddenFields({ sessionId: 's', questionId: 'q', displayIndex: 0, elapsedMs: 10 }, CLIENT_TIMING_FIELDS),
        ['elapsedMs']);
});

test('bound-answer and immutable-provenance refusals have one stable conflict mapping', () => {
    for (const code of [
        'answer_not_bound', 'answer_not_revealed', 'answer_already_recorded',
        'revision_provenance_unavailable', 'revision_not_found', 'question_still_valid',
        'not_legacy_session', 'answer_record_invalid', 'reveal_policy_unavailable',
        'strategy_mode_category_mismatch',
    ]) assert.equal(v3ErrorStatus(code), 409, code);
    assert.equal(v3ErrorStatus('not_your_session'), 403);
    assert.equal(v3ErrorStatus('question_not_in_session'), 400);
});

test('question DTOs never carry answer keys, explanations or revision internals', () => {
    const dto = { success: true, sessionId: 's', mode: 'arcade', engine: 'trivia-engine/3', entryCost: 10,
        questions: [{ position: 1, id: 'q', question: 'Q?', options: ['a', 'b'], category: 'c', difficulty: 'easy',
            correct_index: 1, explanation: 'b because', revision_id: 'r', originalIndex: 0 }],
        contract: { rosterHash: 'h' }, contractSignature: 'sig' };
    const out = toSoloStartResponse(dto);
    const text = JSON.stringify(out);
    for (const k of ['correct_index', 'explanation', 'revision_id', 'originalIndex']) assert.ok(!text.includes(k), k);
    assert.deepEqual(out.questions[0], {
        position: 1, state: 'unanswered', id: 'q', question: 'Q?', options: ['a', 'b'],
        category: 'c', difficulty: 'easy', openedAt: null, deadlineAt: null,
    });
    assert.deepEqual(stripKeyBearing({ a: [{ answer_key: 1, keep: 2 }] }), { a: [{ keep: 2 }] });
});

test('routes: paid/competitive selection reads only the eligibility definition; grading is database-owned', () => {
    const start = read('pages/api/trivia/session-start.js');
    assert.match(start, /source: ELIGIBLE_SERVING_SOURCE,\s*mode: 'pvp'/);
    assert.match(start, /source: ELIGIBLE_SERVING_SOURCE,\s*mode,/);
    assert.match(start, /\.from\(ELIGIBLE_SERVING_SOURCE\)\s*\.select\('id, question, options, category, difficulty'\)\s*\.eq\('daily_date'/);
    assert.match(start, /FREE_MODES\.has\(mode\) && isFreeLegacyFallbackEnabled\(process\.env\)/);
    assert.match(start, /trivia_start_solo_session_v3/);
    assert.match(start, /trivia_shadow_compare_v1/);
    const answer = read('pages/api/trivia/session-answer.js');
    assert.match(answer, /client_timing_not_accepted/);
    assert.match(answer, /trivia_session_answer_v4/);
    const submit = read('pages/api/trivia/session-submit.js');
    assert.match(submit, /legacy_submission_shape/);
    assert.match(submit, /trivia_session_settle_solo_v4/);
    assert.match(submit, /trivia_session_submit_v3/);
    assert.match(submit, /\(sig != null \|\| competitive\) && sig !== session\.contract_signature/);
    const hook = read('src/hooks/useServerGradedRun.js');
    assert.match(hook, /contractSignatureRef\.current = json\.contractSignature \|\| null/);
    assert.match(hook, /contractSignature: contractSignatureRef\.current/);
    const report = read('pages/api/trivia/report-question.js');
    assert.match(report, /trivia_submit_question_report_v2/);
    assert.doesNotMatch(report, /from\('trivia_question_reports'\)/);
    assert.doesNotMatch(report, /quality_score:/);
    const gen = read('pages/api/cron/generate-trivia.js');
    const audit = gen.slice(gen.indexOf('async function selfAuditQuestions'), gen.indexOf('// HANDLER'));
    assert.match(audit, /trivia_claim_review_batch_v1/);
    assert.match(audit, /trivia_record_question_review_v1/);
    assert.doesNotMatch(audit, /correct_index/);
    const guard = read('pages/api/cron/trivia-pool-guard.js');
    assert.match(guard, /trivia_question_health_v1/);
    assert.match(guard, /trivia_expire_stale_sessions_v1/);
    assert.match(guard, /recordOperationalAlerts/);
    assert.equal(JSON.parse(read('vercel.json')).crons.filter(c => /trivia/.test(c.path)).length, 3, 'no new schedule');
});

test('migrations: additive, postconditions inside, browser roles locked out, secret owner-only', () => {
    const files = ['supabase/migrations/20260930060554_trivia_p3_question_curation.sql',
        'supabase/migrations/20260930061357_trivia_p3_roster_session_engine.sql'].map(read);
    for (const sql of files) {
        assert.match(sql, /^BEGIN;/m);
        assert.match(sql, /^COMMIT;/m);
        assert.match(sql, /RAISE EXCEPTION 'postcondition/);
        assert.doesNotMatch(sql, /GRANT [^;]* TO (anon|PUBLIC)\b/i);
        assert.doesNotMatch(sql, /\bDROP TABLE\b|\bDELETE FROM public\.trivia_(questions|sessions)\b|\bTRUNCATE\b[^;]*trivia_questions/i);
        const headers = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$/g) || [];
        const definers = headers.filter(h => /SECURITY DEFINER/.test(h));
        assert.ok(definers.length > 5 && definers.every(h => /SET search_path/.test(h)), 'every definer pins search_path');
    }
    const authGrants = files.join('\n').match(/GRANT [^;]* TO authenticated/g) || [];
    assert.deepEqual(authGrants, ['GRANT SELECT (id, question_id, user_id, reason, note, created_at, state, resolved_at, resolution)\n    ON public.trivia_question_reports TO authenticated']);
    assert.match(files[1], /REVOKE ALL ON TABLE public\.trivia_engine_secrets FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(files[1], /'public\.trivia_engine_secret_v1\(text\)'/);
});

test('engine speed migrations: same keys and passes, no temporary tables, pool read once, inline hash', () => {
    const m3 = read('supabase/migrations/20260930141736_trivia_p3_engine_speed.sql');
    const m4 = read('supabase/migrations/20260930142146_trivia_p3_health_speed.sql');
    for (const sql of [m3, m4]) {
        assert.doesNotMatch(sql, /GRANT [^;]* TO (anon|authenticated|PUBLIC)\b/i);
        assert.doesNotMatch(sql, /\bDROP (TABLE|FUNCTION|VIEW)\b|\bDELETE FROM\b|\bTRUNCATE public\./i);
        assert.match(sql, /DO \$post\$/);
        const headers = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$\$/g) || [];
        assert.ok(headers.length > 0 && headers.every(h => /SECURITY DEFINER/.test(h) && /SET search_path/.test(h)),
            'every function is a definer with a pinned search_path');
    }
    const between = (sql, from, to) => sql.slice(sql.indexOf(from), sql.indexOf(to, sql.indexOf(from) + from.length));
    const passes = between(m3, 'FUNCTION public.trivia_p3_select_passes_v1', 'CREATE OR REPLACE FUNCTION');
    assert.doesNotMatch(passes, /CREATE TEMP TABLE/);
    for (const label of [':c:', ':q:', ':t:', ':o:']) {
        assert.ok(passes.includes(`'trivia-select/1:' || p_label || '${label}'`), `trivia-select/1 key ${label}`);
    }
    const candidates = between(m3, 'FUNCTION public.trivia_p3_candidates_v1', 'CREATE OR REPLACE FUNCTION');
    assert.match(candidates, /v_seen \? p\.question_id::text/);
    assert.match(candidates, /v_cool \? p\.question_id::text/);
    const preflight = between(m3, 'FUNCTION public.trivia_preflight_tournament_v1', 'CREATE OR REPLACE FUNCTION');
    assert.equal((preflight.match(/trivia_p3_candidates_v1\(/g) || []).length, 1, 'the preflight reads the pool once');
    assert.match(m3, /REVOKE ALL ON FUNCTION public\.trivia_p3_candidates_v1\([^)]*\) FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(m3, /REVOKE ALL ON FUNCTION public\.trivia_p3_select_passes_v1\([^)]*\) FROM PUBLIC, anon, authenticated, service_role/);
    assert.doesNotMatch(m4.slice(0, m4.indexOf('DO $post$')), /trivia_question_content_hash_v1\(q\./);
    assert.match(m4, /IS DISTINCT FROM public\.trivia_question_content_hash_v1/);
    const runner = read('scripts/trivia/phase3-replica-tests.cjs');
    for (const f of ['20260930141736_trivia_p3_engine_speed.sql', '20260930142146_trivia_p3_health_speed.sql']) {
        assert.ok(runner.includes(f), `replica suite installs ${f}`);
    }
});

test('a health run that cannot finish raises its own alert, one episode per UTC day', () => {
    const now = new Date('2026-09-30T13:30:14Z');
    const event = phase3HealthFailureEvent({ source: 'worldhub.trivia-questions', error: 'canceling statement due to statement timeout', now });
    assert.equal(event.alertname, 'TriviaQuestionHealthCheckFailed');
    assert.equal(event.status, 'firing');
    assert.equal(event.severity, 'warning');
    assert.equal(event.source, 'worldhub.trivia-questions');
    assert.match(event.event_key, /^[0-9a-f]{64}$/);
    assert.match(event.payload.summary, /statement timeout/);
    const later = phase3HealthFailureEvent({ source: event.source, error: 'other', now: new Date('2026-09-30T23:59:59Z') });
    const nextDay = phase3HealthFailureEvent({ source: event.source, error: 'other', now: new Date('2026-10-01T00:00:00Z') });
    assert.equal(later.event_key, event.event_key);
    assert.notEqual(nextDay.event_key, event.event_key);
    const guard = read('pages/api/cron/trivia-pool-guard.js');
    const body = guard.slice(guard.indexOf('export async function runPhase3Health'));
    const deliver = body.indexOf('await record([phase3HealthFailureEvent({ source: TRIVIA_QUESTIONS_ALERT_SOURCE, error: reason })]);');
    assert.ok(deliver > 0 && deliver < body.indexOf('throw new Error(reason);'), 'the failure is delivered before the pass gives up');
});
