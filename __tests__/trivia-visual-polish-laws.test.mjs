import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toTitleCase } from '../src/lib/trivia/titleCase.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('toTitleCase preserves canonical poker and technical acronyms including TDA, WSOP, PLO4/5/8, UTG, ICM', () => {
    assert.equal(
        toTitleCase('Under TDA tournament rules for WSOP PLO and UTG ICM'),
        'Under TDA Tournament Rules For WSOP PLO And UTG ICM',
    );
    assert.equal(
        toTitleCase('In TDA-governed events, PLO4 PLO5 PLO8 NLH NLHE WPT EPT BTN SB BB MP CO HJ LJ'),
        'In TDA-Governed Events, PLO4 PLO5 PLO8 NLH NLHE WPT EPT BTN SB BB MP CO HJ LJ',
    );
    assert.equal(
        toTitleCase('SPR EV GTO HUD VPIP PFR MTT SNG RNG ROI API URL ID UUID CT UTC VIP ELO MFA SMS PWA'),
        'SPR EV GTO HUD VPIP PFR MTT SNG RNG ROI API URL ID UUID CT UTC VIP ELO MFA SMS PWA',
    );
    assert.equal(
        toTitleCase('Under TDA rules (PLO8), check AKs and 9c9d.'),
        'Under TDA Rules (PLO8), Check AKs And 9c9d.',
    );
});

