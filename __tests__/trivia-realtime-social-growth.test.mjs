import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    DEFAULT_TRAINING_SPOT,
    TRAINING_SPOT_BY_CATEGORY,
    VALID_CHALLENGE_STAKES,
    buildResultCardSvg,
    buildWordleShareText,
    computeTriviaGrade,
    escapeSvgText,
    normalizeGridString,
    resolveTrainingSpotForCategory,
} from '../src/lib/trivia/socialGrowthHelpers.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION_FILE = 'supabase/migrations/20261124142600_trivia_friend_challenges_reminders_seasons.sql';

test('Track 3 migration defines tables, RLS, strict service_role ACLs, and forward rollback', () => {
    const sql = read(MIGRATION_FILE);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_friend_challenges/);
    assert.match(sql, /CHECK \(stake_amount IN \(10, 25, 50, 100\)\)/);
    assert.match(sql, /CHECK \(status IN \('open', 'accepted', 'cancelled', 'expired'\)\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_friend_challenges ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_friend_challenges FROM PUBLIC, anon, authenticated, service_role;/);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_nightly_reminders/);
    assert.match(sql, /UNIQUE \(user_id, tournament_id\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_nightly_reminders ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_nightly_reminders FROM PUBLIC, anon, authenticated, service_role;/);

    for (const fn of [
        'trivia_friend_challenge_create_v1',
        'trivia_friend_challenge_get_v1',
        'trivia_friend_challenge_list_v1',
        'trivia_friend_challenge_cancel_v1',
        'trivia_friend_challenge_accept_v1',
        'trivia_nightly_reminder_status_v1',
        'trivia_nightly_reminder_toggle_v1',
        'trivia_monthly_championship_standings_v1',
        'trivia_post_settlement_review_v1',
        'trivia_streak_freeze_purchase_v1',
    ]) {
        assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn} created`);
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), `${fn} browser EXECUTE revoked`);
        assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`), `${fn} granted to service_role`);
    }

    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
});

test('post-settlement review RPC strictly refuses active sessions, active PvP matches, and unresolved tournament rounds', () => {
    const sql = read(MIGRATION_FILE);
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_post_settlement_review_v1');
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_streak_freeze_purchase_v1', start);
    assert.ok(start > 0 && end > start);
    const body = sql.slice(start, end);

    assert.match(body, /v_session\.user_id IS DISTINCT FROM p_user_id/);
    assert.match(body, /v_session\.status NOT IN \('submitted', 'completed', 'expired'\)/);
    assert.match(body, /public\.trivia_pvp_session_links/);
    assert.match(body, /public\.trivia_tournament_seats/);
    assert.match(body, /mu\.status IS DISTINCT FROM 'resolved'/);
    const refusalMatches = body.match(/review_not_available_before_settlement/g) || [];
    assert.ok(refusalMatches.length >= 3, 'blocks active solo, PvP, and tournament sessions before settlement');
});

test('friend challenge accept RPC refuses self-challenge, expires stale invites, and returns PvP handoff', () => {
    const sql = read(MIGRATION_FILE);
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_friend_challenge_accept_v1');
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_nightly_reminder_status_v1', start);
    assert.ok(start > 0 && end > start);
    const body = sql.slice(start, end);

    assert.match(body, /v_row\.challenger_id = p_user_id[\s\S]{0,120}cannot_accept_own_challenge/);
    assert.match(body, /v_row\.expires_at <= now\(\)[\s\S]{0,260}challenge_expired/);
    assert.match(body, /SET status = 'accepted'/);
    assert.match(body, /'pvpHandoff'/);
    assert.match(body, /\/api\/trivia\/pvp\/quote/);
    assert.match(body, /\/api\/trivia\/pvp\/join/);
});

