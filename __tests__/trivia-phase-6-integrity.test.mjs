import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = file => readFileSync(join(ROOT, file), 'utf8');
const require = createRequire(import.meta.url);
const { checkLogic } = require('../scripts/trivia-qa-validator.js');

const contentSecurity = read('supabase/migrations/20260827230000_trivia_phase6_content_security.sql');
const atomicEconomy = read('supabase/migrations/20260827230500_trivia_phase6_atomic_economy.sql');
const settlement = read('supabase/migrations/20260827231000_trivia_phase6_settlement_replay.sql');
const retireBiasedV2 = read('supabase/migrations/20260827231500_trivia_phase6_retire_biased_v2.sql');
const serverOwnedStats = read('supabase/migrations/20260827232000_trivia_phase6_server_owned_stats.sql');
const tournamentInvoker = read('supabase/migrations/20260827232500_trivia_phase6_tournament_view_invoker.sql');
const submit = read('pages/api/trivia/session-submit.js');
const answer = read('pages/api/trivia/session-answer.js');
const legacySubmit = read('pages/api/trivia/submit.js');
const generator = read('pages/api/cron/generate-trivia.js');
const diamondEngine = read('src/services/DiamondEngine.js');
const deterministicSeeder = read('scripts/trivia-deterministic-seed.js');
const endless = read('pages/hub/trivia/endless.js');
const survival = read('pages/hub/trivia/survival-game.js');
const pvpPage = read('pages/hub/trivia/pvp.js');
const pvpSettlement = read('pages/api/trivia/pvp-settle-match.js');
const modePage = read('pages/hub/trivia/[mode].js');

test('validator rejects duplicate dealt cards and impossible action order', () => {
    const duplicateCard = checkLogic({
        category: 'cash_game_situations',
        question: '100BB effective. Hero holds As Js on the BTN. Flop is Js 7d 4c. What is the best play?',
        options: ['Check', 'Bet 33%', 'Bet 75%', 'Fold'],
        correct_index: 1,
    });
    assert.ok(duplicateCard.some(error => error.startsWith('LOGIC-08')));

    const impossibleOrder = checkLogic({
        category: 'cash_game_situations',
        question: '100BB effective. Hero holds AQo in CO. BTN opens to 3BB and hero calls. What is the best play?',
        options: ['Fold', 'Call', 'Raise', 'All-in'],
        correct_index: 1,
    });
    assert.ok(impossibleOrder.some(error => error.startsWith('LOGIC-09')));
});

test('answer-bearing question columns and grading oracle are server-only', () => {
    assert.match(contentSecurity, /REVOKE ALL PRIVILEGES ON public\.trivia_questions FROM anon, authenticated/);
    assert.doesNotMatch(contentSecurity, /GRANT SELECT \([^)]*correct_index/s);
    assert.doesNotMatch(contentSecurity, /GRANT SELECT \([^)]*engine_metadata/s);
    assert.match(contentSecurity, /REVOKE EXECUTE ON FUNCTION public\.fn_trivia_grade_answer/);
    assert.match(contentSecurity, /trivia_questions_servable_fingerprint_uidx/);
});

test('trivia economy has exact conservation, atomic entries and immutable item ledger', () => {
    assert.match(atomicEconomy, /v_exact_type := p_type IN/);
    assert.match(atomicEconomy, /diamond_multiplier/);
    assert.match(atomicEconomy, /v_multiplier := 1\.00/);
    assert.match(atomicEconomy, /diamond_transactions_user_reference_uidx/);
    assert.match(atomicEconomy, /CREATE TABLE IF NOT EXISTS public\.trivia_item_transactions/);
    assert.match(atomicEconomy, /CREATE OR REPLACE FUNCTION public\.enter_trivia_tournament_v2/);
    assert.match(atomicEconomy, /CREATE OR REPLACE FUNCTION public\.create_trivia_pvp_session_v2/);
});

test('settlement is replay-safe, deadline-bound and fails closed on credit errors', () => {
    assert.match(settlement, /v_session\.settlement_result \|\| jsonb_build_object\('replayed',true\)/);
    assert.match(settlement, /now\(\)>v_session\.expires_at/);
    assert.match(settlement, /RAISE EXCEPTION 'trivia payout rejected/);
    assert.match(settlement, /daily_bonus_awarded/);
    assert.match(settlement, /trivia_wheel_item_/);
    assert.match(submit, /answers` deliberately remains unread beyond shape validation/);
    assert.match(submit, /dailyBonusAwarded: Number\(award\?\.daily_bonus_awarded\)/);
    assert.match(answer, /session_expired' \? 410/);
});

test('legacy forged scores are retired and model strategy generation is disabled', () => {
    assert.match(legacySubmit, /status\(410\)/);
    assert.match(legacySubmit, /legacy_submit_retired/);
    assert.match(generator, /const GENERATION_CATEGORIES = CATEGORIES\.filter/);
    assert.match(generator, /GENERATION_BUDGET_MS = 150000/);
    assert.match(generator, /inconclusive_after_retries/);
    assert.match(retireBiasedV2, /deterministic_v2_answer_position_bias/);
    assert.match(deterministicSeeder, /function deterministicRandom\(seed\)/);
    assert.match(deterministicSeeder, /answer-position bias gate failed/);
    assert.match(deterministicSeeder, /engine_version: 3/);
});

test('browser diamond spends carry an idempotency reference', () => {
    assert.match(diamondEngine, /const referenceId = metadata\.referenceId/);
    assert.match(diamondEngine, /referenceId,/);
    assert.match(endless, /trivia_lifeline:\$\{serverRun\.sessionId\}:\$\{currentQuestion\?\.id\}:skip/);
    assert.match(survival, /trivia_lifeline:\$\{serverRun\.sessionId\}:\$\{currentQuestion\?\.id\}:skip/);
});

test('streak and PvP statistics are owned by verified server settlement', () => {
    assert.match(serverOwnedStats, /CREATE OR REPLACE FUNCTION public\.record_trivia_pvp_stats_v2/);
    assert.match(serverOwnedStats, /stats_recorded_at IS NOT NULL/);
    assert.match(serverOwnedStats, /REVOKE EXECUTE ON FUNCTION public\.fn_trivia_pvp_record_result/);
    assert.match(serverOwnedStats, /REVOKE EXECUTE ON FUNCTION public\.update_trivia_streak/);
    assert.match(serverOwnedStats, /REVOKE EXECUTE ON FUNCTION public\.increment_trivia_skipped/);
    assert.match(serverOwnedStats, /REVOKE EXECUTE ON FUNCTION public\.get_diamond_balance/);
    assert.match(pvpSettlement, /record_trivia_pvp_stats_v2/);
    assert.match(pvpSettlement, /settlement_kind: decision\.kind/);
    assert.doesNotMatch(pvpPage, /fn_trivia_pvp_record_result/);
    assert.doesNotMatch(modePage, /supabase\.rpc\('update_trivia_streak'/);
});

test('public tournament catalogue is invoker-safe and carries no question roster', () => {
    assert.match(tournamentInvoker, /WITH \(security_invoker = true\)/);
    assert.match(tournamentInvoker, /'\[\]'::jsonb AS questions/);
    assert.match(tournamentInvoker, /REVOKE ALL PRIVILEGES ON public\.trivia_tournaments FROM anon, authenticated/);
    assert.doesNotMatch(tournamentInvoker, /GRANT SELECT \([^)]*questions/s);
});
