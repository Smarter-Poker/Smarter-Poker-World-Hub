import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    STREAK_FREEZE_REQUEST_KEY_RE,
    STREAK_MILESTONES,
    STREAK_MILESTONE_REWARDS,
    computeClaimableMilestones,
    createStreakMilestoneRequestKey,
    normalizeStreakFreezePayload,
} from '../src/lib/trivia/streakMilestoneModel.mjs';
import {
    buildResultCardSvg,
    isValidTriviaUuid,
} from '../src/lib/trivia/socialGrowthHelpers.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION_FILE = 'supabase/migrations/20261124201000_trivia_streak_consumption_milestones_championship.sql';

test('Track 2 additive migration defines consumption, milestone claims, championship awards, strict ACLs, and forward rollback', () => {
    const sql = read(MIGRATION_FILE);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_streak_freeze_consumptions/);
    assert.match(sql, /UNIQUE \(user_id, missed_date\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_streak_freeze_consumptions ENABLE ROW LEVEL SECURITY;/);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_streak_milestone_claims/);
    assert.match(sql, /CHECK \(milestone_days IN \(7, 14, 30, 100\)\)/);
    assert.match(sql, /UNIQUE \(user_id, milestone_days\)/);
    assert.match(sql, /reference_id text NOT NULL UNIQUE/);
    assert.match(sql, /ALTER TABLE public\.trivia_streak_milestone_claims ENABLE ROW LEVEL SECURITY;/);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_championship_awards/);
    assert.match(sql, /CHECK \(badge_code IN \('monthly_champion', 'top_3_finisher', 'top_20_qualifier'\)\)/);
    assert.match(sql, /UNIQUE \(season_month, user_id\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_championship_awards ENABLE ROW LEVEL SECURITY;/);

    // Zero ALTER TABLE on live gameplay tables (only ENABLE ROW LEVEL SECURITY on our 3 new tables)
    const sqlNoComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const alterStatements = sqlNoComments.match(/ALTER TABLE\s+[^\n;]+/g) || [];
    assert.equal(alterStatements.length, 3, 'Exactly 3 RLS enablement ALTER TABLE statements');
    for (const stmt of alterStatements) {
        assert.match(
            stmt,
            /ALTER TABLE public\.(trivia_streak_freeze_consumptions|trivia_streak_milestone_claims|trivia_championship_awards) ENABLE ROW LEVEL SECURITY/,
            `Only additive RLS enablement allowed: ${stmt}`,
        );
    }

    for (const fn of [
        'trivia_streak_apply_daily_v1',
        'trivia_streak_claim_milestone_v1',
        'trivia_championship_finalize_month_v1',
        'trivia_championship_event_status_v1',
    ]) {
        assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn} defined`);
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]{0,60}FROM PUBLIC, anon, authenticated;`), `${fn} browser EXECUTE revoked`);
        assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)[\\s\\S]{0,60}TO postgres, service_role;`), `${fn} granted to postgres, service_role`);
    }

    assert.match(sql, /public\.trivia_ledger_switch_enabled\('solo_journal'\)/);
    assert.match(sql, /public\.trivia_ledger_payout\(/);
    assert.match(sql, /WHEN 7 THEN 25[\s\S]*WHEN 14 THEN 50[\s\S]*WHEN 30 THEN 150[\s\S]*WHEN 100 THEN 500/);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
});

test('streak milestone claim helpers compute exact rewards, claimable tiers, and valid idempotency keys', () => {
    assert.deepEqual([...STREAK_MILESTONES], [7, 14, 30, 100]);
    assert.deepEqual({ ...STREAK_MILESTONE_REWARDS }, { 7: 25, 14: 50, 30: 150, 100: 500 });

    assert.deepEqual(computeClaimableMilestones(6, []), []);
    assert.deepEqual(computeClaimableMilestones(7, []), [7]);
    assert.deepEqual(computeClaimableMilestones(30, [{ milestoneDays: 7 }]), [14, 30]);
    assert.deepEqual(computeClaimableMilestones(100, [7, 14, 30, 100]), []);

    const key = createStreakMilestoneRequestKey(30, {
        randomUUID: () => '11111111-2222-4333-8444-555555555555',
    });
    assert.equal(key, 'ms_30_11111111-2222-4333-8444-555555555555');
    assert.match(key, STREAK_FREEZE_REQUEST_KEY_RE);

    const normalized = normalizeStreakFreezePayload({
        quantity: 1,
        maxQuantity: 5,
        costDiamonds: 25,
        balance: 175,
        currentStreak: 15,
        bestStreak: 15,
        claimedMilestones: [
            {
                milestoneDays: 7,
                rewardDiamonds: 25,
                journalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                referenceId: 'trivia_streak_milestone:u1:7',
                claimedAt: '2026-11-24T20:00:00Z',
            },
        ],
        lastFreezeConsumedDate: '2026-11-22',
    });
    assert.equal(normalized.claimedMilestones.length, 1);
    assert.equal(normalized.claimedMilestones[0].milestoneDays, 7);
    assert.deepEqual(normalized.claimableMilestones, [14]);
    assert.equal(normalized.lastFreezeConsumedDate, '2026-11-22');
});

test('streak-freeze API and StreakFreezeWidget support GET milestone/consumption fields and idempotent claim_milestone POST', () => {
    const api = read('pages/api/trivia/streak-freeze.js');
    assert.match(api, /\.from\('trivia_streak_milestone_claims'\)/);
    assert.match(api, /\.from\('trivia_streak_freeze_consumptions'\)/);
    assert.match(api, /claimedMilestones/);
    assert.match(api, /claimableMilestones/);
    assert.match(api, /lastFreezeConsumedDate/);
    assert.match(api, /action === 'claim_milestone'/);
    assert.match(api, /trivia_streak_claim_milestone_v1/);
    assert.match(api, /milestone_not_reached[\s\S]{0,60}409/);

    const widget = read('src/components/trivia/StreakFreezeWidget.jsx');
    assert.match(widget, /Claim Milestone Reward/);
    assert.match(widget, /action: 'claim_milestone'/);
    assert.match(widget, /createStreakMilestoneRequestKey/);
    assert.match(widget, /claimReceipt\.referenceId/);
    assert.match(widget, /claimReceipt\.journalId/);
    assert.match(widget, /lastFreezeConsumedDate/);
    assert.doesNotMatch(widget, /[—–]/, 'StreakFreezeWidget has zero em-dashes');
});

test('championship API and MonthlyChampionshipPanel surface permanent badges and End-Of-Month Championship Event status', () => {
    const api = read('pages/api/trivia/championship.js');
    assert.match(api, /trivia_monthly_championship_standings_v1/);
    assert.match(api, /trivia_championship_event_status_v1/);
    assert.match(api, /eventStatus/);
    assert.match(api, /awards/);
    assert.match(api, /Cache-Control', 'private, no-store, max-age=0'/);
    assert.match(api, /Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60'/);

    const panel = read('src/components/trivia/MonthlyChampionshipPanel.jsx');
    assert.match(panel, /End-Of-Month Championship Event/);
    assert.match(panel, /Permanent Championship Badges/);
    assert.match(panel, /Top \{qualifierCutoff\} Human Finishers Qualify/);
    assert.match(panel, /Monthly Trivia Champion/);
    assert.doesNotMatch(panel, /[—–]/, 'MonthlyChampionshipPanel has zero em-dashes');
});

test('OG result cards distinguish DB-verified VERIFIED RESULT seals from unverified SAMPLE PREVIEW cards', () => {
    assert.equal(isValidTriviaUuid('38a7fb20-13aa-450e-866c-2a9703271ccb'), true);
    assert.equal(isValidTriviaUuid('not-a-uuid'), false);
    assert.equal(isValidTriviaUuid(''), false);

    const verifiedSvg = buildResultCardSvg({
        mode: 'daily',
        score: 3,
        total: 10,
        diamonds: 0,
        streak: 1,
        player: 'Canary',
        verified: true,
        verificationId: '38a7fb20',
    });
    assert.match(verifiedSvg, /VERIFIED RESULT/);
    assert.doesNotMatch(verifiedSvg, /SAMPLE PREVIEW/);
    assert.match(verifiedSvg, /3 \/ 10/);

    const sampleSvg = buildResultCardSvg({
        mode: 'daily',
        score: 10,
        total: 10,
        diamonds: 500,
        streak: 99,
        player: 'Spoofer',
        verified: false,
    });
    assert.match(sampleSvg, /SAMPLE PREVIEW \| UNVERIFIED/);
    assert.doesNotMatch(sampleSvg, /VERIFIED RESULT/);

    // Default (verified omitted) MUST NEVER claim VERIFIED RESULT
    const defaultSvg = buildResultCardSvg({ mode: 'daily', score: 10, total: 10 });
    assert.match(defaultSvg, /SAMPLE PREVIEW \| UNVERIFIED/);
    assert.doesNotMatch(defaultSvg, /VERIFIED RESULT/);

    const ogRoute = read('pages/api/trivia/og-result-card.js');
    assert.match(ogRoute, /from\('trivia_sessions'\)/);
    assert.match(ogRoute, /\.eq\('status', 'submitted'\)/);
    assert.match(ogRoute, /from\('trivia_pvp_matches'\)/);
    assert.match(ogRoute, /\.in\('status', \['complete', 'completed'\]\)/);
    assert.match(ogRoute, /verified: true/);
    assert.match(ogRoute, /verified: false/);
    assert.match(ogRoute, /select\('display_name, username'\)/);
    assert.doesNotMatch(ogRoute, /full_name/, 'OG route never selects legal full_name');
    assert.doesNotMatch(ogRoute, /from ['"]@supabase\/supabase-js['"]/);

    const modal = read('src/components/trivia/ShareResultCardModal.jsx');
    assert.match(modal, /sessionId = null/);
    assert.match(modal, /matchId = null/);
    assert.match(modal, /\/api\/trivia\/og-result-card\?sessionId=/);
    assert.match(modal, /\/api\/trivia\/og-result-card\?matchId=/);
    assert.match(modal, /Copy Card Link/);
    assert.doesNotMatch(modal, /[—–]/, 'ShareResultCardModal has zero em-dashes');

    // Callers pass authoritative IDs when available
    assert.match(read('src/components/trivia/TriviaResult.jsx'), /sessionId=\{settled !== false \? sessionId : null\}/);
    assert.match(read('src/components/trivia/phase9/Phase9SettlementReceipt.jsx'), /sessionId=\{sessionId\}/);
    assert.match(read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx'), /matchId=\{effectiveShareMatch\?\.id/);
});
