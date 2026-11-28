import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { effectivePvpPollDelay } from '../src/components/trivia/pvp/pvpModel.mjs';
import {
    formatTournamentHorseCount,
    tournamentConnectedPollDelay,
    tournamentPollDelay,
} from '../src/components/trivia/tournaments/tournamentModel.mjs';
import {
    TRIVIA_OPERATIONS_SLOS,
    buildTriviaOperationsSnapshot,
} from '../src/lib/trivia/operationsSnapshot.mjs';
import { resolveTriviaKeyAction } from '../src/lib/trivia/keyboardControlsModel.mjs';
import {
    cardImagePath,
    parseStructuredTriviaQuestion,
    tokenizePokerCardText,
} from '../src/lib/trivia/pokerCardText.mjs';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ---------------------------------------------------------------------------
// 1. 1v1 PvP Smarter Horse <= 30s Polling Hardening
// ---------------------------------------------------------------------------
test('effectivePvpPollDelay never lets realtime throttle searching polls and hits horseEligibleAt on time', () => {
    const baseNow = Date.parse('2026-11-28T02:00:00.000Z');
    const searchingDto = {
        state: 'searching',
        pollAfterMs: 2_000,
        heartbeatSeconds: 5,
        ticket: {
            id: 'tkt-1',
            horseFallbackEnabled: true,
            horseEligibleAt: new Date(baseNow + 10_000).toISOString(),
        },
    };

    // Even when Realtime wants 10s backoff, searching MUST stay <= 2000ms.
    assert.equal(
        effectivePvpPollDelay(searchingDto, {
            realtimeConnected: true,
            realtimePollMs: 10_000,
            nowMs: baseNow,
        }),
        2_000,
    );

    // When horseEligibleAt is 800ms away, aim directly at horseEligibleAt + 50ms.
    assert.equal(
        effectivePvpPollDelay(
            {
                ...searchingDto,
                ticket: {
                    ...searchingDto.ticket,
                    horseEligibleAt: new Date(baseNow + 800).toISOString(),
                },
            },
            { realtimeConnected: true, realtimePollMs: 10_000, nowMs: baseNow },
        ),
        850,
    );

    // When horseEligibleAt has already arrived (<= 0ms), poll in 250ms immediately.
    assert.equal(
        effectivePvpPollDelay(
            {
                ...searchingDto,
                ticket: {
                    ...searchingDto.ticket,
                    horseEligibleAt: new Date(baseNow - 200).toISOString(),
                },
            },
            { realtimeConnected: true, realtimePollMs: 10_000, nowMs: baseNow },
        ),
        250,
    );

    // Non-searching polled states (waiting/settling) may still use realtime backoff.
    assert.equal(
        effectivePvpPollDelay(
            { state: 'waiting', pollAfterMs: 2_000, heartbeatSeconds: 5 },
            { realtimeConnected: true, realtimePollMs: 8_000, nowMs: baseNow },
        ),
        8_000,
    );
});

