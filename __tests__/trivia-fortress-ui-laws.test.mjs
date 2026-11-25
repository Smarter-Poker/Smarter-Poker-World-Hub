import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pvpPage = read('pages/hub/trivia/pvp.js');
const pvpExperience = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
const friendPanel = read('src/components/trivia/FriendChallengePanel.jsx');
const shareModal = read('src/components/trivia/ShareResultCardModal.jsx');
const tournamentsPage = read('pages/hub/trivia/tournaments.js');
const clubNightsPanel = read('src/components/trivia/ClubTriviaNightsPanel.jsx');
const consoleDialog = read('src/components/trivia/console/TriviaConsoleDialog.jsx');
const championshipPanel = read('src/components/trivia/MonthlyChampionshipPanel.jsx');
const reminderButton = read('src/components/trivia/NightlyReminderButton.jsx');
const reviewDrawer = read('src/components/trivia/PostSettlementReviewDrawer.jsx');

test('Fortress Law P0-1: Direct duel accept & waiting challenger wake immediately from idle and pvp.js has no orphaned telemetry hook', () => {
    // No orphaned duplicate telemetry hook in pages/hub/trivia/pvp.js (useServerGradedRun owns it).
    assert.doesNotMatch(
        pvpPage,
        /useTriviaIntegrityTelemetry/,
        'pages/hub/trivia/pvp.js must not import or call orphaned duplicate useTriviaIntegrityTelemetry',
    );

    // Keep trivia:pvp:user:${user.id} subscribed whenever signed in (even while idle).
    const channelBlockStart = pvpPage.indexOf('const realtimeChannelName = useMemo(');
    assert.ok(channelBlockStart > -1, 'realtimeChannelName useMemo must exist in pvp.js');
    const channelBlock = pvpPage.slice(channelBlockStart, channelBlockStart + 420);
    assert.match(channelBlock, /if \(!user\?\.id\) return null;/);
    assert.doesNotMatch(
        channelBlock,
        /if \(!user\?\.id \|\| !syncContext\.active\) return null;/,
        'realtimeChannelName must not return null when idle; waiting challengers need trivia:pvp:user:${user.id}',
    );
    assert.match(channelBlock, /return `trivia:pvp:user:\$\{user\.id\}`;/);
    assert.match(
        pvpPage,
        /enabled:\s*Boolean\(user\?\.id && realtimeChannelName\)/,
        'useTriviaRealtimeSync must stay enabled for signed-in users even in idle state',
    );

    // Track pairedMatchId and bump realtimeEventCount on paired accept/load.
    assert.match(pvpPage, /const \[pairedMatchId,\s*setPairedMatchId\] = useState\(null\);/);
    assert.match(pvpPage, /pvpHandoff\?\.paired/);
    assert.match(pvpPage, /setPairedMatchId\(resolvedMatchId\)/);
    assert.match(pvpPage, /pairedMatchId=\{pairedMatchId\}/);

    // PvpCompetitiveExperience triggers resume from idle on realtimeEventCount AND directDuelMatchId.
    const realtimeEffectStart = pvpExperience.indexOf('if (realtimeEventCount <= lastRealtimeEventRef.current)');
    assert.ok(realtimeEffectStart > -1, 'realtimeEventCount effect must exist');
    const realtimeEffectBlock = pvpExperience.slice(realtimeEffectStart, realtimeEffectStart + 1400);
    assert.match(
        realtimeEffectBlock,
        /readDto\('resume',\s*\{\s*method:\s*'GET',/,
        'realtimeEventCount effect must call readDto("resume", { method: "GET" }) when idle/lobby',
    );
    assert.match(
        realtimeEffectBlock,
        /setShowLobby\(false\)/,
        'realtime resume must exit lobby when an active match is restored',
    );

    assert.match(
        pvpExperience,
        /const directDuelMatchId = activeChallenge\?\.matchId \|\| activeChallenge\?\.pvpHandoff\?\.matchId \|\| pairedMatchId \|\| null;/,
    );
    assert.match(
        pvpExperience,
        /const isDirectDuelPaired = Boolean\(activeChallenge\?\.pvpHandoff\?\.paired \|\| directDuelMatchId\);/,
    );
    assert.match(
        pvpExperience,
        /Direct Duel Active: Loading Live Match\.\.\./,
        'Idle banner must display Direct Duel Active copy when paired',
    );

    // FriendChallengePanel shows paired copy when accept pairs a direct duel.
    assert.match(
        friendPanel,
        /const isPaired = Boolean\(payload\.pvpHandoff\?\.paired \|\| resolvedMatchId\);/,
    );
    assert.match(
        friendPanel,
        /Match Paired: Entering Live Duel\.\.\./,
        'FriendChallengePanel must show Match Paired notice instead of Confirm Server Quote when paired',
    );
});

test('Fortress Law P1-6: ShareResultCardModal prefers matchId over sessionId and PvP passes only matchId', () => {
    const matchIdDeclIdx = shareModal.indexOf('const verifiedMatchId = isValidTriviaUuid(matchId)');
    const sessionIdDeclIdx = shareModal.indexOf('const verifiedSessionId = !verifiedMatchId && isValidTriviaUuid(sessionId)');
    assert.ok(matchIdDeclIdx > -1, 'verifiedMatchId must be computed first from matchId');
    assert.ok(sessionIdDeclIdx > -1, 'verifiedSessionId must yield when verifiedMatchId is present');
    assert.ok(matchIdDeclIdx < sessionIdDeclIdx, 'verifiedMatchId must be resolved before verifiedSessionId');

    const matchUrlIdx = shareModal.indexOf('if (verifiedMatchId) {');
    const sessionUrlIdx = shareModal.indexOf('if (verifiedSessionId) {');
    assert.ok(matchUrlIdx > -1 && sessionUrlIdx > -1, 'cardUrl must handle both verifiedMatchId and verifiedSessionId');
    assert.ok(matchUrlIdx < sessionUrlIdx, 'cardUrl must prefer matchId over sessionId');

    // PvP ShareResultCardModal mount passes matchId and omits sessionId.
    const pvpShareMatch = pvpExperience.match(/<ShareResultCardModal[\s\S]*?\/>/);
    assert.ok(pvpShareMatch, 'PvpCompetitiveExperience must render ShareResultCardModal');
    assert.match(pvpShareMatch[0], /\bmatchId=/, 'PvP ShareResultCardModal must pass matchId');
    assert.doesNotMatch(
        pvpShareMatch[0],
        /\bsessionId=/,
        'PvP ShareResultCardModal must omit sessionId so OG cards use trivia_pvp_matches payout',
    );
});

test('Fortress Law P1-5 & P1-7: Tournaments preserves deep-link tabs on desktop, gates Share on settled/eliminated with sessionId, reviews all resolved rounds, and ClubTriviaNightsPanel reads clubCode', () => {
    // Only ONE desktop min-width: 900px bracket default check exists, inside the merged URL-tab resolver AFTER club-nights/clubCode/challenge checks.
    const matchMediaOccurrences = tournamentsPage.match(/window\.matchMedia\('\(min-width: 900px\)'\)/g) || [];
    assert.equal(
        matchMediaOccurrences.length,
        1,
        'tournaments.js must have exactly one merged URL-tab effect checking min-width: 900px',
    );
    const tabResolverStart = tournamentsPage.indexOf("const tabParam = typeof router.query?.tab === 'string'");
    assert.ok(tabResolverStart > -1, 'Merged URL-tab resolver must read router.query.tab');
    const tabResolverBlock = tournamentsPage.slice(tabResolverStart - 80, tabResolverStart + 900);
    assert.match(tabResolverBlock, /if \(!router\.isReady\) return;/);
    const clubCheckIdx = tabResolverBlock.indexOf("tabParam === 'club-nights' || clubCodeParam");
    const challengeCheckIdx = tabResolverBlock.indexOf('if (challengeParam)');
    const desktopDefaultIdx = tabResolverBlock.indexOf("window.matchMedia('(min-width: 900px)')");
    assert.ok(clubCheckIdx > -1 && challengeCheckIdx > -1 && desktopDefaultIdx > -1);
    assert.ok(clubCheckIdx < desktopDefaultIdx, '?tab=club-nights / ?clubCode must precede desktop bracket default');
    assert.ok(challengeCheckIdx < desktopDefaultIdx, '?challenge must precede desktop bracket default');

    // Share Result Card gated on settled/eliminated state, never shown in registration/live active play.
    assert.match(tournamentsPage, /const isSettledOrEliminated = Boolean\(/);
    assert.match(tournamentsPage, /const canShareResult = Boolean\(/);
    assert.match(tournamentsPage, /!\['registration',\s*'scheduled',\s*'held'\]\.includes\(tournament\?\.state\)/);
    assert.match(
        tournamentsPage,
        /\{canShareResult \? \(\s*<TriviaGlassAction[\s\S]{0,160}label="Share Result Card"/,
        'Share Result Card button must be gated on canShareResult',
    );

    // ShareResultCardModal on tournaments receives settledShareSessionId from myRun.history.
    const tournShareMatch = tournamentsPage.match(/<ShareResultCardModal[\s\S]*?\/>/);
    assert.ok(tournShareMatch, 'tournaments.js must render ShareResultCardModal');
    assert.match(tournShareMatch[0], /open=\{shareCardOpen && canShareResult\}/);
    assert.match(tournShareMatch[0], /sessionId=\{settledShareSessionId\}/);

    // Every resolved round in myRun.history with sessionId can be reviewed via PostSettlementReviewDrawer.
    assert.match(
        tournamentsPage,
        /const reviewableHistoryRounds = useMemo\(\s*\(\) => \(Array\.isArray\(myRun\?\.history\) \? myRun\.history\.filter\(row => Boolean\(row\?\.sessionId\)\) : \[\]\)/,
    );
    assert.match(tournamentsPage, /reviewableHistoryRounds\.map\(\(row,\s*idx\) => \(/);
    assert.match(tournamentsPage, /onClick=\{\(\) => setReviewSessionId\(row\.sessionId\)\}/);

    // ClubTriviaNightsPanel reads router.query.clubCode (uppercase), highlights matches, and guides non-members to Club Arena.
    assert.match(clubNightsPanel, /router\.query\?\.clubCode/);
    assert.match(clubNightsPanel, /\.trim\(\)\.toUpperCase\(\)/);
    assert.match(clubNightsPanel, /data-invited-match=\{isInvitedMatch \? 'true' : undefined\}/);
    assert.match(clubNightsPanel, /data-club-invite-notice=\{invitedClubCode\}/);
    assert.match(clubNightsPanel, /router\.push\('\/hub\/club-arena'\)/);
});

test('Fortress Law P1-8: TriviaConsoleDialog stabilizes focus trap & scroll lock with onCloseRef, [open]-only effect, and cancelAnimationFrame', () => {
    assert.match(consoleDialog, /const onCloseRef = useRef\(onClose\);/);
    assert.match(consoleDialog, /onCloseRef\.current = onClose;/);
    assert.match(consoleDialog, /onCloseRef\.current\?\.\(\);/);
    assert.match(consoleDialog, /const rafId = window\.requestAnimationFrame\(/);
    assert.match(consoleDialog, /window\.cancelAnimationFrame\(rafId\);/);
    assert.match(consoleDialog, /\}, \[open\]\);/);
    assert.doesNotMatch(
        consoleDialog,
        /\}, \[open,\s*onClose\]\);/,
        'TriviaConsoleDialog focus/scroll-lock effect must never depend on onClose',
    );
});

test('Fortress Law P2-1: AbortController panels guard finally setLoading(false) on !signal?.aborted + requestIdRef, and PostSettlementReviewDrawer clears stale review on sessionId change', () => {
    for (const [name, src] of [
        ['src/components/trivia/MonthlyChampionshipPanel.jsx', championshipPanel],
        ['src/components/trivia/NightlyReminderButton.jsx', reminderButton],
        ['src/components/trivia/PostSettlementReviewDrawer.jsx', reviewDrawer],
        ['src/components/trivia/ClubTriviaNightsPanel.jsx', clubNightsPanel],
    ]) {
        assert.match(
            src,
            /finally\s*\{\s*if\s*\(!signal\?\.aborted\s*&&\s*(?:requestIdRef|loadRequestIdRef)\.current === requestId\)\s*\{\s*setLoading\(false\);\s*\}\s*\}/,
            `${name} must guard setLoading(false) in finally with !signal?.aborted and monotonic requestIdRef`,
        );
    }

    // PostSettlementReviewDrawer resets review, error, and lockedMessage on sessionId change and routes Retry via tracked AbortController.
    assert.match(
        reviewDrawer,
        /useEffect\(\(\) => \{[\s\S]{0,260}setReview\(null\);[\s\S]{0,80}setError\(''\);[\s\S]{0,80}setLockedMessage\(''\);[\s\S]{0,80}\}, \[sessionId\]\);/,
        'PostSettlementReviewDrawer must clear stale review, error, and lockedMessage when sessionId changes',
    );
    assert.match(reviewDrawer, /const activeControllerRef = useRef\(null\);/);
    assert.match(reviewDrawer, /const triggerLoadReview = useCallback\(/);
    assert.match(reviewDrawer, /primaryAction=\{error \? \{ label: 'Retry', onClick: \(\) => triggerLoadReview\(\) \} : undefined\}/);
    assert.match(reviewDrawer, /<TriviaGlassAction label="Retry Review" ink="red" onClick=\{\(\) => triggerLoadReview\(\)\} \/>/);
});

test('Fortress UI Hygiene: all Track 2 modified UI files ban em-dashes and obey Trivia console visual laws', () => {
    const files = [
        ['pages/hub/trivia/pvp.js', pvpPage],
        ['src/components/trivia/pvp/PvpCompetitiveExperience.jsx', pvpExperience],
        ['src/components/trivia/FriendChallengePanel.jsx', friendPanel],
        ['src/components/trivia/ShareResultCardModal.jsx', shareModal],
        ['pages/hub/trivia/tournaments.js', tournamentsPage],
        ['src/components/trivia/ClubTriviaNightsPanel.jsx', clubNightsPanel],
        ['src/components/trivia/console/TriviaConsoleDialog.jsx', consoleDialog],
        ['src/components/trivia/MonthlyChampionshipPanel.jsx', championshipPanel],
        ['src/components/trivia/NightlyReminderButton.jsx', reminderButton],
        ['src/components/trivia/PostSettlementReviewDrawer.jsx', reviewDrawer],
    ];
    for (const [name, src] of files) {
        assert.doesNotMatch(src, /[—–]/, `${name} must not contain em-dashes or en-dashes`);
        assert.doesNotMatch(
            src,
            /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover/,
            `${name} must obey Trivia console visual laws`,
        );
    }
});