test('monthly championship standings RPC aggregates settled public_nightly events in America/Chicago with human-only default', () => {
    const sql = read(MIGRATION_FILE);
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_monthly_championship_standings_v1');
    const end = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_post_settlement_review_v1', start);
    assert.ok(start > 0 && end > start);
    const body = sql.slice(start, end);

    assert.match(body, /p_include_horses boolean DEFAULT false/);
    assert.match(body, /America\/Chicago/);
    assert.match(body, /t\.schedule_kind = 'public_nightly'/);
    assert.match(body, /t\.lifecycle_state = 'settled'/);
    assert.match(body, /WHEN r\.final_rank = 1 THEN 100/);
    assert.match(body, /WHEN r\.final_rank = 2 THEN 75/);
    assert.match(body, /WHEN r\.final_rank IN \(3, 4\) THEN 50/);
    assert.match(body, /WHEN r\.final_rank BETWEEN 5 AND 8 THEN 30/);
    assert.match(body, /WHEN r\.final_rank BETWEEN 9 AND 16 THEN 15/);
    assert.match(body, /WHEN r\.payout > 0 THEN 10/);
    assert.match(body, /ELSE 5/);
    assert.match(body, /v_include_horses IS TRUE OR r\.participant_kind = 'human'/);
});

test('streak freeze purchase RPC debits 25 diamonds idempotently via Phase 2 ledger and grants streak_shield', () => {
    const sql = read(MIGRATION_FILE);
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_streak_freeze_purchase_v1');
    const end = sql.indexOf('-- 9. Strict ACL lockdown', start);
    assert.ok(start > 0 && end > start);
    const body = sql.slice(start, end);

    assert.match(body, /FREEZE_COST constant integer := 25;/);
    assert.match(body, /ITEM_KEY constant text := 'streak_shield';/);
    assert.match(body, /public\.trivia_ledger_switch_enabled\('solo_journal'\)/);
    assert.match(body, /public\.trivia_ledger_debit\(/);
    assert.match(body, /INSERT INTO public\.trivia_user_items/);
    assert.match(body, /INSERT INTO public\.trivia_item_transactions/);
    const replayIdx = body.indexOf("FROM public.trivia_item_transactions");
    const capIdx = body.indexOf('max_streak_freezes_reached');
    assert.ok(replayIdx > 0 && capIdx > replayIdx, 'idempotent replay executes before cap refusal');
});

test('all six Track 3 API routes enforce supabaseServerClient, rate limiting, and auth boundaries', () => {
    const routes = [
        { path: 'pages/api/trivia/challenges.js', requiresAuth: true, rpc: 'trivia_friend_challenge_' },
        { path: 'pages/api/trivia/nightly-reminder.js', requiresAuth: true, rpc: 'trivia_nightly_reminder_' },
        { path: 'pages/api/trivia/session-review.js', requiresAuth: true, rpc: 'trivia_post_settlement_review_v1' },
        { path: 'pages/api/trivia/championship.js', requiresAuth: false, rpc: 'trivia_monthly_championship_standings_v1' },
        { path: 'pages/api/trivia/streak-freeze.js', requiresAuth: true, rpc: 'trivia_streak_freeze_purchase_v1' },
        { path: 'pages/api/trivia/og-result-card.js', requiresAuth: false, rpc: null },
    ];

    for (const route of routes) {
        const src = read(route.path);
        assert.doesNotMatch(src, /from ['"]@supabase\/supabase-js['"]/, `${route.path} never imports raw @supabase/supabase-js`);
        assert.match(src, /applyRateLimit\(/, `${route.path} applies rate limiting`);
        if (route.rpc) {
            assert.match(src, /supabaseServerClient/, `${route.path} uses supabaseServerClient`);
            assert.match(src, new RegExp(route.rpc), `${route.path} invokes ${route.rpc}`);
        }
        if (route.requiresAuth) {
            assert.match(src, /getServerUserWithFallback/, `${route.path} authenticates with getServerUserWithFallback`);
            assert.match(src, /status\(401\)/, `${route.path} refuses unauthenticated requests with 401`);
        }
    }

    const reviewRoute = read('pages/api/trivia/session-review.js');
    assert.match(reviewRoute, /review_not_available_before_settlement[\s\S]{0,60}409/);
    assert.match(reviewRoute, /Cache-Control', 'private, no-store, max-age=0'/);

    const ogRoute = read('pages/api/trivia/og-result-card.js');
    assert.match(ogRoute, /image\/svg\+xml/);
    assert.match(ogRoute, /X-Content-Type-Options', 'nosniff'/);
    assert.match(ogRoute, /Content-Security-Policy/);
});

test('OG result card SVG safely escapes XML injection and Wordle share grid avoids em-dashes', () => {
    assert.deepEqual([...VALID_CHALLENGE_STAKES], [10, 25, 50, 100]);
    assert.equal(escapeSvgText('<script>alert("x")</script> & \'test\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
    assert.equal(computeTriviaGrade(10, 10).letter, 'S');
    assert.equal(computeTriviaGrade(9, 10).letter, 'A');
    assert.equal(computeTriviaGrade(5, 10).letter, 'F');
    assert.equal(normalizeGridString('ccwsx123', 2, 4), 'CCWS');
    assert.equal(normalizeGridString('', 3, 5), 'CCCWW');

    const svg = buildResultCardSvg({
        mode: 'daily',
        score: 10,
        total: 10,
        diamonds: 35,
        streak: 14,
        player: '<img src=x onerror="alert(1)">',
        grid: 'CCCCCCCCCC',
    });
    assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\s*<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.doesNotMatch(svg, /<img\b/i, 'raw HTML tags never survive escaping');
    assert.match(svg, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.match(svg, /10 \/ 10/);
    assert.match(svg, /\+35 Diamonds/);

    const shareText = buildWordleShareText({
        mode: 'daily',
        score: 8,
        total: 10,
        diamonds: 20,
        streak: 4,
        grid: 'CCCCWWCCCC',
    });
    assert.match(shareText, /Daily Trivia/);
    assert.match(shareText, /8\/10 Correct \(80%\)/);
    assert.match(shareText, /\[\+\]/);
    assert.match(shareText, /\[x\]/);
    assert.doesNotMatch(shareText, /[—–]/, 'share text never uses em-dashes');
});

test('every Train This Spot mapping targets an existing pages/hub/training route', () => {
    const allSpots = [DEFAULT_TRAINING_SPOT, ...Object.values(TRAINING_SPOT_BY_CATEGORY)];
    for (const spot of allSpots) {
        assert.match(spot.href, /^\/hub\/training\/[a-z0-9-]+$/);
        const relPage = `pages${spot.href}.js`;
        assert.equal(existsSync(join(ROOT, relPage)), true, `${relPage} must exist for ${spot.href}`);
    }
    assert.equal(resolveTrainingSpotForCategory('icm_chip_ev').href, '/hub/training/icm-calculator');
    assert.equal(resolveTrainingSpotForCategory('unknown_cat').href, DEFAULT_TRAINING_SPOT.href);
});

test('Realtime sync hook, Track 3 UI components, and tournament/result wiring follow console laws', () => {
    const hook = read('src/hooks/useTriviaRealtimeSync.js');
    assert.match(hook, /supabase\.channel\(/);
    assert.match(hook, /SUBSCRIBED/);
    assert.match(hook, /effectivePollMs/);
    assert.match(hook, /removeChannel/);

    const uiFiles = [
        'src/components/trivia/ShareResultCardModal.jsx',
        'src/components/trivia/PostSettlementReviewDrawer.jsx',
        'src/components/trivia/FriendChallengePanel.jsx',
        'src/components/trivia/NightlyReminderButton.jsx',
        'src/components/trivia/NightlySpectatorBanner.jsx',
        'src/components/trivia/MonthlyChampionshipPanel.jsx',
    ];
    for (const rel of uiFiles) {
        const src = read(rel);
        assert.doesNotMatch(src, /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover/, `${rel} obeys console laws`);
        assert.doesNotMatch(src, /[—–]/, `${rel} contains no em-dashes`);
    }

    const reviewDrawer = read('src/components/trivia/PostSettlementReviewDrawer.jsx');
    assert.match(reviewDrawer, /\/api\/trivia\/session-review\?sessionId=/);
    assert.match(reviewDrawer, /review_not_available_before_settlement/);
    assert.match(reviewDrawer, /Train This Spot/);

    const tournamentsPage = read('pages/hub/trivia/tournaments.js');
    assert.match(tournamentsPage, /useTriviaRealtimeSync/);
    assert.match(tournamentsPage, /NightlyReminderButton/);
    assert.match(tournamentsPage, /NightlySpectatorBanner/);
    assert.match(tournamentsPage, /MonthlyChampionshipPanel/);
    assert.match(tournamentsPage, /FriendChallengePanel/);
    assert.match(tournamentsPage, /ShareResultCardModal/);
    assert.match(tournamentsPage, /PostSettlementReviewDrawer/);

    const triviaResult = read('src/components/trivia/TriviaResult.jsx');
    assert.match(triviaResult, /ShareResultCardModal/);
    assert.match(triviaResult, /PostSettlementReviewDrawer/);
});
