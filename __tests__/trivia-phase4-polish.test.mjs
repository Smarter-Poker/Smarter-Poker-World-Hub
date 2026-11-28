/**
 * Permanent anti-regression hardening tests for Trivia Phase 4 Polish:
 * 1. Multi-street narrative board extraction & street gap tagging
 * 2. Card image path extraction & zero-latency background preloading
 * 3. Service worker CacheFirst caching for /cards/optimized/
 * 4. Mini real playing cards inside answers & coaching explanations
 * 5. Decluttered single-line playing headers across all Trivia modes
 * 6. 1v1 PvP live 15-30s radar progress, match-found audio/haptic cue & hidden internal UUIDs
 * 7. Auto-Advance On Correct preference + one-tap Train Similar Spot coaching bridge
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    parseStructuredTriviaQuestion,
    extractQuestionCardImagePaths,
} from '../src/lib/trivia/pokerCardText.mjs';
import {
    preloadQuestionCards,
    preloadTriviaDeckAhead,
} from '../src/lib/trivia/preloadTriviaCards.js';

const REPO = process.cwd();
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

test('Phase 4 Law 1: narrative multi-street Flop/Turn/River extracts into large board tray with street tags', () => {
    const q = 'You hold As Kh on the BTN. Flop is 8c 7d 3s and villain checks. Turn is 3c and villain leads half pot. River is Ts and villain shoves. What is the best GTO play?';
    const parsed = parseStructuredTriviaQuestion(q);

    assert.equal(parsed.structured, true);
    assert.equal(parsed.boardLabel, 'The Board Is');
    assert.equal(parsed.boardCards.length, 5);
    assert.deepEqual(
        parsed.boardCards.map((c) => `${c.rankCode}${c.suit}:${c.street}`),
        ['8clubs:flop', '7diamonds:flop', '3spades:flop', '3clubs:turn', 'Tspades:river'],
    );
    assert.equal(parsed.promptLine, 'What is the best GTO play?');
});

test('Phase 4 Law 2: explicit Board clause tags flop, turn, and river streets cleanly', () => {
    const q = 'You hold Q5s in BB vs BTN on the river (10BB effective, pot 30BB). Board: 7c 2d 9d 5d 3h. What is the GTO play?';
    const parsed = parseStructuredTriviaQuestion(q);

    assert.equal(parsed.structured, true);
    assert.equal(parsed.boardCards.length, 5);
    assert.deepEqual(
        parsed.boardCards.map((c) => c.street),
        ['flop', 'flop', 'flop', 'turn', 'river'],
    );
});

test('Phase 4 Law 3: extractQuestionCardImagePaths collects unique hero, board, and option card PNGs', () => {
    const paths = extractQuestionCardImagePaths({
        question: 'You hold Q5s on the river. Board: 7c 2d 9d 5d 3h. What is the GTO play?',
        options: ['Value bet with Q5s', 'Check back and bluff Ah Kh on brick rivers', 'Fold', 'Jam'],
    });

    assert.ok(paths.includes('/cards/optimized/spades_q.png'), 'hero Qs path included');
    assert.ok(paths.includes('/cards/optimized/spades_5.png'), 'hero 5s path included');
    assert.ok(paths.includes('/cards/optimized/clubs_7.png'), 'board 7c path included');
    assert.ok(paths.includes('/cards/optimized/diamonds_2.png'), 'board 2d path included');
    assert.ok(paths.includes('/cards/optimized/hearts_3.png'), 'board 3h path included');
    assert.ok(paths.includes('/cards/optimized/hearts_a.png'), 'option Ah path included');
    assert.ok(paths.includes('/cards/optimized/hearts_k.png'), 'option Kh path included');
    assert.equal(new Set(paths).size, paths.length, 'extracted card image paths must be deduplicated');
});

test('Phase 4 Law 4: preloadQuestionCards and preloadTriviaDeckAhead are SSR-safe, deduplicated, and bounded', () => {
    assert.deepEqual(preloadQuestionCards('You hold As Kh.'), []);
    assert.deepEqual(preloadTriviaDeckAhead([], 0, 2), []);
    assert.deepEqual(preloadTriviaDeckAhead([{ question: 'You hold As Kh.' }], 0, 2), []);

    // Verify browser lookahead & deduplication behavior cleanly.
    const loadedSrcs = [];
    const prevWindow = globalThis.window;
    globalThis.window = {
        Image: class MockImage {
            set src(val) {
                loadedSrcs.push(val);
            }
        },
    };
    try {
        const deck = [
            { question: 'Current: You hold As Kh.' },
            { question: 'Next 1: You hold Q5s. Board: 7c 2d 9d 5d 3h.' },
            { question: 'Next 2: You hold JTs. Board: 7c 2d 9d.' },
            { question: 'Next 3 (out of lookahead=2): You hold 2c 3c.' },
        ];
        const queued = preloadTriviaDeckAhead(deck, 0, 2);
        assert.ok(queued.includes('/cards/optimized/spades_q.png'));
        assert.ok(queued.includes('/cards/optimized/spades_j.png'));
        assert.ok(!queued.includes('/cards/optimized/clubs_2.png'), 'lookahead=2 must not eagerly fetch index+3');
        // Second call for overlapping question should deduplicate already-cached URLs.
        const secondQueued = preloadQuestionCards(deck[1]);
        assert.deepEqual(secondQueued, []);
        assert.equal(new Set(loadedSrcs).size, loadedSrcs.length);
    } finally {
        if (prevWindow === undefined) delete globalThis.window;
        else globalThis.window = prevWindow;
    }
});

test('Phase 4 Law 5: worker/index.js caches /cards/optimized/ with CacheFirst strategy', () => {
    const sw = read('worker/index.js');
    assert.match(sw, /PA_ARENA_CACHE_FIRST_PREFIXES\s*=\s*\[[\s\S]*'\/cards\/optimized\/'/);
});

test('Phase 4 Law 6: TriviaCardText supports mini cardStyle and street-gap spacing, wired into answers & explanations', () => {
    const cardText = read('src/components/trivia/TriviaCardText.jsx');
    assert.match(cardText, /cardStyle\s*===\s*'mini'/);
    assert.match(cardText, /size === 'mini'\s*\?\s*\{\s*width:\s*22,\s*height:\s*31\s*\}/);
    assert.match(cardText, /trivia-card-img--\$\{size\}/);
    assert.match(cardText, /trivia-card-img--street-gap/);

    const option = read('src/components/trivia/TriviaAnswerOption.jsx');
    assert.match(option, /cardStyle="mini"/);

    for (const file of [
        'src/components/trivia/StrategyTrivia.jsx',
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'pages/hub/trivia/study.js',
    ]) {
        const src = read(file);
        assert.match(src, /cardStyle="mini"/, `${file} must render mini cards in answers/explanations`);
    }
});

test('Phase 4 Law 7: lookahead card preloading is wired across all Trivia gameplay modes', () => {
    for (const file of [
        'src/components/trivia/StrategyTrivia.jsx',
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/TimeAttackGame.jsx',
        'src/components/trivia/pvp/PvpCompetitiveExperience.jsx',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
    ]) {
        const src = read(file);
        assert.match(src, /preloadTriviaDeckAhead/, `${file} must wire background card preloading`);
    }
});

test('Phase 4 Law 8: all Trivia playing modes use decluttered single-line topbar without duplicate progress bars', () => {
    const strategy = read('src/components/trivia/StrategyTrivia.jsx');
    assert.match(strategy, /className="game-top-bar"/, 'StrategyTrivia.jsx must use clean .game-top-bar header');
    assert.match(strategy, /<TriviaQuestionProgress/, 'StrategyTrivia.jsx must render slim TriviaQuestionProgress ticker');

    for (const file of [
        'src/components/trivia/TriviaGame.jsx',
        'src/components/trivia/tournaments/TournamentSections.jsx',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
    ]) {
        const src = read(file);
        assert.match(src, /trivia-play-topbar/, `${file} must use clean .trivia-play-topbar header`);
    }

    for (const file of [
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/mixed.js',
    ]) {
        const src = read(file);
        assert.doesNotMatch(src, /<progress\b/, `${file} must not render a duplicate native <progress> bar alongside TriviaQuestionProgress`);
    }
});

test('Phase 4 Law 9: 1v1 PvP renders live matchmaking radar, match-found audio/haptics, and hides raw internal UUID rows', () => {
    const pvp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');
    assert.match(pvp, /trivia-pvp-radar/);
    assert.match(pvp, /cardDealWhoosh\(\)/);
    assert.match(pvp, /triggerTriviaHaptic\('correct'\)/);

    // Raw Ticket/Match UUID rows must not clutter live searching, dealing, or waiting sidebars.
    assert.doesNotMatch(pvp, /\{\s*label:\s*'Ticket',\s*value:\s*ticket\.id/);
    assert.doesNotMatch(pvp, /\{\s*label:\s*'Match',\s*value:\s*match\.id/);
});

test('Phase 4 Law 10: autoAdvanceOnCorrect preference is normalized, exposed in Settings, and wired into Trivia & Strategy play', () => {
    const prefs = read('src/services/triviaPreferences.js');
    assert.match(prefs, /autoAdvanceOnCorrect:\s*false/);
    assert.match(prefs, /BOOLEAN_KEYS\s*=\s*Object\.freeze\(\[[\s\S]*'autoAdvanceOnCorrect'/);

    const runtime = read('src/hooks/useTriviaPreferenceRuntime.js');
    assert.match(runtime, /export function isTriviaAutoAdvanceEnabled/);

    const settings = read('pages/hub/trivia/settings.js');
    assert.match(settings, /id="trivia-setting-auto-advance"/);
    assert.match(settings, /label="Auto-Advance On Correct"/);
    assert.match(settings, /autoAdvanceOnCorrect:\s*preferences\.autoAdvanceOnCorrect === true/);

    for (const file of [
        'src/components/trivia/StrategyTrivia.jsx',
        'src/components/trivia/TriviaGame.jsx',
    ]) {
        const src = read(file);
        assert.match(src, /isTriviaAutoAdvanceEnabled/, `${file} must read auto-advance preference`);
    }
});

test('Phase 4 Law 11: StrategyTrivia missed-question coaching bridges directly to Train Similar Spot and Study My Misses', () => {
    const strategy = read('src/components/trivia/StrategyTrivia.jsx');
    assert.match(strategy, /getTrainingSpotForCategory/);
    assert.match(strategy, /Train Similar Spot:/);
    assert.match(strategy, /\/hub\/trivia\/study/);
    assert.match(strategy, /trivia-coaching-actions/);
});

test('Phase 4 Law 12: trivia-console.css defines all Phase 4 layout classes cleanly', () => {
    const css = read('src/styles/worlds/trivia-console.css');
    for (const selector of [
        '.trivia-card-img--mini',
        '.trivia-card-img--street-gap',
        '.trivia-play-topbar',
        '.trivia-pvp-radar',
        '.trivia-coaching-actions',
    ]) {
        assert.ok(css.includes(selector), `trivia-console.css must define ${selector}`);
    }
});
