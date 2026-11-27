/**
 * Phase 3 Trivia Enhancements & Competitive Guarantees Regression Suite:
 *  - 1v1 PvP Smarter Horse <= 30s fallback (`pvp.standard@2`, 15..30s uniform draw)
 *  - Daily Nightly Tournament 100% full bracket horse fill at start time + treasury ceiling headroom
 *  - Equal-sized 4 boxes below Play Daily Trivia (`.metrics` + `.discoveryRow` grid & fixed heights)
 *  - SSR JSON-LD preservation (`HubPageSummarySchema`) across all 8 Trivia pages
 *  - Desktop above-the-fold hero compression (`ResponsiveModeArt` max-height 260px at >= 900px)
 *  - Bespoke Study Your Misses artwork (`TRIVIA_STUDY_ART` in `public/images/trivia/study-v1/`)
 *  - Safe poker card tokenizer (`tokenizePokerCardText`) & inline card pills
 *  - Keyboard shortcut resolver (`resolveTriviaKeyAction`) & gameplay wiring
 *  - Post-game Study Your Misses CTA when misses > 0
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { tokenizePokerCardText } from '../src/lib/trivia/pokerCardText.mjs';
import { TRIVIA_STUDY_ART } from '../src/config/triviaStudyArt.mjs';
import {
    PVP_HORSE_WAIT_MAX_SECONDS,
    PVP_HORSE_WAIT_MIN_SECONDS,
} from '../src/lib/trivia/pvpMatchmakingPolicy.mjs';
import { currentRules, getRulesVersion } from '../src/lib/trivia/rules/index.mjs';
import { gradeNightlyBurnIn } from '../scripts/trivia/verify-nightly-burnin.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('1v1 PvP Smarter Horse contract enforces <= 30s uniform draw (15..30s) in rules, policy, and migration', () => {
    assert.equal(PVP_HORSE_WAIT_MIN_SECONDS, 15);
    assert.equal(PVP_HORSE_WAIT_MAX_SECONDS, 30);

    const v1 = getRulesVersion('pvp.standard@1');
    const v2 = currentRules('pvp.standard');
    assert.ok(v1 && v2);
    assert.equal(v2.id, 'pvp.standard@2');
    assert.deepEqual(v1.rules.horse.fallback_wait_seconds, { min: 20, max: 45 });
    assert.deepEqual(v2.rules.horse.fallback_wait_seconds, { min: 15, max: 30 });

    const sql = read('supabase/migrations/20261127230000_trivia_pvp_30s_horse_and_full_nightly_bracket.sql');
    assert.match(sql, /'pvp\.standard@2'/);
    assert.match(sql, /RETURN 15 \+ \(v_n % 16\)::integer;/);
    assert.match(sql, /IF p_wait_seconds IS NOT NULL AND p_wait_seconds NOT BETWEEN 15 AND 30 THEN/);
    assert.match(sql, /horse_wait_seconds BETWEEN 15 AND 45/);
});

test('Nightly Tournament full-bracket horse fill preserves human seats during registration and fills 100% at lock', () => {
    const sql = read('supabase/migrations/20261127230000_trivia_pvp_30s_horse_and_full_nightly_bracket.sql');
    assert.match(sql, /treasury_daily_subsidy_ceiling',\s*10000/);
    assert.match(sql, /treasury_exposure_ceiling',\s*10000/);
    assert.match(sql, /current_setting\('app\.trivia_tournament_final_fill', true\) = 'on'/);
    assert.match(sql, /v_is_final_lock := \(v_now >= t\.registration_closes_at OR v_now >= t\.start_time\);/);
    assert.match(sql, /GREATEST\(t\.horse_target, GREATEST\(0, t\.bracket_capacity - v_humans\)\)/);

    // Burn-in scorecard accepts both historical horse_target exact nights AND full 256-seat horse fill nights.
    const report = gradeNightlyBurnIn([
        {
            tournament_id: '00000000-0000-4000-8000-000000000001',
            scheduled_local_date: '2026-11-26',
            start_time: '2026-11-27T02:00:00.000Z',
            lifecycle_state: 'settled',
            horse_target: 129,
            horses_entered: 129,
            humans_entered: 0,
            bracket_capacity: 256,
            start_delay_seconds: 5,
            charged_entrants: 129,
            excluded_charged_entrants: 0,
            event_duration_seconds: 1800,
            event_budget_seconds: 3600,
            stuck_rounds: 0,
            settlement_state: 'settled',
            settlement_latency_seconds: 12,
            settlement_sla_seconds: 60,
            escrow_balance: 0,
            ledger_variance: 0,
        },
        {
            tournament_id: '00000000-0000-4000-8000-000000000002',
            scheduled_local_date: '2026-11-27',
            start_time: '2026-11-28T02:00:00.000Z',
            lifecycle_state: 'settled',
            horse_target: 97,
            horses_entered: 256,
            humans_entered: 0,
            bracket_capacity: 256,
            start_delay_seconds: 6,
            charged_entrants: 256,
            excluded_charged_entrants: 0,
            event_duration_seconds: 2100,
            event_budget_seconds: 3600,
            stuck_rounds: 0,
            settlement_state: 'settled',
            settlement_latency_seconds: 14,
            settlement_sla_seconds: 60,
            escrow_balance: 0,
            ledger_variance: 0,
        },
    ], {
        startDate: '2026-11-26',
        days: 2,
        ledgerHealth: { healthy: true, exception_count: 0 },
    });

    assert.equal(report.certified, true);
    assert.equal(report.scorecard, '2/2');
    assert.equal(report.nights[0].slos.horse_target_exact.passed, true);
    assert.equal(report.nights[1].slos.horse_target_exact.passed, true);
    assert.match(report.nights[1].slos.horse_target_exact.detail, /256\/256 horses/);
});

test('all 4 boxes below Play Daily Trivia enforce identical 1fr column tracks and heights', () => {
    const css = read('src/components/trivia/TriviaLobby.module.css');
    assert.match(css, /\.metrics\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(css, /\.discoveryRow\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    assert.match(css, /\.metric\s*\{[\s\S]*?height:\s*52px;[\s\S]*?min-height:\s*52px;/);
    assert.match(css, /\.studyButton\s*\{[\s\S]*?height:\s*52px;[\s\S]*?min-height:\s*52px;/);
    assert.match(css, /\.searchField\s*\{[\s\S]*?height:\s*52px;[\s\S]*?min-height:\s*52px;/);
    assert.match(css, /\.metric,\s*\.studyButton,\s*\.searchField\s*\{[\s\S]*?height:\s*64px;[\s\S]*?min-height:\s*64px;/);
});

test('SSR JSON-LD schema is emitted directly in Head on all 8 Trivia pages while keeping visual pages clean', () => {
    const hubSummary = read('src/components/seo/HubPageSummary.js');
    assert.match(hubSummary, /export function HubPageSummarySchema\(/);
    assert.match(hubSummary, /key=\{`hub-summary-schema-\$\{resolvedPage\}`\}/);

    const expected = [
        ['pages/hub/trivia/index.js', 'trivia'],
        ['pages/hub/trivia/leaderboard.js', 'trivia-leaderboard'],
        ['pages/hub/trivia/pvp.js', 'trivia-pvp'],
        ['pages/hub/trivia/tournaments.js', 'trivia-tournaments'],
        ['pages/hub/trivia/endless.js', 'trivia-endless'],
        ['pages/hub/trivia/survival-game.js', 'trivia-survival'],
        ['pages/hub/trivia/time-attack.js', 'trivia-time-attack'],
        ['pages/hub/trivia/mixed.js', 'trivia-mixed'],
    ];
    for (const [file, pageKey] of expected) {
        const src = read(file);
        assert.match(src, new RegExp(`<HubPageSummarySchema\\s+page="${pageKey}"\\s*/>`), `${file} must emit SSR JSON-LD`);
    }
});

test('bespoke Study Your Misses artwork exists on disk and replaces duplicated stats art', () => {
    assert.equal(TRIVIA_STUDY_ART.key, 'study');
    assert.match(TRIVIA_STUDY_ART.preview, /^data:image\/webp;base64,/);
    const urls = [
        ...TRIVIA_STUDY_ART.mobile.avif.split(','),
        ...TRIVIA_STUDY_ART.mobile.webp.split(','),
        ...TRIVIA_STUDY_ART.wide.avif.split(','),
        ...TRIVIA_STUDY_ART.wide.webp.split(','),
    ].map((entry) => entry.trim().split(/\s+/)[0]);
    assert.equal(urls.length, 12);
    for (const url of urls) {
        assert.match(url, /^\/images\/trivia\/study-v1\/study-(mobile|wide)-(640|960|1440)\.[0-9a-f]{10}\.(avif|webp)$/);
        assert.ok(existsSync(join(ROOT, 'public', url)), `${url} exists in public/`);
    }
    const studyPage = read('pages/hub/trivia/study.js');
    assert.match(studyPage, /art=\{TRIVIA_STUDY_ART\}/);
    assert.doesNotMatch(studyPage, /TRIVIA_INTRO_ART\.stats/);
});

test('poker card text tokenizer renders hands and boards accurately without mangling English words', () => {
    // Plain English words like "As", "Ad", "Ah", "3d" must remain text.
    const prose = tokenizePokerCardText('As a player in a 3d arena, an Ad says Ah yes.');
    assert.equal(prose.every((t) => t.type === 'text'), true, 'plain prose must not produce false-positive cards');

    // Paired poker hands (even starting with "As") MUST render as cards.
    const hand = tokenizePokerCardText('You hold As Kh on a Qc Jd 2s flop.');
    const cards = hand.filter((t) => t.type === 'card').map((t) => `${t.rank}${t.symbol}`);
    assert.deepEqual(cards, ['A♠', 'K♥', 'Q♣', 'J♦', '2♠']);

    // Glued hands and Unicode suit symbols work cleanly.
    const glued = tokenizePokerCardText('Hero 3-bets AcKc against 10♠9♠ on Ah-Kd-7c.');
    const gluedCards = glued.filter((t) => t.type === 'card').map((t) => `${t.rank}${t.symbol}`);
    assert.deepEqual(gluedCards, ['A♣', 'K♣', '10♠', '9♠', 'A♥', 'K♦', '7♣']);
});

test('keyboard shortcuts, card pills, segmented progress, and Study Your Misses CTA are wired across gameplay surfaces', () => {
    assert.match(read('src/components/trivia/TriviaGame.jsx'), /<TriviaQuestionProgress\b/);
    assert.match(read('src/components/trivia/TriviaGame.jsx'), /<TriviaCardText\b/);
    assert.match(read('src/components/trivia/TriviaResult.jsx'), /Study Your Misses/);
    assert.match(read('src/components/trivia/phase9/Phase9SettlementReceipt.jsx'), /Study Your Misses/);
    assert.match(read('src/components/trivia/TimeAttackGame.jsx'), /useTriviaKeyboardControls\(/);
    assert.match(read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx'), /useTriviaKeyboardControls\(/);
    assert.match(read('pages/hub/trivia/endless.js'), /useTriviaKeyboardControls\(/);
    assert.match(read('pages/hub/trivia/survival-game.js'), /useTriviaKeyboardControls\(/);
    assert.match(read('pages/hub/trivia/mixed.js'), /useTriviaKeyboardControls\(/);
    assert.match(read('pages/hub/trivia/study.js'), /useTriviaKeyboardControls\(/);
});
