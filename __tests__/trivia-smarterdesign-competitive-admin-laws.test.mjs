/**
 * Phase B Track 3 (#SMARTERDESIGN Competitive + Admin Consoles) Anti-Regression Laws:
 *  - Zero forbidden yellow/gold/amber/purple/violet/lavender/pink/magenta colors and zero
 *    text-transform: uppercase across all 14 Track 3 owned files.
 *  - Admin Pool (/admin/trivia-pool): isolated try/catch around follow-up loadWorkbench()
 *    so a refresh error never overwrites a confirmed curation receipt, full receiptId display
 *    (no .slice(0, 8)), and .smarterdesign adoption.
 *  - Admin Operations (/admin/trivia-operations): .smarterdesign adoption and ice-blue MFA
 *    alert banner (zero amber/gold).
 *  - Deep-link query param preservation via router.asPath on auth redirects in
 *    tournaments.js, pvp.js, and leaderboard.js.
 *  - PvP UX hierarchy: FriendChallengePanel surfaced via friendChallengeSlot ahead of
 *    collapsible Match History, human-readable receipt labels, and stable min-height
 *    containers preventing phone CLS spikes.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const TRACK3_OWNED_FILES = [
    'pages/hub/trivia/pvp.js',
    'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
    'src/components/trivia/pvp/pvpModel.mjs',
    'src/components/trivia/FriendChallengePanel.jsx',
    'src/components/trivia/GhostOpponent.jsx',
    'pages/hub/trivia/tournaments.js',
    'src/components/trivia/tournaments/TournamentSections.jsx',
    'src/components/trivia/tournaments/tournamentModel.mjs',
    'src/components/trivia/NightlySpectatorBanner.jsx',
    'src/components/trivia/ClubTriviaNightsPanel.jsx',
    'pages/hub/trivia/leaderboard.js',
    'src/components/trivia/LeaderboardDisplay.jsx',
    'pages/admin/trivia-operations.js',
    'pages/admin/trivia-pool.js',
];

const FORBIDDEN_COLOR_AND_UPPERCASE_RE = new RegExp(
    [
        '#(?:ffd700|fbbf24|f59e0b|d97706|fef3c7|fde68a|fffbeb|78350f|facc15|fde047|eab308|ca8a04|a855f7|c084fc|e9d5ff|8b5cf6|9d4edd|9333ea|7c3aed|ec4899|f472b6|db2777|d946ef|e879f9)',
        'tc-ink--gold',
        'ink=["\']gold["\']',
        'tone=["\']gold["\']',
        'rgba\\(\\s*(?:25[015]|245|217|168|147|139|236|219)\\s*,\\s*(?:204|191|158|119|85|51|92|72|39)\\s*,',
        'text-transform:\\s*uppercase',
        'textTransform:\\s*["\']uppercase["\']',
    ].join('|'),
    'i',
);

test('SMARTERDESIGN Track 3: zero forbidden colors and zero uppercase transforms across all 14 owned files', () => {
    for (const rel of TRACK3_OWNED_FILES) {
        const src = read(rel);
        const match = src.match(FORBIDDEN_COLOR_AND_UPPERCASE_RE);
        assert.equal(
            match,
            null,
            `${rel} must not contain forbidden yellow/gold/amber/purple/pink colors or uppercase CSS transforms (matched: ${match?.[0]})`,
        );
    }
});

test('SMARTERDESIGN Track 3 P1: /admin/trivia-pool isolates loadWorkbench refresh, displays full receiptId, and adopts .smarterdesign', () => {
    const pool = read('pages/admin/trivia-pool.js');
    assert.match(pool, /className=\{`smarterdesign \$\{consoleStyles\.surface\}`\}/);
    assert.match(pool, /sd-panel/);
    assert.match(pool, /sd-metric/);

    // Full receiptId without .slice(0, 8)
    assert.match(pool, /Receipt \$\{String\(payload\.receiptId \|\| ''\)\}/);
    assert.doesNotMatch(pool, /payload\.receiptId[^)]*\.slice\(0,\s*8\)/);

    // Follow-up loadWorkbench() wrapped in its own isolated try/catch inside runBatchCurate
    assert.match(
        pool,
        /setSelectedIds\(\[\]\);\s*try\s*\{\s*await loadWorkbench\(\);\s*\}\s*catch\s*\(_refreshError\)\s*\{/,
        'loadWorkbench() after successful batch curation must run in an isolated try/catch so refresh failures never overwrite a confirmed receipt',
    );
});

test('SMARTERDESIGN Track 3: /admin/trivia-operations adopts .smarterdesign with ice-blue MFA alert', () => {
    const ops = read('pages/admin/trivia-operations.js');
    assert.match(ops, /className=\{`smarterdesign \$\{consoleStyles\.surface\}`\}/);
    assert.match(ops, /sd-panel/);
    assert.match(ops, /sd-metric/);
    assert.match(ops, /mfaPanel:\s*\{[^}]*#86daff/);
    assert.match(ops, /mfaLink:\s*\{[^}]*minHeight:\s*44/);
});

test('SMARTERDESIGN Track 3 P1: deep-link query params survive auth redirects via router.asPath on tournaments, pvp, and leaderboard', () => {
    const tournaments = read('pages/hub/trivia/tournaments.js');
    const pvp = read('pages/hub/trivia/pvp.js');
    const leaderboard = read('pages/hub/trivia/leaderboard.js');

    assert.match(
        tournaments,
        /router\.asPath\.startsWith\(PAGE_PATH\)\s*\?\s*router\.asPath\s*:\s*PAGE_PATH/,
        'tournaments.js signIn must preserve full router.asPath (?tab=club-nights, ?clubCode=, ?challenge=, ?tournamentId=)',
    );
    assert.match(
        pvp,
        /router\.asPath\.startsWith\('\/hub\/trivia\/pvp'\)\s*\?\s*router\.asPath/,
        'pvp.js handleChallengeSignIn must preserve full router.asPath (?stake= and ?challenge=)',
    );
    assert.match(
        leaderboard,
        /router\.asPath\.startsWith\('\/hub\/trivia\/leaderboard'\)\s*\?\s*router\.asPath\s*:\s*'\/hub\/trivia\/leaderboard'/,
        'leaderboard.js handleSignIn must preserve full router.asPath (active board/tab query params)',
    );
});

test('SMARTERDESIGN Track 3: PvP surfaces FriendChallengePanel via friendChallengeSlot ahead of collapsible Match History and formats receipt labels', () => {
    const pvpPage = read('pages/hub/trivia/pvp.js');
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');

    assert.match(pvpPage, /friendChallengeSlot=/);
    assert.match(pvpPage, /min-height:\s*540px/);
    assert.match(pvpExp, /function formatReceiptLabel\(/);
    assert.match(pvpExp, /View Exact Reference IDs/);

    const slotIdx = pvpExp.indexOf('{friendChallengeSlot}');
    const historyIdx = pvpExp.indexOf('<PvpHistory');
    assert.ok(slotIdx > -1 && historyIdx > -1 && slotIdx < historyIdx, 'friendChallengeSlot must render before PvpHistory');
});