test('PvP top Elo strip renders exact integer Elo with zero K truncation and global flex spacing', () => {
    const pvpPage = read('pages/hub/trivia/pvp.js');
    const pvpCss = read('src/styles/worlds/trivia-console-pvp.css');
    const pvpExp = read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx');

    assert.match(pvpPage, /function formatExactElo\(/);
    assert.match(pvpPage, /toLocaleString\('en-US'\)/);
    assert.doesNotMatch(pvpPage, /formatTriviaDisplayNumber\(rating\.elo\)/);
    assert.doesNotMatch(pvpPage, /formatTriviaDisplayNumber\(rating\.peakElo\)/);
    assert.doesNotMatch(pvpPage, /formatCompact/);
    assert.doesNotMatch(pvpExp, /formatCompact/);
    assert.match(pvpPage, /\{formatExactElo\(rating\.elo\)\} Elo/);
    assert.match(pvpPage, /Peak \{formatExactElo\(rating\.peakElo\)\}/);
    assert.match(pvpPage, /Ranked PvP Elo<\/span>\s*\{' '\}/);

    assert.match(pvpCss, /\.trivia-pvp-elo-banner\s*\{[\s\S]{0,400}display:\s*flex/);
    assert.match(pvpCss, /\.trivia-pvp-elo-banner__meta\s*\{[\s\S]{0,300}gap:\s*8px 14px/);
    assert.match(pvpCss, /\.trivia-pvp-elo-badge\s*\{/);
});

test('Lobby uses singular Diamond grammar and reports visible games and server-owned availability counts', () => {
    const briefing = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx');
    const lobby = read('src/components/trivia/TriviaLobby.jsx');

    assert.match(briefing, /function formatDiamondMetric\(/);
    assert.match(briefing, /Math\.abs\(value\) === 1 \? 'Diamond' : 'Diamonds'/);
    assert.match(briefing, /formatDiamondMetric\(featuredTournament\?\.rakePerEntry\)/);
    assert.doesNotMatch(briefing, /formatMetric\(featuredTournament\?\.rakePerEntry,\s*' Diamonds'\)/);

    assert.match(lobby, /cost === 1 \? 'Diamond' : 'Diamonds'/);
    assert.match(lobby, /filteredModes\.filter\(\(mode\) => availabilityFor\(mode\.id\)\.enabled\)\.length/);
    assert.match(lobby, /maintenanceModeCount = filteredModes\.length - liveModeCount/);
    assert.match(lobby, /\{filteredModes\.length\} \{filteredModes\.length === 1 \? 'Game' : 'Games'\}/);
    assert.match(lobby, /\{liveModeCount\} Live\. \{maintenanceModeCount\} In Maintenance\./);
});

test('Study SRS tabs have uniform row height, spaced label/count, and reduced-motion guard', () => {
    const study = read('pages/hub/trivia/study.js');

    assert.match(study, /<span>\{tab\.label\}<\/span>\s*\{' '\}\s*<span className="study-mode-tab__count">/);
    assert.match(study, /\.study-mode-tabs\s*\{[\s\S]{0,220}grid-auto-rows:\s*1fr/);
    assert.match(study, /\.study-mode-tab\s*\{[\s\S]{0,400}height:\s*100%/);
    assert.match(study, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('Settled results deduplicate Share/Review buttons and raise Settlement Receipt UUID/hash contrast', () => {
    const result = read('src/components/trivia/TriviaResult.jsx');
    const receipt = read('src/components/trivia/phase9/Phase9SettlementReceipt.jsx');
    const consoleCss = read('src/styles/worlds/trivia-console.css');

    assert.match(result, /Share Result Card/);
    assert.doesNotMatch(result, /Share Score Card/);
    assert.doesNotMatch(result, />Review Questions</);
    assert.match(result, /Back To Lobby/);

    assert.match(receipt, /Share Result Card/);
    assert.match(receipt, /Review Answers/);
    assert.doesNotMatch(receipt, /Share Score Card/);
    assert.match(receipt, /className="tc-ink--white" data-preserve-case="true"\{?\}?|>\{sessionId\}</);
    assert.match(consoleCss, /\.phase9-settlement__rows dd\s*\{[\s\S]{0,120}#f2f7ff/);
    assert.match(consoleCss, /\.phase9-settlement__transactions small\s*\{[\s\S]{0,120}#bdd0e2/);
});

test('Animations use composited transform/opacity, PrizeWheel has will-change: transform, and reduced-motion is honored', () => {
    const wheelCss = read('src/components/trivia/PrizeWheel.module.css');
    const consoleModCss = read('src/components/trivia/console/TriviaConsole.module.css');
    const answerOpt = read('src/components/trivia/TriviaAnswerOption.jsx');
    const consoleCss = read('src/styles/worlds/trivia-console.css');

    assert.match(wheelCss, /\.wheel\s*\{[\s\S]{0,260}will-change:\s*transform/);
    assert.match(wheelCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,200}will-change:\s*auto/);
    assert.match(consoleModCss, /\.plate:active:not\(:disabled\)\s*\{[\s\S]{0,80}transform:\s*scale\(/);
    assert.match(consoleModCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,220}transition:\s*none/);
    assert.match(answerOpt, /'data-reveal':\s*showResult \? 'true' : undefined/);
    assert.match(consoleCss, /@keyframes triviaAnswerReveal/);
    assert.match(consoleCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]{0,400}animation:\s*none/);
});

test('Admin Pool uses canonical #4ade80 green (zero #22c55e), >= 44px Reload & checkbox targets, and Admin Ops formats pills/holder', () => {
    const pool = read('pages/admin/trivia-pool.js');
    const ops = read('pages/admin/trivia-operations.js');

    assert.doesNotMatch(pool, /#22c55e/i, 'trivia-pool.js must not use forbidden #22c55e');
    assert.doesNotMatch(pool, /rgba\(\s*34\s*,\s*197\s*,\s*94/i, 'trivia-pool.js must not use rgba(34, 197, 94, ...)');
    assert.match(pool, /rgba\(74,\s*222,\s*128,\s*0\.55\)/);
    assert.match(pool, /minWidth:\s*44,\s*minHeight:\s*44[\s\S]{0,80}>Reload</);
    assert.doesNotMatch(pool, /type=["']checkbox["']/, 'trivia-pool.js must use 44x44px accessible role="checkbox" buttons instead of raw 13px checkboxes');
    assert.match(pool, /role="checkbox"/);

    assert.match(ops, /data-capabilities-pills="true"/);
    assert.match(ops, /<Metric label="Current holder" value=\{scheduler\.lease\?\.holder_id\} span=\{2\} mono \/>/);
});

test('Zero forbidden warm/purple colors across owned Trivia visual polish files', () => {
    const forbiddenHex = /#(?:f59e0b|fbbf24|ffd700|eab308|d97706|a855f7|9333ea|8b5cf6|c084fc|ec4899|22c55e)\b/i;
    const ownedFiles = [
        'pages/hub/trivia/pvp.js',
        'src/styles/worlds/trivia-console-pvp.css',
        'pages/admin/trivia-pool.js',
        'pages/admin/trivia-operations.js',
        'src/components/trivia/TriviaResult.jsx',
        'src/components/trivia/phase9/Phase9SettlementReceipt.jsx',
        'src/components/trivia/TriviaLobby.jsx',
        'src/components/trivia/TriviaLobby.module.css',
        'src/config/triviaLobbyPresentation.mjs',
        'src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx',
        'pages/hub/trivia/study.js',
        'src/components/trivia/PrizeWheel.module.css',
        'src/components/trivia/TriviaAnswerOption.jsx',
        'src/components/trivia/console/TriviaConsole.module.css',
    ];
    for (const rel of ownedFiles) {
        const src = read(rel);
        assert.doesNotMatch(src, forbiddenHex, `${rel} must contain zero forbidden colors`);
    }
});
