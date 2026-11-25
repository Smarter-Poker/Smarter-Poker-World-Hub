import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pvpPage = read('pages/hub/trivia/pvp.js');
const pvpExperience = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
const challengesApi = read('pages/api/trivia/challenges.js');
const friendPanel = read('src/components/trivia/FriendChallengePanel.jsx');
const reviewDrawer = read('src/components/trivia/PostSettlementReviewDrawer.jsx');
const shareModal = read('src/components/trivia/ShareResultCardModal.jsx');

test('PvP page wires useTriviaRealtimeSync for active match/ticket states and slows fallback polling safely', () => {
    assert.match(pvpPage, /import useTriviaRealtimeSync from '\.\.\/\.\.\/\.\.\/src\/hooks\/useTriviaRealtimeSync'/);
    assert.match(pvpPage, /const realtimeSync = useTriviaRealtimeSync\(\{/);
    assert.match(pvpPage, /trivia:pvp:match:\$\{syncContext\.matchId\}/);
    assert.match(pvpPage, /trivia:pvp:ticket:\$\{syncContext\.ticketId\}/);
    assert.match(pvpPage, /trivia:pvp:user:\$\{user\.id\}/);
    assert.match(pvpPage, /enabled: Boolean\(user\?\.id && realtimeChannelName\)/);
    assert.match(pvpPage, /fallbackPollMs,/);
    assert.match(pvpPage, /connectedPollMs,/);
    assert.match(pvpPage, /onSync: handleRealtimePush/);
    assert.match(pvpPage, /realtimeConnected=\{realtimeSync\.connected\}/);
    assert.match(pvpPage, /realtimePollMs=\{realtimeSync\.effectivePollMs\}/);
    assert.match(pvpPage, /realtimeEventCount=\{realtimeEventCount\}/);

    // PvpCompetitiveExperience slows fallback polling when Realtime is connected
    // and triggers an immediate sequenced status/heartbeat refresh on Realtime events.
    assert.match(pvpExperience, /onSyncContextChange\(/);
    assert.match(pvpExperience, /realtimeConnected && Number\.isFinite\(realtimePollMs\) && realtimePollMs >= baseDelay/);
    assert.match(pvpExperience, /if \(realtimeEventCount <= lastRealtimeEventRef\.current\) return undefined/);
    assert.match(pvpExperience, /lastRealtimeEventRef\.current = realtimeEventCount/);
    assert.match(pvpExperience, /readLatestStatus\(\{[\s\S]{0,140}action: current\.state === 'searching' \? 'heartbeat' : 'status'/);
});

test('PvP page detects ?challenge=<code> and wires FriendChallengePanel with stake-matched quote-bound handoff', () => {
    assert.match(pvpPage, /import FriendChallengePanel from '\.\.\/\.\.\/\.\.\/src\/components\/trivia\/FriendChallengePanel'/);
    assert.match(pvpPage, /router\.query\?\.challenge/);
    assert.match(pvpPage, /CHALLENGE_CODE_RE\.test\(raw\)/);
    assert.match(pvpPage, /<FriendChallengePanel[\s\S]{0,260}initialCode=\{challengeCode\}/);
    assert.match(pvpPage, /shareBasePath="\/hub\/trivia\/pvp"/);
    assert.match(pvpPage, /onChallengeLoaded=\{handleChallengeLoaded\}/);
    assert.match(pvpPage, /onChallengeAccepted=\{handleChallengeAccepted\}/);
    assert.match(pvpPage, /preferredStake=\{preferredStake\}/);
    assert.match(pvpPage, /activeChallenge=\{activeChallenge\}/);

    assert.match(friendPanel, /\/api\/trivia\/challenges\?code=/);
    assert.match(friendPanel, /shareBasePath = '\/hub\/trivia\/pvp'/);
    assert.match(friendPanel, /onChallengeLoaded\(/);
    assert.match(friendPanel, /onChallengeAccepted\(/);
    assert.match(friendPanel, /router\.pathname === '\/hub\/trivia\/pvp'/);
    assert.match(friendPanel, /router\.replace\(targetRoute, undefined, \{ shallow: true \}\)/);

    // Preferred stake selection stays strictly inside the authoritative Phase 5 quote gate.
    const stakeEffectStart = pvpExperience.indexOf('if (!isAuthoritativePvpQuote(quote)) return;');
    assert.ok(stakeEffectStart > 0);
    const stakeEffect = pvpExperience.slice(stakeEffectStart, stakeEffectStart + 700);
    assert.match(stakeEffect, /Number\(preferredStake\)/);
    assert.match(stakeEffect, /quote\.stakes\.some\(\(entry\) => entry\.stake === requestedStake && entry\.stake <= quote\.balance\)/);
    assert.match(pvpExperience, /rulesVersion: quote\.rulesVersion/);
});

test('challenges API returns matched stakeAmount, challengeCode, and quote-bound pvpHandoff without bypassing escrow', () => {
    assert.match(challengesApi, /function buildPvpHandoff\(/);
    assert.match(challengesApi, /requiresServerQuote: true/);
    assert.match(challengesApi, /quoteEndpoint: existingHandoff\?\.quoteEndpoint \|\| '\/api\/trivia\/pvp\/quote'/);
    assert.match(challengesApi, /joinEndpoint: existingHandoff\?\.joinEndpoint \|\| '\/api\/trivia\/pvp\/join'/);
    assert.match(challengesApi, /\/hub\/trivia\/pvp\?challenge=/);
    assert.match(challengesApi, /stakeAmount: data\.challenge\?\.stakeAmount/);
    assert.match(challengesApi, /challengeCode: data\.challenge\?\.challengeCode/);

    // Must never bypass Phase 5 quote-bound escrow or mutate wallets/queue directly.
    assert.doesNotMatch(
        challengesApi,
        /trivia_pvp_queue|trivia_pvp_matches|trivia_pvp_join|add_diamonds_to_balance|deduct_diamonds|trivia_ledger/,
    );
});

test('PostSettlementReviewDrawer and ShareResultCardModal are wired into PvP results ONLY on settled terminal state', () => {
    assert.match(pvpExperience, /import PostSettlementReviewDrawer from '\.\.\/PostSettlementReviewDrawer'/);
    assert.match(pvpExperience, /import ShareResultCardModal from '\.\.\/ShareResultCardModal'/);
    assert.match(
        pvpExperience,
        /const isSettledResult = effectiveState === 'result'[\s\S]{0,120}Boolean\(result\?\.settlementReference && result\?\.settledAt\)/,
    );
    assert.match(pvpExperience, /match\?\.mySessionId \|\| serverRun\.sessionId \|\| settledSessionId/);
    assert.match(pvpExperience, /label="Review Match Questions"/);
    assert.match(pvpExperience, /label="Share Result Card"/);
    assert.match(pvpExperience, /\{isSettledResult \? \([\s\S]{0,420}<PostSettlementReviewDrawer/);
    assert.match(pvpExperience, /<ShareResultCardModal[\s\S]{0,260}mode="pvp"/);
    assert.match(pvpExperience, /shareUrl="https:\/\/smarter\.poker\/hub\/trivia\/pvp"/);

    // Modals always close when leaving settled result state.
    assert.match(pvpExperience, /if \(showLobby \|\| dto\?\.state !== 'result'\) \{[\s\S]{0,140}setReviewDrawerOpen\(false\)[\s\S]{0,80}setShareModalOpen\(false\)/);

    // Page passes settledSessionId and settledMatch from handleMatchSettled.
    assert.match(pvpPage, /settledSessionId=\{settledSessionId\}/);
    assert.match(pvpPage, /settledMatch=\{settledMatch\}/);
    assert.match(pvpPage, /setSettledSessionId\(settledInfo\.sessionId \|\| settledInfo\.match\?\.mySessionId \|\| ''\)/);

    // Downstream review drawer & share card preserve answer-key lock and OG card route.
    assert.match(reviewDrawer, /Train This Spot/);
    assert.match(reviewDrawer, /review_not_available_before_settlement/);
    assert.match(shareModal, /\/api\/trivia\/og-result-card/);
});

test('PvP realtime duel surfaces preserve console laws, zero em-dashes, and server-only DB boundaries', () => {
    for (const [name, src] of [
        ['pages/hub/trivia/pvp.js', pvpPage],
        ['src/components/trivia/pvp/PvpCompetitiveExperience.jsx', pvpExperience],
        ['src/components/trivia/FriendChallengePanel.jsx', friendPanel],
        ['pages/api/trivia/challenges.js', challengesApi],
    ]) {
        assert.doesNotMatch(src, /[—–]/, `${name} must not contain em-dashes or en-dashes`);
    }
    for (const [name, src] of [
        ['pages/hub/trivia/pvp.js', pvpPage],
        ['src/components/trivia/pvp/PvpCompetitiveExperience.jsx', pvpExperience],
        ['src/components/trivia/FriendChallengePanel.jsx', friendPanel],
    ]) {
        assert.doesNotMatch(
            src,
            /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover/,
            `${name} obeys Trivia console visual laws`,
        );
        assert.doesNotMatch(
            src,
            /supabase\.(?:from|rpc)\(/,
            `${name} never queries or mutates database tables directly from browser`,
        );
    }
    assert.match(pvpPage, /key=\{user\?\.id \|\| 'signed-out'\}/);
    assert.match(pvpPage, /<HubPageSummary page="trivia-pvp" \/>/);
});
