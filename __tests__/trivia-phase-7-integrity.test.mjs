import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');

const modePage = read('pages/hub/trivia/[mode].js');
const browserSources = [modePage, 'mixed', 'endless', 'survival-game', 'time-attack', 'tournaments']
    .map((source, index) => index === 0 ? source : read(`pages/hub/trivia/${source}.js`))
    .join('\n');
const tournamentSubmit = read('pages/api/trivia/tournament-submit-round.js');
const wheelRoute = read('pages/api/trivia/prize-wheel-spin.js');
const migration = read('supabase/migrations/20260828003306_trivia_phase7_server_owned_analytics.sql');
const legacyReferenceRepair = read('supabase/migrations/20260828003436_trivia_phase7_legacy_refund_references.sql');
const atomicTournamentTotals = read('supabase/migrations/20260828030554_trivia_phase7_atomic_tournament_totals.sql');
const poolAudit = read('scripts/e2e_trivia_test.js');
const dailyRoute = read('pages/api/trivia/daily.js');
const generationCron = read('pages/api/cron/generate-trivia.js');
const factualSeeder = read('scripts/trivia-grok-seed.js');
const deterministicSeeder = read('scripts/trivia-deterministic-seed.js');
const factualAudit = read('scripts/trivia-quality-audit-now.js');

test('every dynamic trivia mode uses the server-authoritative session flow', () => {
    const literal = modePage.match(/const SERVER_GRADED_PAGE_MODES = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(literal, 'server grading mode allow-list must remain explicit');
    const modes = [...literal[1].matchAll(/'([^']+)'/g)].map(match => match[1]).sort();
    assert.deepEqual(modes, [
        'arcade', 'cash', 'daily', 'gto', 'history', 'icm', 'mtt', 'pro', 'rules'
    ]);
    assert.doesNotMatch(modePage, /router\.query\.serverGrading/);
    assert.match(modePage, /if \(serverGraded\) \{[\s\S]*serverRun\.start/);
    assert.match(modePage, /if \(!useServerPayout \|\| !serverResult\?\.scoreId\)/);
});

test('browser trivia pages do not mutate server-owned analytics tables', () => {
    for (const table of ['trivia_user_question_history', 'trivia_category_mastery', 'daily_trivia_plays']) {
        const mutation = new RegExp(
            `from\\(['\"]${table}['\"]\\)[\\s\\S]{0,220}?\\.(?:insert|update|upsert|delete)\\(`,
            'm'
        );
        assert.doesNotMatch(browserSources, mutation, `${table} must be browser read-only`);
    }
});

test('verified settlement atomically owns analytics and immutable result events', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.trivia_question_result_events/);
    assert.match(migration, /UNIQUE \(source_type, source_id, user_id, question_id\)/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.finalize_trivia_session_stats_v3/);
    assert.match(migration, /AFTER UPDATE OF settlement_result ON public\.trivia_sessions/);
    assert.match(migration, /SET skipped_count = COALESCE\(skipped_count, 0\) \+ 1/);
    assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON public\.trivia_category_mastery FROM anon, authenticated/);
    assert.match(migration, /daily_trivia_plays_user_date_uidx/);
});

test('tournament analytics and prize wheel are server-owned', () => {
    assert.match(tournamentSubmit, /fn_trivia_round_submit_verified_v3/);
    assert.match(tournamentSubmit, /legacy_answer_shape_rejected/);
    assert.doesNotMatch(tournamentSubmit, /usedLegacyShape|STRICT_GRADING|addEntryTotals/);
    assert.match(migration, /record_trivia_tournament_question_results_v3/);
    assert.match(migration, /fn_trivia_round_submit_verified_v3/);
    assert.match(atomicTournamentTotals, /UPDATE public\.trivia_tournament_entries AS e/);
    assert.match(atomicTournamentTotals, /'entry_score', v_entry_score/);
    assert.match(wheelRoute, /getServerUserWithFallback/);
    assert.match(wheelRoute, /applyRateLimit\(req, res, LIMITS\.write\)/);
    assert.match(wheelRoute, /score\.user_id !== user\.id/);
    assert.doesNotMatch(modePage, /supabase\.rpc\('fn_trivia_prize_wheel_spin'/);
});

test('pool and economy audits match live contracts', () => {
    assert.match(poolAudit, /daily: 10/);
    assert.match(poolAudit, /const ROSTER_TAG_PER_CATEGORY = 3/);
    assert.match(poolAudit, /CATEGORY_DAILY_DEMAND/);
    assert.doesNotMatch(poolAudit, /const ROSTER_PER_CATEGORY = 20/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.run_trivia_economy_audit_v1/);
    assert.match(migration, /missing_exact_references_30d/);
    assert.match(legacyReferenceRepair, /legacy_pvp_refund_incident_20260823_/);
    assert.match(legacyReferenceRepair, /refusing legacy reference repair/);
    assert.match(generationCron, /The audit can demote a just-tagged question/);
    assert.match(generationCron, /final depth refresh failed/);
});

test('daily stats expose the verified daily high score, not the streak length', () => {
    assert.match(dailyRoute, /const \[[\s\S]*?\{ data: bestScoreRow \}/);
    assert.match(dailyRoute, /\.eq\('server_verified', true\)/);
    assert.match(dailyRoute, /bestScore: bestScoreRow\?\.score \|\| 0/);
    assert.doesNotMatch(dailyRoute, /bestScore: streak\.best_streak/);
});

test('factual generation and verification fail closed on malformed or duplicate rows', () => {
    assert.match(factualSeeder, /if \(Array\.isArray\(q\.options\)\)/);
    assert.match(factualSeeder, /quality_score=gte\.6&select=question/);
    assert.match(factualSeeder, /global duplicate\(s\) skipped/);
    assert.match(factualAudit, /const SOURCE =/);
    assert.match(factualAudit, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(factualAudit, /while \(rows\.length < LIMIT\)/);
    assert.match(factualAudit, /\.range\(from, from \+ want - 1\)/);
    assert.match(factualAudit, /for \(let attempt = 0; attempt < 4; attempt\+\+\)[\s\S]*?api\.x\.ai/);
    assert.match(factualSeeder, /attempt < 6/);
    assert.match(factualSeeder, /status >= 500 && status <= 526/);
    assert.match(factualSeeder, /for \(let attempt = 0; attempt < 4; attempt\+\+\)[\s\S]*?api\.x\.ai/);
    assert.match(factualSeeder, /const CONCURRENCY = Math\.max\(1, Math\.min\(4/);
    assert.match(deterministicSeeder, /attempt < 6/);
    assert.match(deterministicSeeder, /response\.status >= 500 && response\.status <= 526/);
    assert.match(deterministicSeeder, /supabaseInsert[\s\S]*?fetchWithRetry/);
});
