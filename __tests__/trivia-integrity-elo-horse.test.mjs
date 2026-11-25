import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    computeEloUpdate,
    computeIntegrityRisk,
    DEFAULT_PVP_ELO,
    eloTierForRating,
    eloTierInk,
    HORSE_SKILL_TIERS,
    horseSkillBandForStake,
    parseIntegritySignalBody,
    sanitizeDisplayName,
} from '../src/lib/trivia/integrityAndElo.mjs';

const ROOT = process.cwd();
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

const migrationSql = read('supabase/migrations/20261124142400_trivia_integrity_elo_horse_tiers.sql');
const integrityRoute = read('pages/api/trivia/integrity-signal.js');
const ratingsRoute = read('pages/api/trivia/pvp/ratings.js');
const adminIntegrityRoute = read('pages/api/admin/trivia-integrity.js');
const pvpApiHandler = read('src/lib/trivia/pvpApiHandler.js');
const pvpSettleRoute = read('pages/api/trivia/pvp-settle-match.js');
const telemetryHook = read('src/hooks/useTriviaIntegrityTelemetry.js');
const serverGradedRun = read('src/hooks/useServerGradedRun.js');
const pvpPage = read('pages/hub/trivia/pvp.js');
const pvpExperience = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
const leaderboardPage = read('pages/hub/trivia/leaderboard.js');

const SAMPLE_UUID = '11111111-1111-4111-8111-111111111111';

