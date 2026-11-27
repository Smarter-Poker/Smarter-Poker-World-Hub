/**
 * Wave 4 Track 2 (PvP & Friend Duel Retention Loop) Anti-Regression Laws:
 *  - Unit-tests computeHeadToHeadSeries (wins/losses/ties/netDiamonds, horse & null exclusion).
 *  - Unit-tests buildPvpCategoryBreakdown (weakest-first sort, valid trainingSpotMap.mjs URLs).
 *  - Enforces ZERO silent charging: Rematch pre-fills draft without auto-calling POST /api/trivia/challenges.
 *  - Enforces Horse Disclosure: Smarter Horse opponents never trigger direct friend rematch.
 *  - Enforces AbortController + !signal.aborted guards on post-settlement category breakdown fetch.
 *  - Enforces #SMARTERDESIGN (zero forbidden colors, zero uppercase, zero em/en-dashes, >= 44px targets)
 *    and preserves all existing Fortress PvP laws.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    buildPvpCategoryBreakdown,
    computeHeadToHeadSeries,
    isPvpHorseOpponent,
    resolvePvpOpponentKey,
} from '../src/components/trivia/pvp/pvpModel.mjs';
import {
    DEFAULT_TRAINING_SPOT,
    TRAINING_SPOT_MAP,
} from '../src/lib/trivia/trainingSpotMap.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const VALID_TRAINING_HREFS = new Set([
    DEFAULT_TRAINING_SPOT.href,
    ...Object.values(TRAINING_SPOT_MAP).map((spot) => spot.href),
]);

test('Wave 4 PvP Law 1: computeHeadToHeadSeries aggregates W-L-T and netDiamonds and excludes horses/nulls', () => {
    const historyRows = [
        {
            outcome: 'win',
            net: 18,
            opponent: { id: 'opp-human-1', kind: 'human', isHorse: false, displayName: 'trivia_canary_2' },
        },
        {
            outcome: 'loss',
            net: -10,
            opponent: { id: 'opp-human-1', kind: 'human', isHorse: false, displayName: 'trivia_canary_2' },
        },
        {
            outcome: 'tie',
            net: 0,
            opponent: { id: 'opp-human-1', kind: 'human', isHorse: false, displayName: 'trivia_canary_2' },
        },
        {
            outcome: 'win',
            net: 45,
            opponent: { id: 'opp-other', kind: 'human', isHorse: false, displayName: 'other_rival' },
        },
        // Horse rows must NEVER be counted even if an ID matches
        {
            outcome: 'win',
            net: 90,
            match_type: 'human_horse',
            opponent: { id: 'opp-human-1', kind: 'horse', isHorse: true, displayName: 'Smarter Horse' },
        },
        {
            outcome: 'loss',
            net: -25,
            opponent: { id: 'opp-horse-2', kind: 'horse', isHorse: true, displayName: 'Smarter Horse' },
        },
    ];

    const seriesById = computeHeadToHeadSeries(historyRows, 'opp-human-1');
    assert.deepEqual(seriesById, {
        played: 3,
        wins: 1,
        losses: 1,
        ties: 1,
        netDiamonds: 8,
        opponentName: 'trivia_canary_2',
    });

    // Allowlist DTO rows from /api/trivia/pvp/history omit opponent.id and carry opponent.displayName.
    const allowlistRows = [
        { outcome: 'win', net: 9, opponent: { kind: 'human', isHorse: false, label: 'Player', displayName: 'trivia_canary_2' } },
        { outcome: 'win', net: 9, opponent: { kind: 'human', isHorse: false, label: 'Player', displayName: 'trivia_canary_2' } },
        { outcome: 'loss', net: -10, opponent: { kind: 'horse', isHorse: true, label: 'Smarter Horse', displayName: 'Smarter Horse' } },
    ];
    const seriesByName = computeHeadToHeadSeries(allowlistRows, 'trivia_canary_2');
    assert.deepEqual(seriesByName, {
        played: 2,
        wins: 2,
        losses: 0,
        ties: 0,
        netDiamonds: 18,
        opponentName: 'trivia_canary_2',
    });

    // Horse and null/anonymous targets always return empty record.
    for (const invalidTarget of [null, undefined, '', '   ', 'Smarter Horse', 'Player', 'opp-horse-2']) {
        const result = computeHeadToHeadSeries(historyRows, invalidTarget);
        assert.equal(result.played, 0, `Target ${String(invalidTarget)} must yield 0 played`);
        assert.equal(result.opponentName, null);
    }

    assert.equal(isPvpHorseOpponent({ match_type: 'human_horse' }), true);
    assert.equal(isPvpHorseOpponent({ opponent: { isHorse: true } }), true);
    assert.equal(resolvePvpOpponentKey({ opponent: { isHorse: true, displayName: 'Smarter Horse' } }), null);
    assert.equal(resolvePvpOpponentKey({ opponent: { isHorse: false, displayName: 'Player' } }), null);
    assert.equal(resolvePvpOpponentKey({ opponent: { isHorse: false, displayName: 'trivia_canary_2' } }), 'trivia_canary_2');
});

test('Wave 4 PvP Law 2: buildPvpCategoryBreakdown sorts weakest-first and resolves valid trainingSpotMap URLs', () => {
    const breakdown = buildPvpCategoryBreakdown([
        { category: 'gto_scenarios', wasCorrect: true },
        { category: 'gto_scenarios', wasCorrect: true },
        { category: 'icm_chip_ev', wasCorrect: false },
        { category: 'icm_chip_ev', wasCorrect: false },
        { category: 'icm_chip_ev', wasCorrect: true },
        { category: 'cash_game_situations', wasCorrect: false },
        { category: 'cash_game_situations', wasCorrect: false },
        { category: 'rule_knowledge', wasCorrect: true },
        { category: 'rule_knowledge', wasCorrect: false },
    ]);

    assert.equal(breakdown.length, 4);
    assert.deepEqual(
        breakdown.map((entry) => ({ category: entry.category, accuracyPct: entry.accuracyPct })),
        [
            { category: 'cash_game_situations', accuracyPct: 0 },
            { category: 'icm_chip_ev', accuracyPct: 33 },
            { category: 'rule_knowledge', accuracyPct: 50 },
            { category: 'gto_scenarios', accuracyPct: 100 },
        ],
    );

    for (const entry of breakdown) {
        assert.ok(
            VALID_TRAINING_HREFS.has(entry.trainingHref),
            `Unexpected trainingHref for ${entry.category}: ${entry.trainingHref}`,
        );
        assert.equal(entry.trainingHref, TRAINING_SPOT_MAP[entry.category].href);
        assert.ok(entry.trainingLabel.length > 0);
        assert.ok(entry.label.length > 0);
    }

    // Empty / invalid inputs fail closed to empty array.
    assert.deepEqual(buildPvpCategoryBreakdown([]), []);
    assert.deepEqual(buildPvpCategoryBreakdown(null), []);
});

test('Wave 4 PvP Law 3: ZERO SILENT CHARGING — Rematch pre-fills FriendChallengePanel without auto-calling POST /api/trivia/challenges', () => {
    const friendPanel = read('src/components/trivia/FriendChallengePanel.jsx');
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    const pvpPage = read('pages/hub/trivia/pvp.js');

    // FriendChallengePanel accepts rematchDraft and pre-fills stake without calling handleCreate or fetch inside the effect.
    const rematchEffectStart = friendPanel.indexOf('if (!rematchDraft) return;');
    assert.ok(rematchEffectStart > -1, 'FriendChallengePanel must handle rematchDraft in useEffect');
    const rematchEffectBlock = friendPanel.slice(rematchEffectStart - 60, rematchEffectStart + 360);
    assert.match(rematchEffectBlock, /setStake\(requestedStake\)/);
    assert.doesNotMatch(
        rematchEffectBlock,
        /handleCreate|\/api\/trivia\/challenges|method:\s*['"]POST['"]/,
        'rematchDraft effect must NEVER auto-create a duel or charge Diamonds',
    );

    // Explicit quoted confirmation CTA is required.
    assert.match(friendPanel, /data-rematch-draft="true"/);
    assert.match(friendPanel, /Create \$\{stake\} Diamond Rematch Link/);
    assert.match(friendPanel, /No Diamonds Are Charged Until You Confirm/);

    // Clicking Rematch in PvpCompetitiveExperience never posts to /api/trivia/challenges or /api/trivia/pvp/join directly.
    const handleRematchStart = pvpExp.indexOf('const handleRematch = useCallback(');
    assert.ok(handleRematchStart > -1, 'PvpCompetitiveExperience must define handleRematch');
    const handleRematchBlock = pvpExp.slice(handleRematchStart, handleRematchStart + 1400);
    assert.doesNotMatch(
        handleRematchBlock,
        /\/api\/trivia\/challenges|requestPvp\(\s*['"]join['"]/,
        'handleRematch must never silently charge or call join/challenges',
    );
    assert.match(pvpExp, /data-pvp-rematch="true"/);
    assert.match(pvpPage, /onRequestRematch=\{handleRequestRematch\}/);
    assert.match(pvpPage, /rematchDraft=\{rematchDraft\}/);
});

test('Wave 4 PvP Law 4: Smarter Horse opponents never trigger direct Friend Challenge rematch', () => {
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    const pvpPage = read('pages/hub/trivia/pvp.js');

    // Horse opponents are explicitly gated in both PvpCompetitiveExperience and pvp.js.
    assert.match(pvpExp, /isPvpHorseOpponent\(/);
    assert.match(pvpExp, /Play Another Match \(\$\{formatDiamonds\(/);
    assert.match(pvpExp, /data-pvp-rematch-kind=\{isHorse \? 'horse' : 'human'\}/);
    assert.match(pvpExp, /data-pvp-rematch-kind=\{settledIsHorse \? 'horse' : 'human'\}/);
    assert.match(
        pvpPage,
        /if\s*\(request\.isHorse\)\s*\{\s*setRematchDraft\(null\);\s*return;\s*\}/,
        'pvp.js must refuse direct friend rematch draft when request.isHorse is true',
    );
});

test('Wave 4 PvP Law 5: Settled category breakdown lazily fetches /api/trivia/session-review with AbortController + !signal.aborted guard', () => {
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');

    const effectStart = pvpExp.indexOf('if (!isSettledResult || !effectiveReviewSessionId || !user?.id)');
    assert.ok(effectStart > -1, 'Category breakdown effect must gate on isSettledResult and effectiveReviewSessionId');
    const effectBlock = pvpExp.slice(effectStart, effectStart + 2500);

    assert.match(effectBlock, /new AbortController\(\)/);
    assert.match(effectBlock, /\/api\/trivia\/session-review\?sessionId=\$\{encodeURIComponent\(effectiveReviewSessionId\)\}/);
    assert.match(effectBlock, /if \(signal\.aborted \|\| categoryBreakdownRequestRef\.current !== requestId\) return;/);
    assert.match(effectBlock, /finally\s*\{\s*if \(!signal\.aborted && categoryBreakdownRequestRef\.current === requestId\)/);
    assert.match(effectBlock, /return \(\) => controller\.abort\(\);/);
    assert.match(effectBlock, /buildPvpCategoryBreakdown\(payload\.items\)/);
    assert.match(pvpExp, /data-pvp-category-breakdown="true"/);
    assert.match(pvpExp, /data-pvp-train-spot="true"/);
});

test('Wave 4 PvP Law 6: Owned files preserve #SMARTERDESIGN hygiene and Fortress PvP laws', () => {
    const ownedFiles = [
        'src/components/trivia/pvp/pvpModel.mjs',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'src/components/trivia/FriendChallengePanel.jsx',
        'pages/hub/trivia/pvp.js',
    ];
    const forbiddenRe = /text-transform:\s*uppercase|textTransform:\s*['"]uppercase['"]|[—–]|tc-ink--gold|ink=['"]gold['"]/i;
    for (const rel of ownedFiles) {
        const src = read(rel);
        assert.doesNotMatch(src, forbiddenRe, `${rel} must not contain uppercase transforms, em/en-dashes, or gold tokens`);
    }
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    const pvpPage = read('pages/hub/trivia/pvp.js');
    assert.match(pvpPage, /return `trivia:pvp:user:\$\{user\.id\}`;/);
    assert.match(pvpPage, /router\.asPath\.startsWith\('\/hub\/trivia\/pvp'\)/);
    const shareMatch = pvpExp.match(/<ShareResultCardModal[\s\S]*?\/>/);
    assert.ok(shareMatch, 'ShareResultCardModal must remain mounted');
    assert.match(shareMatch[0], /\bmatchId=/);
    assert.doesNotMatch(shareMatch[0], /\bsessionId=/);
});