test('PvpCompetitiveExperience and pages/hub/trivia/pvp wire effectivePvpPollDelay without searching backoff', () => {
    const expSrc = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    const pvpPageSrc = read('pages/hub/trivia/pvp.js');
    assert.match(expSrc, /effectivePvpPollDelay\s*\(/);
    assert.doesNotMatch(
        pvpPageSrc,
        /if\s*\(syncContext\.state\s*===\s*'searching'\)\s*\{[^}]*4000/,
        'pvp.js must not throttle searching connectedPollMs to 4000ms+',
    );
});

// ---------------------------------------------------------------------------
// 2. Nightly Tournament Pre-Start & Live Polling Hardening
// ---------------------------------------------------------------------------
test('tournamentPollDelay and tournamentConnectedPollDelay stay brisk near 8 PM CT start and during live rounds', () => {
    const startIso = '2026-11-28T02:00:00.000Z';
    const startMs = Date.parse(startIso);

    // Far from start (2 hours early): relaxed polling is fine.
    assert.equal(
        tournamentPollDelay({ state: 'registration', startsAt: startIso, nowMs: startMs - 7_200_000 }),
        45_000,
    );

    // Inside final 3 minutes before 8 PM CT start: 3s base, <= 4s connected (NEVER 135s!).
    for (const deltaMs of [180_000, 60_000, 5_000, 0, -5_000]) {
        assert.equal(
            tournamentPollDelay({ state: 'registration', startsAt: startIso, nowMs: startMs - deltaMs }),
            3_000,
            `registration poll must be 3s at delta ${deltaMs}ms`,
        );
        assert.ok(
            tournamentConnectedPollDelay({ state: 'registration', startsAt: startIso, nowMs: startMs - deltaMs }) <= 4_000,
            `connected poll must be <= 4s at delta ${deltaMs}ms`,
        );
    }

    // Live / held / settling rounds stay responsive even with Realtime connected.
    for (const state of ['held', 'live', 'settling']) {
        assert.equal(tournamentPollDelay({ state, nowMs: startMs }), 5_000);
        assert.ok(tournamentConnectedPollDelay({ state, nowMs: startMs }) <= 8_000);
    }

    // Active player run stays at 3s / 4s.
    assert.equal(tournamentPollDelay({ state: 'live', activeRun: true, nowMs: startMs }), 3_000);
    assert.equal(tournamentConnectedPollDelay({ state: 'live', activeRun: true, nowMs: startMs }), 4_000);

    const tournPageSrc = read('pages/hub/trivia/tournaments.js');
    assert.match(tournPageSrc, /tournamentPollDelay\s*\(/);
    assert.match(tournPageSrc, /tournamentConnectedPollDelay\s*\(/);
});

// ---------------------------------------------------------------------------
// 3. Nightly Tournament Full-Bracket Horse Count Display Hardening
// ---------------------------------------------------------------------------
test('formatTournamentHorseCount never renders overflow ratios like 256 / 97 after full bracket fill', () => {
    assert.equal(
        formatTournamentHorseCount({ state: 'registration', horsesEntered: 62, horseTarget: 97 }),
        '62 / 97',
    );
    assert.equal(
        formatTournamentHorseCount({ state: 'registration', horsesEntered: 256, horseTarget: 97 }),
        '256',
    );
    assert.equal(
        formatTournamentHorseCount({ state: 'live', horsesEntered: 256, horseTarget: 97 }),
        '256',
    );
    assert.equal(
        formatTournamentHorseCount({ state: 'settled', horsesEntered: 250, horseTarget: 112 }),
        '250',
    );

    const sectionsSrc = read('src/components/trivia/tournaments/TournamentSections.jsx');
    assert.match(sectionsSrc, /formatTournamentHorseCount\s*\(\s*tournament\s*\)/);
    assert.doesNotMatch(
        sectionsSrc,
        /exactDiamonds\(tournament\.horsesEntered\)\}\s*\/\s*\$\{exactDiamonds\(tournament\.horseTarget\)/,
        'TournamentEventLedger must not hardcode horsesEntered / horseTarget',
    );
});

// ---------------------------------------------------------------------------
// 4. Operations SLO 30s Hardening & Zero Stale 45s / 20-45 Copy
// ---------------------------------------------------------------------------
test('TRIVIA_OPERATIONS_SLOS enforces 30s PvP fallback p95 and runtime Trivia code has no stale 45s/20-45 strings', () => {
    assert.equal(TRIVIA_OPERATIONS_SLOS.pvpFallbackP95Ms, 30_000);

    const okSnap = buildTriviaOperationsSnapshot({
        pvpMetrics: { join_to_match_ms: { horse_p95: 30_000 } },
    });
    assert.equal(
        okSnap.issues.some((i) => i.code === 'pvp_fallback_p95_slow'),
        false,
        '30,000ms must be within the 30s SLO',
    );

    const slowSnap = buildTriviaOperationsSnapshot({
        pvpMetrics: { join_to_match_ms: { horse_p95: 30_001 } },
    });
    const slowIssue = slowSnap.issues.find((i) => i.code === 'pvp_fallback_p95_slow');
    assert.ok(slowIssue, '30,001ms must trigger pvp_fallback_p95_slow');
    assert.match(slowIssue.summary, /30 seconds/i);

    for (const rel of [
        'src/lib/trivia/operationsSnapshot.mjs',
        'src/lib/trivia/pvpApiHandler.js',
        'src/lib/trivia/pvpMatchmakingPolicy.mjs',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'pages/hub/trivia/pvp.js',
    ]) {
        const src = read(rel);
        assert.doesNotMatch(src, /20\s*(?:to|To|-|–)\s*45|exceeds 45 seconds/i, `${rel} contains stale 20-45 / 45s copy`);
    }
});

// ---------------------------------------------------------------------------
// 5. Keyboard Controls Hardening Across Disabled Buttons & ALL Trivia Modes
// ---------------------------------------------------------------------------
test('resolveTriviaKeyAction advances on Enter/Space when focus stays on a disabled answer button, while protecting enabled buttons', () => {
    const disabledButtonTarget = {
        disabled: true,
        closest: (selector) => {
            if (selector.includes('input')) return null;
            if (selector.includes('button:not(:disabled)')) return null;
            return { disabled: true };
        },
    };
    const enabledButtonTarget = {
        disabled: false,
        closest: (selector) => {
            if (selector.includes('input')) return null;
            return { disabled: false };
        },
    };

    assert.deepEqual(
        resolveTriviaKeyAction({ key: 'Enter', target: disabledButtonTarget }, { canAdvance: true }),
        { type: 'advance' },
    );
    assert.deepEqual(
        resolveTriviaKeyAction({ key: ' ', target: disabledButtonTarget }, { canAdvance: true }),
        { type: 'advance' },
    );
    assert.equal(
        resolveTriviaKeyAction({ key: 'Enter', target: enabledButtonTarget }, { canAdvance: true }),
        null,
    );
});

test('every Trivia gameplay surface wires useTriviaKeyboardControls', () => {
    for (const rel of [
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/StrategyTrivia.jsx',
        'src/components/trivia/TimeAttackGame.jsx',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/tournaments.js',
        'pages/hub/trivia/study.js',
    ]) {
        assert.match(read(rel), /useTriviaKeyboardControls\s*\(/, `${rel} must wire useTriviaKeyboardControls`);
    }
});

// ---------------------------------------------------------------------------
// 6–10. Progress Outcomes, Card Pills Everywhere, Study CTAs & CSS Guards
// ---------------------------------------------------------------------------
test('StrategyTrivia passes outcomes to TriviaQuestionProgress and shows Study Your Misses CTA', () => {
    const src = read('src/components/trivia/StrategyTrivia.jsx');
    assert.match(src, /<TriviaQuestionProgress[\s\S]*outcomes=\{questionOutcomes\}/);
    assert.match(src, /href="\/hub\/trivia\/study"/);
    assert.match(src, /Study Your Misses/);
});

test('TournamentQuestionStage renders TriviaQuestionProgress, TriviaCardText, and rawOption on TriviaAnswerOption', () => {
    const src = read('src/components/trivia/tournaments/TournamentSections.jsx');
    assert.match(src, /<TriviaQuestionProgress/);
    assert.match(src, /<TriviaCardText\s+text=\{question\?\.question/);
    assert.match(src, /<TriviaAnswerOption[\s\S]*rawOption=\{String\(option\)\}/);
});

test('TriviaAnswerOption renders TriviaCardText and all gameplay option callers pass rawOption', () => {
    const optSrc = read('src/components/trivia/TriviaAnswerOption.jsx');
    assert.match(optSrc, /import TriviaCardText from '\.\/TriviaCardText'/);
    assert.match(optSrc, /<TriviaCardText/);

    for (const rel of [
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/tournaments/TournamentSections.jsx',
        'src/components/trivia/ClubTriviaNightsPanel.jsx',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
    ]) {
        assert.match(read(rel), /rawOption=/, `${rel} must pass rawOption to TriviaAnswerOption`);
    }
});

test('Study page renders TriviaCardText on drill options, flashcard options, and explanations', () => {
    const src = read('pages/hub/trivia/study.js');
    const cardTextCount = (src.match(/<TriviaCardText/g) || []).length;
    assert.ok(cardTextCount >= 6, `Expected >= 6 TriviaCardText usages in study.js, found ${cardTextCount}`);
});

test('PvP settled result screen includes a Study Your Misses CTA', () => {
    const src = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    assert.match(src, /href="\/hub\/trivia\/study"/);
    assert.match(src, /Study Your Misses/);
});

test('Stats grid and 4-box equal sizing CSS invariants stay locked', () => {
    const progressCss = read('src/styles/worlds/trivia-console-progress.css');
    assert.match(progressCss, /\.trivia-progress-content--stats\s*>\s*\*\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);

    const lobbyCss = read('src/components/trivia/TriviaLobby.module.css');
    assert.match(lobbyCss, /\.metric\s*\{[\s\S]*height:\s*52px/);
    assert.match(lobbyCss, /\.studyButton\s*\{[\s\S]*height:\s*52px/);
    assert.match(lobbyCss, /\.searchField\s*\{[\s\S]*height:\s*52px/);
});

// ---------------------------------------------------------------------------
// 11. Structured 3-Line Question Layout, Shorthand Cards & Decluttered Play Header
// ---------------------------------------------------------------------------
test('parseStructuredTriviaQuestion splits scenario into 3 clean lines and expands Q5s/pairs without board collisions', () => {
    const sample = 'You hold Q5s in BB vs BTN on the river (10BB effective, pot 30BB). Board: 7c 2d 9d 5d 3h. What is the GTO play?';
    const parsed = parseStructuredTriviaQuestion(sample);
    assert.equal(parsed.structured, true);
    assert.equal(parsed.setupLine, 'You hold Q5s in BB vs BTN on the river (10BB effective, pot 30BB).');
    assert.equal(parsed.boardLabel, 'The Board Is');
    assert.deepEqual(
        parsed.boardCards.map((c) => `${c.rankCode}${c.suitCode}`),
        ['7c', '2d', '9d', '5d', '3h'],
    );
    assert.equal(parsed.promptLine, 'What is the GTO play?');

    const setupCards = tokenizePokerCardText(parsed.setupLine, {
        expandHands: true,
        usedCards: parsed.usedCards,
    }).filter((t) => t.type === 'card');
    assert.deepEqual(
        setupCards.map((c) => `${c.rank}${c.symbol}`),
        ['Q♠', '5♠'],
        'Q5s on 7c 2d 9d 5d 3h must render as Q♠ 5♠ without colliding with 5d',
    );

    // Collision avoidance when spades collides with board (9s Qc 8c Ad 3h) -> picks hearts.
    const suitedCollision = parseStructuredTriviaQuestion(
        'You hold 98s in BB vs BTN on the river (10BB effective, pot 30BB). Board: 9s Qc 8c Ad 3h. What is the GTO play?',
    );
    const suitedCards = tokenizePokerCardText(suitedCollision.setupLine, {
        expandHands: true,
        usedCards: suitedCollision.usedCards,
    }).filter((t) => t.type === 'card');
    assert.deepEqual(suitedCards.map((c) => `${c.rank}${c.symbol}`), ['9♥', '8♥']);

    // Pocket pair collision avoidance (55 with 5h on board -> 5♠ 5♦).
    const pairCollision = parseStructuredTriviaQuestion(
        'You hold 55 in BB vs BTN on the river (10BB effective, pot 30BB). Board: 5h 8c Qd Qc 6h. What is the GTO play?',
    );
    const pairCards = tokenizePokerCardText(pairCollision.setupLine, {
        expandHands: true,
        usedCards: pairCollision.usedCards,
    }).filter((t) => t.type === 'card');
    assert.deepEqual(pairCards.map((c) => `${c.rank}${c.symbol}`), ['5♠', '5♦']);

    // Offsuit hand (A7o -> A♠ 7♥).
    const offsuit = parseStructuredTriviaQuestion('You hold A7o on the flop. Board: Qh Qs Jd. What is the GTO play?');
    const offsuitCards = tokenizePokerCardText(offsuit.setupLine, {
        expandHands: true,
        usedCards: offsuit.usedCards,
    }).filter((t) => t.type === 'card');
    assert.deepEqual(offsuitCards.map((c) => `${c.rank}${c.symbol}`), ['A♠', '7♥']);

    // Plain prose and percentages/BBs never trigger false card expansion.
    const prose = tokenizePokerCardText('As a player in a 3d arena, an Ad says Ah yes. Win 55% at 22BB.');
    assert.equal(prose.every((t) => t.type === 'text'), true);

    // All 52 playing-card PNGs exist on disk.
    for (const rank of ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']) {
        for (const suit of ['s', 'h', 'd', 'c']) {
            const rel = cardImagePath(rank, suit);
            assert.ok(fs.existsSync(path.join(ROOT, 'public', rel)), `Missing playing card asset public${rel}`);
        }
    }
});

test('StrategyTrivia declutters playing header and all Trivia question surfaces wire structured cards', () => {
    const strategySrc = read('src/components/trivia/StrategyTrivia.jsx');
    assert.doesNotMatch(strategySrc, /<section className="strategy-context"/, 'Decision Rail must not clutter the playing screen');
    assert.doesNotMatch(strategySrc, /className="tc-rows strategy-run-contract"/, 'Entry State / Session Expires must not clutter the playing screen');
    assert.doesNotMatch(strategySrc, /strategy-clock__label">Decision Clock/, 'Untimed Decision Clock label must not clutter the playing screen');
    assert.match(strategySrc, /<TriviaCardText[\s\S]*?structured/);

    for (const rel of [
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/TimeAttackGame.jsx',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'src/components/trivia/tournaments/TournamentSections.jsx',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/study.js',
    ]) {
        assert.match(read(rel), /<TriviaCardText[\s\S]*?structured/, `${rel} must pass structured to TriviaCardText`);
    }

    const consoleCss = read('src/styles/worlds/trivia-console.css');
    assert.match(consoleCss, /\.trivia-card-img--board\s*\{[\s\S]*width:\s*50px;[\s\S]*height:\s*70px;/);
});
