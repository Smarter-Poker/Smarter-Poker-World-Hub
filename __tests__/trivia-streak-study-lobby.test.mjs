import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    STREAK_FREEZE_COST_DIAMONDS,
    STREAK_FREEZE_MAX_QUANTITY,
    STREAK_FREEZE_REQUEST_KEY_RE,
    STREAK_MILESTONES,
    computeStreakMilestoneProgress,
    createStreakFreezeRequestKey,
    normalizeStreakFreezePayload,
} from '../src/lib/trivia/streakMilestoneModel.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('streak milestone progression tracks 7, 14, 30, and 100 day thresholds accurately', () => {
    assert.deepEqual([...STREAK_MILESTONES], [7, 14, 30, 100]);
    assert.equal(STREAK_FREEZE_COST_DIAMONDS, 25);
    assert.equal(STREAK_FREEZE_MAX_QUANTITY, 5);

    const zero = computeStreakMilestoneProgress(0);
    assert.equal(zero.nextMilestone, 7);
    assert.equal(zero.daysRemaining, 7);
    assert.equal(zero.progressPct, 0);
    assert.deepEqual(zero.reachedMilestones, []);
    assert.equal(zero.allMilestonesReached, false);

    const day5 = computeStreakMilestoneProgress(5);
    assert.equal(day5.nextMilestone, 7);
    assert.equal(day5.daysRemaining, 2);
    assert.equal(day5.progressPct, 71);

    const day7 = computeStreakMilestoneProgress(7);
    assert.equal(day7.previousMilestone, 7);
    assert.equal(day7.nextMilestone, 14);
    assert.equal(day7.daysRemaining, 7);
    assert.equal(day7.progressPct, 50);
    assert.deepEqual(day7.reachedMilestones, [7]);

    const day14 = computeStreakMilestoneProgress(14);
    assert.equal(day14.previousMilestone, 14);
    assert.equal(day14.nextMilestone, 30);
    assert.equal(day14.daysRemaining, 16);
    assert.deepEqual(day14.reachedMilestones, [7, 14]);

    const day30 = computeStreakMilestoneProgress(30);
    assert.equal(day30.previousMilestone, 30);
    assert.equal(day30.nextMilestone, 100);
    assert.equal(day30.daysRemaining, 70);
    assert.equal(day30.progressPct, 30);
    assert.deepEqual(day30.reachedMilestones, [7, 14, 30]);

    const day100 = computeStreakMilestoneProgress(100);
    assert.equal(day100.nextMilestone, null);
    assert.equal(day100.daysRemaining, 0);
    assert.equal(day100.progressPct, 100);
    assert.equal(day100.allMilestonesReached, true);
    assert.deepEqual(day100.reachedMilestones, [7, 14, 30, 100]);

    const invalid = computeStreakMilestoneProgress(-12);
    assert.equal(invalid.currentStreak, 0);
    assert.equal(invalid.nextMilestone, 7);
});

