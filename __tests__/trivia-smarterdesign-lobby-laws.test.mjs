/**
 * Phase B Track 1 (#SMARTERDESIGN Foundation + Lobby + Settings + OG Card) Anti-Regression Laws:
 *  - Zero forbidden yellow/gold/amber/purple/violet/lavender/pink/magenta color literals,
 *    zero legacy gold ink tokens, and zero text-transform: uppercase across all owned files.
 *  - <TriviaConsole> adopts .smarterdesign and maps legacy gold/warning inks safely to ice blue.
 *  - TriviaLobby: visible #SMARTERDESIGN masthead (<h1>), zero broken <img> tags, Free (cost === 0)
 *    checked before VIP Free, zero showChargePopup double-modal, solo Continue Game recovery card
 *    respecting exact expiresAt, and >= 44px button touch targets.
 *  - Settings (/hub/trivia/settings): never calls applyGameSettings(cached) before an online
 *    signed-in cloud read settles.
 *  - OG Result Card SVG: zero #ffd700 gold text, single steel rim border, Title Case labels.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { buildResultCardSvg, computeTriviaGrade } from '../src/lib/trivia/socialGrowthHelpers.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const TRACK1_OWNED_FILES = [
    'src/styles/worlds/trivia.css',
    'src/styles/worlds/trivia-console.css',
    'src/styles/worlds/trivia-console-challenge.css',
    'src/styles/worlds/trivia-console-play.css',
    'src/styles/worlds/trivia-console-progress.css',
    'src/styles/worlds/trivia-console-pvp.css',
    'src/styles/worlds/trivia-console-strategy.css',
    'src/components/trivia/console/TriviaConsole.jsx',
    'src/components/trivia/console/TriviaConsole.module.css',
    'src/components/trivia/console/TriviaFrameCard.jsx',
    'src/components/trivia/console/TriviaFrameCard.module.css',
    'src/components/trivia/console/TriviaConsoleDialog.jsx',
    'src/components/trivia/console/TriviaConsoleDialog.module.css',
    'src/components/trivia/console/ResponsiveModeArt.jsx',
    'src/components/trivia/console/ResponsiveModeArt.module.css',
    'src/config/triviaModeRegistry.mjs',
    'src/lib/trivia/socialGrowthHelpers.mjs',
    'pages/hub/trivia/index.js',
    'src/components/trivia/TriviaLobby.jsx',
    'src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx',
    'src/components/trivia/competitive/CompetitiveLobbyBriefing.module.css',
    'src/components/trivia/StreakFreezeWidget.jsx',
    'src/components/trivia/StreakFreezeWidget.module.css',
    'src/components/trivia/MonthlyChampionshipPanel.jsx',
    'src/components/trivia/NightlyReminderButton.jsx',
    'src/components/trivia/TriviaSkeleton.jsx',
    'src/components/trivia/TriviaSkeleton.module.css',
    'src/components/trivia/TriviaErrorBoundary.jsx',
    'pages/hub/trivia/settings.js',
    'src/hooks/useTriviaPreferenceRuntime.js',
];

const FORBIDDEN_COLOR_AND_UPPERCASE_RE = new RegExp(
    [
        '#(?:ffd700|fbbf24|f59e0b|d97706|fef3c7|fde68a|fffbeb|78350f|facc15|fde047|eab308|ca8a04|a855f7|c084fc|e9d5ff|8b5cf6|9d4edd|9333ea|7c3aed|ec4899|f472b6|db2777|d946ef|e879f9)',
        '--tc-ink-gold',
        '\\.tc-ink--gold',
        'tc-ink--gold',
        '\\.ink_gold',
        '--trivia-gold',
        '--trivia-warning\\b',
        '--trivia-warning-text',
        '--trivia-purple',
        '--trivia-purple-text',
        'ink=["\']gold["\']',
        'tone=["\']gold["\']',
        'text-transform:\\s*uppercase',
        'textTransform:\\s*["\']uppercase["\']',
    ].join('|'),
    'i',
);

test('SMARTERDESIGN Track 1: zero forbidden yellow/gold/amber/purple/pink colors and zero uppercase CSS transforms across all owned files', () => {
    for (const rel of TRACK1_OWNED_FILES) {
        const src = read(rel);
        const match = src.match(FORBIDDEN_COLOR_AND_UPPERCASE_RE);
        assert.equal(
            match,
            null,
            `${rel} must not contain forbidden colors, gold ink tokens, or uppercase CSS transforms (matched: ${match?.[0]})`,
        );
    }
});

test('SMARTERDESIGN Track 1: TriviaConsole adopts .smarterdesign, maps legacy gold ink to ice blue, and enforces >= 44px controls', () => {
    const consoleJsx = read('src/components/trivia/console/TriviaConsole.jsx');
    const consoleCss = read('src/components/trivia/console/TriviaConsole.module.css');
    assert.match(consoleJsx, /smarterdesign sd-panel/);
    assert.match(consoleJsx, /if \(ink === 'gold'[\s\S]*return 'blue'/);
    assert.match(consoleCss, /min-height:\s*44px/);
});

test('SMARTERDESIGN Track 1: TriviaLobby has visible masthead <h1>, zero <img> tags, Free before VIP Free, zero showChargePopup, and solo Continue Game CTA', () => {
    const lobby = read('src/components/trivia/TriviaLobby.jsx');
    const indexPage = read('pages/hub/trivia/index.js');

    assert.match(lobby, /<header className="sd-masthead lobby-masthead">/);
    assert.match(lobby, /<h1 className="lobby-masthead__title">Poker Trivia<\/h1>/);
    assert.doesNotMatch(indexPage, /<h1 className="sr-only">/);
    assert.doesNotMatch(lobby, /<img\b/, 'Lobby must render zero broken raster <img> tags');
    assert.doesNotMatch(lobby, /showChargePopup/, 'Lobby must not render double-modal showChargePopup');

    // Free (cost === 0) MUST be checked before isVip
    const freeIdx = lobby.indexOf("if (!variableCost && cost === 0) return 'Free';");
    const ticketIdx = lobby.indexOf("if (arcadeTicketCount > 0 && modeId === 'arcade') return '1 Free Entry Ticket';");
    const vipIdx = lobby.indexOf("if (isVip) return 'VIP Free';");
    assert.ok(freeIdx > -1 && ticketIdx > -1 && vipIdx > -1, 'Entry pricing branches must all exist');
    assert.ok(freeIdx < ticketIdx && ticketIdx < vipIdx, 'Free must precede Ticket and VIP Free');

    // Solo Continue Game CTA respecting exact expiresAt
    assert.match(lobby, /readSoloRunRecovery/);
    assert.match(lobby, /record\.expiresAt && Date\.parse\(record\.expiresAt\) <= now/);
    assert.match(lobby, /Continue Game/);
    assert.match(lobby, /min-height:\s*44px/);
});

test('SMARTERDESIGN Track 1: Settings does not overwrite localStorage with cached defaults before online cloud read settles', () => {
    const settings = read('pages/hub/trivia/settings.js');
    assert.match(settings, /smarterdesign trivia-progress-page/);
    assert.match(
        settings,
        /if \(!resolvedUserId \|\| !online\) \{\s*applyGameSettings\(cached\);\s*\}/,
        'applyGameSettings(cached) on identity change must only run when signed out or offline',
    );
});

test('SMARTERDESIGN Track 1: OG result card SVG uses ice blue (#86daff), single steel rim, and Title Case labels', () => {
    const gradeS = computeTriviaGrade(10, 10);
    assert.equal(gradeS.accent, '#86daff');

    const svg = buildResultCardSvg({
        mode: 'daily',
        score: 10,
        total: 10,
        diamonds: 10,
        streak: 5,
        player: 'Player',
        verified: true,
        verificationId: 'abc12345',
    });
    assert.doesNotMatch(svg, /#ffd700/i);
    assert.match(svg, /Smarter\.Poker Trivia/);
    assert.match(svg, /Question Ledger/);
    assert.doesNotMatch(svg, /SMARTER\.POKER TRIVIA/);
    assert.doesNotMatch(svg, /QUESTION LEDGER/);
    assert.doesNotMatch(svg, /x="44" y="44" width="1112" height="542"/, 'Double nested border rect must be collapsed to one steel rim');
});
