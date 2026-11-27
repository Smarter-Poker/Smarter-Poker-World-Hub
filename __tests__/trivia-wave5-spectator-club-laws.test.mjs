/**
 * Anti-regression laws for Wave 5 Track 3:
 *   1. Live Nightly Spectator "Follow Player" pinning (NightlySpectatorBanner.jsx)
 *   2. All-Time Club Trivia Standings + Recurring Freeroll Quick-Schedule Helper (ClubTriviaNightsPanel.jsx)
 *   3. Pure deterministic helpers in tournamentModel.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    extractSpectatorFollowTargets,
    resolveFollowedPlayerStatus,
    aggregateClubAllTimeStandings,
    buildNextWeekFreerollDraft,
} from '../src/components/trivia/tournaments/tournamentModel.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

function read(relPath) {
    return readFileSync(join(ROOT, relPath), 'utf8');
}

const FORBIDDEN_COLOR_RE = /(?:#(?:eab308|f59e0b|fbbf24|fcd34d|fde047|facc15|d97706|b45309|ffd700|a855f7|9333ea|c084fc|d8b4fe|7e22ce|ec4899|f472b6|db2777|ff00ff|e879f9)\b|\b(?:gold|yellow|amber|purple|violet|magenta|fuchsia|pink)\b)/i;
const UPPERCASE_CSS_RE = /textTransform\s*:\s*['"]uppercase['"]|text-transform\s*:\s*uppercase/i;

const SAMPLE_SPECTATOR = {
    tournament: { tournamentId: 'tour-w5-1', state: 'live', format: { rounds: 3 }, currentRound: 3 },
    summary: { field: { rounds: 3 }, currentRound: 3 },
    featuredMatchups: [
        {
            matchupId: 'm-sf-0',
            roundNumber: 2,
            slot: 0,
            status: 'resolved',
            winnerEntrantId: 'ent-alice',
            seats: [
                { entrantId: 'ent-alice', displayName: 'AlicePro', participantKind: 'human', correct: 8, answered: 10 },
                { entrantId: 'ent-bob', displayName: 'BobChip', participantKind: 'human', correct: 6, answered: 10 },
            ],
        },
        {
            matchupId: 'm-sf-1',
            roundNumber: 2,
            slot: 1,
            status: 'resolved',
            winnerEntrantId: 'ent-horse',
            seats: [
                { entrantId: 'ent-horse', displayName: 'RiverKing', participantKind: 'horse', correct: 9, answered: 10 },
                { entrantId: 'ent-carol', displayName: 'CarolAce', participantKind: 'human', correct: 7, answered: 10 },
            ],
        },
        {
            matchupId: 'm-final',
            roundNumber: 3,
            slot: 0,
            status: 'live',
            winnerEntrantId: null,
            seats: [
                { entrantId: 'ent-alice', displayName: 'AlicePro', participantKind: 'human', correct: 4, answered: 5 },
                { entrantId: 'ent-horse', displayName: 'RiverKing', participantKind: 'horse', correct: 4, answered: 5 },
            ],
        },
    ],
};

test('extractSpectatorFollowTargets deduplicates players across rounds and preserves 0-based slot labels', () => {
    const targets = extractSpectatorFollowTargets(SAMPLE_SPECTATOR);
    assert.equal(targets.length, 4, 'must deduplicate players appearing in semifinal and final');

    const byId = new Map(targets.map((t) => [t.id, t]));
    assert.deepEqual(byId.get('ent-alice'), {
        id: 'ent-alice',
        name: 'AlicePro',
        isHorse: false,
        roundLabel: 'Championship Final',
        status: 'live',
        matchupSlot: 0,
    });
    assert.deepEqual(byId.get('ent-horse'), {
        id: 'ent-horse',
        name: 'RiverKing (Smarter Horse)',
        isHorse: true,
        roundLabel: 'Championship Final',
        status: 'live',
        matchupSlot: 0,
    });
    assert.equal(byId.get('ent-bob').roundLabel, 'Semifinal 1');
    assert.equal(byId.get('ent-bob').status, 'eliminated');
    assert.equal(byId.get('ent-carol').roundLabel, 'Semifinal 2');
    assert.equal(byId.get('ent-carol').status, 'eliminated');

    assert.deepEqual(extractSpectatorFollowTargets(null), []);
    assert.deepEqual(extractSpectatorFollowTargets({}), []);
});

test('resolveFollowedPlayerStatus resolves live, advanced, champion, eliminated, and pending safely', () => {
    const liveStatus = resolveFollowedPlayerStatus(SAMPLE_SPECTATOR, 'ent-alice');
    assert.equal(liveStatus.key, 'ent-alice');
    assert.equal(liveStatus.name, 'AlicePro');
    assert.equal(liveStatus.isHorse, false);
    assert.equal(liveStatus.roundLabel, 'Championship Final');
    assert.equal(liveStatus.status, 'live');
    assert.equal(liveStatus.opponentName, 'RiverKing (Smarter Horse)');
    assert.match(liveStatus.scoreLabel, /4 Correct/);

    const elimStatus = resolveFollowedPlayerStatus(SAMPLE_SPECTATOR, 'ent-bob');
    assert.equal(elimStatus.status, 'eliminated');
    assert.equal(elimStatus.roundLabel, 'Semifinal 1');
    assert.equal(elimStatus.opponentName, 'AlicePro');

    const advancedSpectator = {
        ...SAMPLE_SPECTATOR,
        featuredMatchups: SAMPLE_SPECTATOR.featuredMatchups.slice(0, 2),
    };
    const advStatus = resolveFollowedPlayerStatus(advancedSpectator, 'ent-alice');
    assert.equal(advStatus.status, 'advanced');

    const settledSpectator = {
        tournament: { tournamentId: 'tour-w5-1', state: 'settled', format: { rounds: 3 }, currentRound: 3 },
        champion: { entrantId: 'ent-alice', displayName: 'AlicePro', participantKind: 'human', score: 9, payout: 500 },
        featuredMatchups: [
            {
                matchupId: 'm-final',
                roundNumber: 3,
                slot: 0,
                status: 'resolved',
                winnerEntrantId: 'ent-alice',
                seats: [
                    { entrantId: 'ent-alice', displayName: 'AlicePro', participantKind: 'human', correct: 9, answered: 10 },
                    { entrantId: 'ent-horse', displayName: 'RiverKing', participantKind: 'horse', correct: 8, answered: 10 },
                ],
            },
        ],
    };
    const champStatus = resolveFollowedPlayerStatus(settledSpectator, 'ent-alice');
    assert.equal(champStatus.status, 'champion');
    assert.equal(champStatus.roundLabel, 'Championship Final');

    assert.equal(resolveFollowedPlayerStatus(null, ''), null);
    assert.equal(resolveFollowedPlayerStatus({}, null), null);
    const missingStatus = resolveFollowedPlayerStatus({}, 'ent-missing');
    assert.equal(missingStatus.key, 'ent-missing');
    assert.equal(missingStatus.status, 'pending');
});

test('aggregateClubAllTimeStandings aggregates settled club nights deterministically', () => {
    const nights = [
        {
            id: 'n-reg',
            status: 'registration',
            championDisplayName: 'IgnoredReg',
        },
        {
            id: 'n-cancelled',
            status: 'cancelled',
            championDisplayName: 'IgnoredCancel',
        },
        {
            id: 'n-1',
            status: 'settled',
            standings: [
                { userId: 'u-1', displayName: 'Alpha', rank: 1, score: 950, isChampion: true },
                { userId: 'u-2', displayName: 'Bravo', rank: 2, score: 880 },
                { userId: 'u-3', displayName: 'Charlie', rank: 3, score: 810 },
                { userId: 'u-4', displayName: 'Delta', rank: 4, score: 700 },
            ],
        },
        {
            id: 'n-2',
            status: 'settled',
            results: [
                { playerId: 'u-2', displayName: 'Bravo', rank: 1, score: 990 },
                { playerId: 'u-1', displayName: 'Alpha', rank: 2, score: 910 },
                { playerId: 'u-4', displayName: 'Delta', rank: 3, score: 820 },
            ],
        },
        {
            id: 'n-3',
            status: 'settled',
            championUserId: 'u-2',
            championDisplayName: 'Bravo',
            championScore: 920,
        },
    ];

    const board = aggregateClubAllTimeStandings(nights);
    assert.equal(board.length, 4);

    // Bravo: 2 wins, 3 podiums, 3 events, bestScore 990
    assert.deepEqual(board[0], {
        playerId: 'u-2',
        displayName: 'Bravo',
        wins: 2,
        podiums: 3,
        eventsPlayed: 3,
        bestScore: 990,
    });
    // Alpha: 1 win, 2 podiums, 2 events, bestScore 950
    assert.deepEqual(board[1], {
        playerId: 'u-1',
        displayName: 'Alpha',
        wins: 1,
        podiums: 2,
        eventsPlayed: 2,
        bestScore: 950,
    });
    // Delta: 0 wins, 1 podium, 2 events, bestScore 820 (ranks ahead of Charlie on eventsPlayed)
    assert.deepEqual(board[2], {
        playerId: 'u-4',
        displayName: 'Delta',
        wins: 0,
        podiums: 1,
        eventsPlayed: 2,
        bestScore: 820,
    });
    // Charlie: 0 wins, 1 podium, 1 event, bestScore 810
    assert.deepEqual(board[3], {
        playerId: 'u-3',
        displayName: 'Charlie',
        wins: 0,
        podiums: 1,
        eventsPlayed: 1,
        bestScore: 810,
    });

    assert.deepEqual(aggregateClubAllTimeStandings([]), []);
    assert.deepEqual(aggregateClubAllTimeStandings(null), []);
});

test('buildNextWeekFreerollDraft shifts start by +7 days and enforces entryFee === 0 unconditionally', () => {
    const baseIso = '2026-11-27T02:00:00.000Z';
    const draft = buildNextWeekFreerollDraft({
        title: 'Friday Club Championship',
        scheduledStartAt: baseIso,
        entryFee: 500,
        questionCount: 20,
    });

    assert.equal(draft.title, 'Friday Club Championship');
    assert.equal(draft.entryFee, 0, 'entryFee MUST be 0 unconditionally (freeroll-only)');
    assert.equal(draft.questionCount, 20);
    assert.equal(
        Date.parse(draft.scheduledStartIso) - Date.parse(baseIso),
        7 * 24 * 60 * 60 * 1000,
        'scheduledStartIso must be exactly +7 days from original scheduledStartAt',
    );

    const fallbackDraft = buildNextWeekFreerollDraft({ entry_fee: 999 });
    assert.equal(fallbackDraft.entryFee, 0);
    assert.equal(fallbackDraft.questionCount, 10);
    assert.ok(Number.isFinite(Date.parse(fallbackDraft.scheduledStartIso)));
});

test('NightlySpectatorBanner enforces Follow Player pinning, 0-based slot labeling, privacy, and #SMARTERDESIGN', () => {
    const src = read('src/components/trivia/NightlySpectatorBanner.jsx');

    assert.match(src, /export function matchupStageLabel/, 'must preserve matchupStageLabel export');
    assert.match(src, /Number\(rawSlot\)\s*\+\s*1/, 'must preserve 0-based matchup.slot -> 1-based conversion');
    assert.match(src, /`Semifinal \$\{slot\}`/, 'must preserve Semifinal 1 / Semifinal 2 labeling');
    assert.match(src, /data-follow-player=\{/, 'must render data-follow-player pin button');
    assert.match(src, /data-followed-player-tracker="true"/, 'must render pinned tracker strip');
    assert.match(src, /sessionStorage/, 'must persist followed player in sessionStorage per tournament ID');
    assert.match(src, /Unpin/, 'must provide Unpin control');
    assert.match(src, /Jump To Bracket/, 'must provide Jump To Bracket action');
    assert.match(src, /minHeight:\s*['"]44px['"]/, 'follow pin button must meet >= 44px touch target');

    assert.doesNotMatch(
        src,
        /correctIndex|correct_answer|correctOption|answerKey/,
        'spectator banner must never reference unreleased answer keys',
    );
    assert.doesNotMatch(src, FORBIDDEN_COLOR_RE, 'NightlySpectatorBanner must use 0 forbidden colors');
    assert.doesNotMatch(src, UPPERCASE_CSS_RE, 'NightlySpectatorBanner must use 0 text-transform: uppercase');
});

test('ClubTriviaNightsPanel enforces Club Standings tab, freeroll-only recurring draft, invite guards, and #SMARTERDESIGN', () => {
    const src = read('src/components/trivia/ClubTriviaNightsPanel.jsx');

    assert.match(src, /role="tablist"/, 'must render accessible tablist for Club Events / Club Standings');
    assert.match(src, /Club Events/, 'must render Club Events sub-tab');
    assert.match(src, /Club Standings/, 'must render Club Standings sub-tab');
    assert.match(src, /data-club-standings-tab="true"/, 'must tag Club Standings tab');
    assert.match(src, /data-club-standings-board="true"/, 'must render Club Standings board');
    assert.match(
        src,
        /No Settled Club Nights Yet - Complete A Freeroll Club Night To Start Club Standings\./,
        'must render canonical empty state copy when no settled club nights exist',
    );
    assert.match(src, /data-schedule-next-week="true"/, 'must render Schedule Next Week (Freeroll) button');
    assert.match(src, /Schedule Next Week \(Freeroll\)/, 'must label button Schedule Next Week (Freeroll)');
    assert.match(src, /buildNextWeekFreerollDraft/, 'must use buildNextWeekFreerollDraft helper');
    assert.match(src, /entryFee:\s*0/, 'must preserve freeroll-only entryFee: 0');
    assert.doesNotMatch(src, /entryFee:\s*[1-9]/, 'must never allow paid entryFee in ClubTriviaNightsPanel');

    // Verify handleScheduleNextWeek only pre-fills and never auto-submits
    const nextWeekFn = src.slice(src.indexOf('const handleScheduleNextWeek'), src.indexOf('const loadClubNights'));
    assert.ok(nextWeekFn.length > 0, 'handleScheduleNextWeek must exist');
    assert.doesNotMatch(nextWeekFn, /authedFetch|handleCreateSubmit/, 'Schedule Next Week must pre-fill only, never auto-submit');

    // Preserve existing fortress invariants
    assert.match(src, /data-invited-match=/, 'must preserve data-invited-match highlighting');
    assert.match(src, /data-club-invite-notice=/, 'must preserve data-club-invite-notice');
    assert.match(src, /new AbortController\(\)/, 'must preserve AbortController guard');

    assert.doesNotMatch(src, FORBIDDEN_COLOR_RE, 'ClubTriviaNightsPanel must use 0 forbidden colors');
    assert.doesNotMatch(src, UPPERCASE_CSS_RE, 'ClubTriviaNightsPanel must use 0 text-transform: uppercase');
});