test('streak freeze idempotency key generator produces valid keys with crypto.randomUUID and fallback', () => {
    const uuidKey = createStreakFreezeRequestKey({
        randomUUID: () => '11111111-2222-4333-8444-555555555555',
    });
    assert.equal(uuidKey, 'sf_11111111-2222-4333-8444-555555555555');
    assert.match(uuidKey, STREAK_FREEZE_REQUEST_KEY_RE);

    const fallbackKey = createStreakFreezeRequestKey(null);
    assert.match(fallbackKey, STREAK_FREEZE_REQUEST_KEY_RE);

    const normalized = normalizeStreakFreezePayload({
        itemType: 'streak_shield',
        quantity: 2,
        maxQuantity: 5,
        costDiamonds: 25,
        balance: 140,
        currentStreak: 9,
        bestStreak: 18,
        diamondsCharged: 25,
        referenceId: 'trivia_streak_freeze:user:sf_12345678',
        journalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    assert.equal(normalized.quantity, 2);
    assert.equal(normalized.maxQuantity, 5);
    assert.equal(normalized.costDiamonds, 25);
    assert.equal(normalized.balance, 140);
    assert.equal(normalized.currentStreak, 9);
    assert.equal(normalized.referenceId, 'trivia_streak_freeze:user:sf_12345678');
    assert.equal(normalized.journalId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
});

test('GET and POST /api/trivia/streak-freeze enforce auth, rate limiting, live inventory reads, and idempotent purchase', () => {
    const api = read('pages/api/trivia/streak-freeze.js');
    assert.match(api, /res\.setHeader\('Allow', 'GET, POST'\)/);
    assert.match(api, /res\.setHeader\('Cache-Control', 'private, no-store, max-age=0'\)/);
    assert.match(api, /req\.method === 'GET' \? LIMITS\.read : LIMITS\.write/);
    assert.match(api, /getServerUserWithFallback/);
    assert.match(api, /status\(401\)/);
    assert.match(api, /if \(req\.method === 'GET'\)/);
    assert.match(api, /\.from\('trivia_user_items'\)/);
    assert.match(api, /\.from\('trivia_streaks'\)/);
    assert.match(api, /\.from\('profiles'\)/);
    assert.match(api, /trivia_streak_freeze_purchase_v1/);
    assert.match(api, /insufficient_diamonds[\s\S]{0,60}402/);
    assert.match(api, /max_streak_freezes_reached[\s\S]{0,60}409/);
    assert.doesNotMatch(api, /from ['"]@supabase\/supabase-js['"]/);
});

test('StreakFreezeWidget implements confirmation, idempotent requestKey, ledger receipts, and console laws', () => {
    const widget = read('src/components/trivia/StreakFreezeWidget.jsx');
    const css = read('src/components/trivia/StreakFreezeWidget.module.css');

    assert.match(widget, /authedFetch\('\/api\/trivia\/streak-freeze'/);
    assert.match(widget, /method: 'GET'/);
    assert.match(widget, /method: 'POST'/);
    assert.match(widget, /createStreakFreezeRequestKey/);
    assert.match(widget, /body: JSON\.stringify\(\{ requestKey: activeKey \}\)/);
    assert.match(widget, /Buy Streak Freeze/);
    assert.match(widget, /Confirm Purchase/);
    assert.match(widget, /Cancel/);
    assert.match(widget, /role="progressbar"/);
    assert.match(widget, /STREAK_MILESTONES\.map/);
    assert.match(widget, /data-preserve-case="true">\{receipt\.referenceId\}/);
    assert.match(widget, /insufficient_diamonds/);
    assert.match(widget, /max_streak_freezes_reached/);
    assert.doesNotMatch(widget, /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover/);
    assert.doesNotMatch(widget, /[—–]/, 'StreakFreezeWidget contains no em-dashes');
    assert.doesNotMatch(widget, /<span[^>]+aria-label=/, 'StreakFreezeWidget avoids prohibited span aria-labels');
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /:hover/);

    const dailyBroadcast = read('src/components/trivia/daily/DailyTriviaBroadcast.jsx');
    assert.match(dailyBroadcast, /import StreakFreezeWidget from '\.\.\/StreakFreezeWidget'/);
    assert.match(dailyBroadcast, /<StreakFreezeWidget/);

    const achievementsPage = read('pages/hub/trivia/achievements.js');
    assert.match(achievementsPage, /import StreakFreezeWidget from '\.\.\/\.\.\/\.\.\/src\/components\/trivia\/StreakFreezeWidget'/);
    assert.match(achievementsPage, /<StreakFreezeWidget/);
});

test('ShareResultCardModal and PostSettlementReviewDrawer are wired across TriviaResult and Phase9SettlementReceipt', () => {
    const triviaResult = read('src/components/trivia/TriviaResult.jsx');
    assert.match(triviaResult, /ShareResultCardModal/);
    assert.match(triviaResult, /PostSettlementReviewDrawer/);
    assert.match(triviaResult, /Share Result Card/);
    assert.match(triviaResult, /Review Answers/);
    assert.match(triviaResult, /canOpenSettledReview = Boolean\(sessionId && settled !== false\)/);

    const phase9Receipt = read('src/components/trivia/phase9/Phase9SettlementReceipt.jsx');
    assert.match(phase9Receipt, /import ShareResultCardModal from '\.\.\/ShareResultCardModal'/);
    assert.match(phase9Receipt, /import PostSettlementReviewDrawer from '\.\.\/PostSettlementReviewDrawer'/);
    assert.match(phase9Receipt, /Share Result Card/);
    assert.match(phase9Receipt, /Review Answers/);
    assert.match(phase9Receipt, /isSettled = Boolean\(/);
    assert.match(phase9Receipt, /<ShareResultCardModal/);
    assert.match(phase9Receipt, /<PostSettlementReviewDrawer/);
    assert.doesNotMatch(phase9Receipt, /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover|[—–]/);

    for (const soloPage of ['endless', 'mixed', 'survival-game', 'time-attack']) {
        const src = read(`pages/hub/trivia/${soloPage}.js`);
        assert.match(src, /<Phase9SettlementReceipt/, `${soloPage} renders Phase9SettlementReceipt`);
    }
});

test('TriviaLobby quick-access utility bar wires Study Your Misses and non-blocking account-isolated PvP Elo pill', () => {
    const lobby = read('src/components/trivia/TriviaLobby.jsx');

    assert.match(lobby, /import Link from 'next\/link'/);
    assert.match(lobby, /import \{ authedFetch \} from '\.\.\/\.\.\/lib\/authUtils'/);
    assert.match(lobby, /href="\/hub\/trivia\/study"/);
    assert.match(lobby, /Study Your Misses/);
    assert.match(lobby, /\/api\/trivia\/pvp\/ratings\?limit=1/);
    assert.match(lobby, /setPvpEloBadge\(null\)/);
    assert.match(lobby, /authState !== 'authenticated' \|\| !accountKey/);
    assert.match(lobby, /controller\.abort\(\)/);
    assert.match(lobby, /PvP Elo \{pvpEloBadge\.elo/);
    assert.doesNotMatch(lobby, /:hover|whileHover|onMouseEnter|onMouseOver|lucide-react/);

    const masthead = lobby.indexOf('lobby-masthead');
    const utility = lobby.indexOf('className="lobby-utility-bar"');
    const catalogue = lobby.indexOf('className="modes-section"');
    const quickStakes = lobby.indexOf('quick-stakes-card');
    const briefing = lobby.indexOf('<CompetitiveLobbyBriefing');
    assert.ok(
        masthead >= 0 && masthead < utility && utility < catalogue && catalogue < quickStakes && quickStakes < briefing,
        'lobby utility bar sits cleanly below the #SMARTERDESIGN masthead ahead of modes, Quick Stakes, and Competitive briefing',
    );
});