test('migration defines RLS-locked tables, service-only RPCs, stake calibration trigger, and forward rollback', () => {
    for (const table of [
        'trivia_integrity_signals',
        'trivia_pvp_ratings',
        'trivia_pvp_rating_events',
        'trivia_pvp_horse_skill_tiers',
    ]) {
        assert.match(migrationSql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`));
        assert.match(migrationSql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
        assert.match(migrationSql, new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`));
    }
    // No player policies on trivia_integrity_signals
    assert.doesNotMatch(migrationSql, /CREATE POLICY[\s\S]*trivia_integrity_signals/i);

    for (const fn of [
        'trivia_record_integrity_signal_v1',
        'trivia_integrity_review_queue_v1',
        'trivia_pvp_elo_tier_v1',
        'trivia_pvp_update_rating_v1',
        'trivia_pvp_horse_skill_band_v1',
    ]) {
        assert.match(migrationSql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}`));
        assert.match(migrationSql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}[\\s\\S]*?FROM PUBLIC, anon, authenticated`));
        assert.match(migrationSql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}[\\s\\S]*?TO service_role`));
    }

    assert.match(migrationSql, /CREATE TRIGGER trivia_pvp_horse_plan_stake_calibrate_trg[\s\S]*BEFORE INSERT ON public\.trivia_pvp_horse_plans/);
    assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION public\.trivia_pvp__build_horse_plan/);
    assert.doesNotMatch(migrationSql, /trivia_ledger_hold|trivia_settlement_settle|add_diamonds_to_balance/);
    assert.match(migrationSql, /FORWARD ROLLBACK/);
    assert.match(migrationSql, /NOTIFY pgrst, 'reload schema'/);
});

test('PvP Elo tier thresholds map every boundary accurately', () => {
    assert.equal(eloTierForRating(100), 'Bronze');
    assert.equal(eloTierForRating(1149), 'Bronze');
    assert.equal(eloTierForRating(1150), 'Silver');
    assert.equal(eloTierForRating(1299), 'Silver');
    assert.equal(eloTierForRating(1300), 'Gold');
    assert.equal(eloTierForRating(1499), 'Gold');
    assert.equal(eloTierForRating(1500), 'Platinum');
    assert.equal(eloTierForRating(1699), 'Platinum');
    assert.equal(eloTierForRating(1700), 'Diamond');
    assert.equal(eloTierForRating(1899), 'Diamond');
    assert.equal(eloTierForRating(1900), 'Master');
    assert.equal(eloTierForRating(2400), 'Master');

    assert.equal(eloTierInk('Master'), 'gold');
    assert.equal(eloTierInk('Diamond'), 'blue');
    assert.equal(eloTierInk('Bronze'), 'silver');
});

test('PvP Elo math uses K=32 for human vs human and K=16 for human vs horse without mutating horse Elo', () => {
    const equalWin = computeEloUpdate({ r1: 1200, r2: 1200, outcome: 'p1_win', isHorseMatch: false });
    assert.equal(equalWin.kFactor, 32);
    assert.equal(equalWin.p1Delta, 16);
    assert.equal(equalWin.p2Delta, -16);
    assert.equal(equalWin.p1EloAfter, 1216);
    assert.equal(equalWin.p2EloAfter, 1184);
    assert.equal(equalWin.p1Tier, 'Silver');
    assert.equal(equalWin.p2Tier, 'Silver');

    const equalTie = computeEloUpdate({ r1: 1200, r2: 1200, outcome: 'tie', isHorseMatch: false });
    assert.equal(equalTie.p1Delta, 0);
    assert.equal(equalTie.p2Delta, 0);

    const upsetHorseWin = computeEloUpdate({
        r1: DEFAULT_PVP_ELO,
        r2: horseSkillBandForStake(100).horseElo,
        outcome: 'p1_win',
        isHorseMatch: true,
        p2IsHorse: true,
    });
    assert.equal(upsetHorseWin.kFactor, 16);
    assert.equal(upsetHorseWin.p1Delta, 15);
    assert.equal(upsetHorseWin.p2Delta, 0);
    assert.equal(upsetHorseWin.p1EloAfter, 1215);

    const expectedHorseLoss = computeEloUpdate({
        r1: 1200,
        r2: 1600,
        outcome: 'p2_win',
        isHorseMatch: true,
        p2IsHorse: true,
    });
    assert.equal(expectedHorseLoss.p1Delta, -1);
    assert.equal(expectedHorseLoss.p2Delta, 0);

    const floorClamp = computeEloUpdate({ r1: 100, r2: 100, outcome: 'p2_win' });
    assert.equal(floorClamp.p1EloAfter, 100);
});

test('stake-tiered horse skill calibration maps 10/25/50/100 stakes cleanly', () => {
    assert.equal(HORSE_SKILL_TIERS.length, 4);

    const b10 = horseSkillBandForStake(10);
    assert.equal(b10.minAccuracy, 0.60);
    assert.equal(b10.maxAccuracy, 0.72);
    assert.equal(b10.horseElo, 1180);
    assert.equal(b10.targetPersonaTier, 'Regular');

    const b25 = horseSkillBandForStake(25);
    assert.equal(b25.minAccuracy, 0.66);
    assert.equal(b25.maxAccuracy, 0.78);
    assert.equal(b25.horseElo, 1300);
    assert.equal(b25.targetPersonaTier, 'Intermediate');

    const b50 = horseSkillBandForStake(50);
    assert.equal(b50.minAccuracy, 0.72);
    assert.equal(b50.maxAccuracy, 0.84);
    assert.equal(b50.horseElo, 1450);
    assert.equal(b50.targetPersonaTier, 'Grinder');

    const b100 = horseSkillBandForStake(100);
    assert.equal(b100.minAccuracy, 0.76);
    assert.equal(b100.maxAccuracy, 0.88);
    assert.equal(b100.horseElo, 1600);
    assert.equal(b100.targetPersonaTier, 'Shark');
});

test('integrity telemetry validation enforces strict bounds and deterministic risk scoring', () => {
    assert.equal(parseIntegritySignalBody(null).ok, false);
    assert.equal(parseIntegritySignalBody({ sessionId: 'not-a-uuid', mode: 'daily' }).error, 'invalid_session_id');
    assert.equal(parseIntegritySignalBody({ sessionId: SAMPLE_UUID, mode: 'bad mode!' }).error, 'invalid_mode');
    assert.equal(parseIntegritySignalBody({ sessionId: SAMPLE_UUID, mode: 'daily', tabBlurCount: -1 }).error, 'invalid_telemetry_bounds');
    assert.equal(parseIntegritySignalBody({ sessionId: SAMPLE_UUID, mode: 'daily', accuracyPct: 105 }).error, 'invalid_telemetry_bounds');

    const parsed = parseIntegritySignalBody({
        sessionId: SAMPLE_UUID,
        mode: 'Daily',
        tabBlurCount: 4,
        copyAttemptCount: 1,
        pasteAttemptCount: 0,
        avgAnswerMs: 4200,
        minAnswerMs: 2100,
        fastCorrectCount: 0,
        accuracyPct: 90,
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.mode, 'daily');

    const cleanRisk = computeIntegrityRisk({ tabBlurCount: 0, copyAttemptCount: 0, pasteAttemptCount: 0, avgAnswerMs: 5500, minAnswerMs: 2200, fastCorrectCount: 0, accuracyPct: 70 });
    assert.deepEqual(cleanRisk, { riskScore: 0, riskFlags: [] });

    const flagged = computeIntegrityRisk(parsed.value);
    assert.equal(flagged.riskScore, 80);
    assert.deepEqual(flagged.riskFlags, ['excessive_tab_blurs', 'copy_paste_detected', 'high_accuracy_with_blur']);

    const speedBot = computeIntegrityRisk({ tabBlurCount: 6, copyAttemptCount: 2, pasteAttemptCount: 2, minAnswerMs: 250, avgAnswerMs: 800, fastCorrectCount: 5, accuracyPct: 100 });
    assert.equal(speedBot.riskScore, 100);
    assert.deepEqual(speedBot.riskFlags, [
        'excessive_tab_blurs',
        'copy_paste_detected',
        'inhuman_answer_speed',
        'high_accuracy_with_blur',
    ]);

    assert.equal(sanitizeDisplayName({ display_name: '  Ace Grinder  ' }), 'Ace Grinder');
    assert.equal(sanitizeDisplayName({ username: 'river_shark' }), 'river_shark');
    assert.equal(sanitizeDisplayName({}), 'Player');
});

test('integrity-signal, pvp/ratings, and admin/trivia-integrity enforce auth, rate limits, and RBAC', () => {
    // /api/trivia/integrity-signal
    assert.match(integrityRoute, /supabaseServerClient/);
    assert.doesNotMatch(integrityRoute, /from\s+['"]@supabase\/supabase-js['"]/);
    assert.match(integrityRoute, /applyRateLimit\(req,\s*res,\s*LIMITS\.write\)/);
    assert.match(integrityRoute, /getServerUserWithFallback\(req,\s*sb\)/);
    assert.match(integrityRoute, /parseIntegritySignalBody\(req\.body\)/);
    assert.match(integrityRoute, /rpc\('trivia_record_integrity_signal_v1'/);
    assert.doesNotMatch(integrityRoute, /risk_score|risk_flags/);

    // /api/trivia/pvp/ratings
    assert.match(ratingsRoute, /supabaseServerClient/);
    assert.doesNotMatch(ratingsRoute, /from\s+['"]@supabase\/supabase-js['"]/);
    assert.match(ratingsRoute, /LIMITS\.read/);
    assert.match(ratingsRoute, /from\('trivia_pvp_ratings'\)/);
    assert.match(ratingsRoute, /profile\?\.is_horse === true/);
    assert.match(ratingsRoute, /getServerUserWithFallback\(req,\s*sb\)/);

    // /api/admin/trivia-integrity
    assert.match(adminIntegrityRoute, /supabaseServerClient/);
    assert.doesNotMatch(adminIntegrityRoute, /from\s+['"]@supabase\/supabase-js['"]/);
    assert.match(adminIntegrityRoute, /applyRateLimit\(req,\s*res,\s*LIMITS\.read\)/);
    assert.match(adminIntegrityRoute, /async function requireTriviaOperator/);
    assert.match(adminIntegrityRoute, /authorization\?\.startsWith\('Bearer '\)/);
    assert.match(adminIntegrityRoute, /rpc\('trivia_operator_context_v1'/);
    assert.match(adminIntegrityRoute, /normalizeOperatorContext\(data\)/);
    assert.match(adminIntegrityRoute, /trivia_operator_required/);
    assert.match(adminIntegrityRoute, /rpc\('trivia_integrity_review_queue_v1'/);
    assert.doesNotMatch(adminIntegrityRoute, /trivia_questions|correct_index/);

    // Non-blocking Elo hook on settled PvP matches
    assert.match(pvpApiHandler, /rpc\('trivia_pvp_update_rating_v1'/);
    assert.match(pvpSettleRoute, /rpc\('trivia_pvp_update_rating_v1'/);
});

test('integrity telemetry hook and PvP Elo UI are wired cleanly into gameplay and leaderboard surfaces', () => {
    assert.match(telemetryHook, /visibilitychange/);
    assert.match(telemetryHook, /addEventListener\('copy'/);
    assert.match(telemetryHook, /addEventListener\('paste'/);
    assert.match(telemetryHook, /\/api\/trivia\/integrity-signal/);
    assert.match(telemetryHook, /keepalive:\s*true/);

    assert.match(serverGradedRun, /import useTriviaIntegrityTelemetry from '\.\/useTriviaIntegrityTelemetry'/);
    assert.match(serverGradedRun, /integrityTelemetry\.resetTelemetry\(\)/);
    assert.match(serverGradedRun, /integrityTelemetry\.recordAnswerTiming/);
    assert.match(serverGradedRun, /integrityTelemetry\.flushTelemetry\(id,\s*mode,\s*accuracyPct\)/);

    // Telemetry is owned exclusively by useServerGradedRun inside PvpCompetitiveExperience;
    // pages/hub/trivia/pvp.js must not mount an orphaned duplicate hook.
    assert.doesNotMatch(pvpPage, /useTriviaIntegrityTelemetry/);
    assert.match(pvpExperience, /useServerGradedRun/);
    assert.match(pvpPage, /\/api\/trivia\/pvp\/ratings\?limit=1/);
    assert.match(pvpPage, /PvpEloHeaderBadge/);
    assert.match(pvpPage, /Ranked PvP Elo/);
    assert.match(pvpExperience, /onMatchActiveChange/);
    assert.match(pvpExperience, /onMatchSettled/);

    assert.match(leaderboardPage, /const PVP_ELO_BOARD = 'pvp_elo'/);
    assert.match(leaderboardPage, /\/api\/trivia\/pvp\/ratings\?limit=100/);
    assert.match(leaderboardPage, /PvP Elo Ratings/);
    assert.match(leaderboardPage, /PvpEloRankDock/);
    assert.match(leaderboardPage, /Your PvP Elo/);
});
