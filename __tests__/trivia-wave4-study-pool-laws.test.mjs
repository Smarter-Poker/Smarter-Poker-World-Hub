/**
 * Wave 4 Track 3 (Study Spaced-Repetition Deck, Zero-Reward Miss Drill &
 * 10x Operator Curation Workbench) Anti-Regression Laws:
 *
 *  1. Pure Leitner spaced-repetition logic in studySpacedRepetition.mjs:
 *     - recordStudyReview progresses boxes 1 -> 2 (1d) -> 3 (3d) -> 4 (7d) -> 4 (7d)
 *       and resets to box 1 (due immediately) on miss, without mutating input state.
 *     - partitionStudyDeck partitions dueToday, weakestCategory, weakestCategoryItems,
 *       mastered, and counts deterministically.
 *     - buildMissDrillQuestions filters out invalid items, respects limit, and orders
 *       due + weakest items first deterministically.
 *     - Account-scoped localStorage helpers isolate keys by userId and recover from
 *       corrupted JSON safely.
 *  2. Zero-Reward Miss Drill & SRS Study Deck in pages/hub/trivia/study.js:
 *     - NEVER calls /api/trivia/session-start or /api/trivia/session-submit.
 *     - Displays zero-reward notice and data-start-miss-drill="true".
 *     - Renders Due Today, Weakest Category, All Misses, Mastered tabs (>= 44px).
 *     - Preserves accessible >= 44px role="switch" button (zero raw checkboxes).
 *  3. 10x Operator Curation Workbench in pages/admin/trivia-pool.js:
 *     - Thin-category quick filter pills (All, Rules & Etiquette, Cash Game,
 *       MTT Situations, ICM & Chip EV).
 *     - Select Top 10 Clean (100/100) stages selection only (never auto-submits).
 *     - Keyboard hotkeys (J/K, Space, A, Q, 1/2/3) strictly guarded against
 *       INPUT/TEXTAREA/SELECT/isContentEditable focus.
 *     - Preserves isolated loadWorkbench() try/catch, full receiptId, and MFA handling.
 *  4. #SMARTERDESIGN Fortress: 0 forbidden yellow/gold/amber/orange/purple/pink hex colors,
 *     0 text-transform: uppercase, and 0 em-dashes across all 3 owned files.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    buildMissDrillQuestions,
    getStudySrsStorageKey,
    LEITNER_INTERVAL_DAYS,
    loadStudySrsState,
    MS_PER_DAY,
    partitionStudyDeck,
    recordStudyReview,
    saveStudySrsState,
} from '../src/lib/trivia/studySpacedRepetition.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function hexToRgb(hex) {
    let raw = hex.slice(1);
    if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('');
    if (raw.length !== 6) return null;
    return [
        Number.parseInt(raw.slice(0, 2), 16),
        Number.parseInt(raw.slice(2, 4), 16),
        Number.parseInt(raw.slice(4, 6), 16),
    ];
}

function isForbiddenHueHex(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const [r, g, b] = rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    if (delta < 25) return false;
    let hue = 0;
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    return (hue >= 15 && hue <= 75) || (hue >= 255 && hue <= 345);
}

test('Wave 4 Law 1: recordStudyReview progresses Leitner boxes 1->2->3->4 (0d/1d/3d/7d) and resets to box 1 on miss', () => {
    assert.deepEqual(LEITNER_INTERVAL_DAYS, { 1: 0, 2: 1, 3: 3, 4: 7 });

    const t0 = 1_764_000_000_000;
    const s0 = {};

    const s1 = recordStudyReview(s0, 'q-1', true, t0);
    assert.deepEqual(s0, {}, 'recordStudyReview must not mutate input state');
    assert.equal(s1['q-1'].box, 2);
    assert.equal(s1['q-1'].nextDueAt, t0 + 1 * MS_PER_DAY);
    assert.equal(s1['q-1'].correctStreak, 1);

    const t1 = t0 + 1 * MS_PER_DAY;
    const s2 = recordStudyReview(s1, 'q-1', true, t1);
    assert.equal(s2['q-1'].box, 3);
    assert.equal(s2['q-1'].nextDueAt, t1 + 3 * MS_PER_DAY);
    assert.equal(s2['q-1'].correctStreak, 2);

    const t2 = t1 + 3 * MS_PER_DAY;
    const s3 = recordStudyReview(s2, 'q-1', true, t2);
    assert.equal(s3['q-1'].box, 4);
    assert.equal(s3['q-1'].nextDueAt, t2 + 7 * MS_PER_DAY);
    assert.equal(s3['q-1'].correctStreak, 3);

    // Box caps at 4
    const t3 = t2 + 7 * MS_PER_DAY;
    const s4 = recordStudyReview(s3, 'q-1', true, t3);
    assert.equal(s4['q-1'].box, 4);
    assert.equal(s4['q-1'].nextDueAt, t3 + 7 * MS_PER_DAY);

    // Miss resets to box 1, due immediately
    const t4 = t3 + 1000;
    const sReset = recordStudyReview(s4, 'q-1', false, t4);
    assert.equal(sReset['q-1'].box, 1);
    assert.equal(sReset['q-1'].nextDueAt, t4);
    assert.equal(sReset['q-1'].correctStreak, 0);
});

test('Wave 4 Law 2: partitionStudyDeck and buildMissDrillQuestions partition, filter, and cap deterministically', () => {
    const now = 1_764_000_000_000;
    const items = [
        {
            questionId: 'q-a',
            question: 'Question A about ICM bubble factors?',
            options: ['A1', 'A2', 'A3', 'A4'],
            correctIndex: 1,
            category: 'icm_chip_ev',
            missCount: 4,
        },
        {
            questionId: 'q-b',
            question: 'Question B about cash game SPR?',
            options: ['B1', 'B2', 'B3', 'B4'],
            correctIndex: 0,
            category: 'cash_game_situations',
            missCount: 1,
        },
        {
            questionId: 'q-c',
            question: 'Question C mastered ICM spot?',
            options: ['C1', 'C2', 'C3', 'C4'],
            correctIndex: 2,
            category: 'icm_chip_ev',
            missCount: 2,
        },
        {
            questionId: 'q-bad',
            question: 'Malformed question with bad correctIndex?',
            options: ['OnlyOne'],
            correctIndex: 3,
            category: 'icm_chip_ev',
            missCount: 9,
        },
    ];

    const srsState = {
        'q-c': { box: 4, nextDueAt: now + 7 * MS_PER_DAY, lastReviewedAt: now, correctStreak: 3 },
        'q-b': { box: 2, nextDueAt: now + 1 * MS_PER_DAY, lastReviewedAt: now, correctStreak: 1 },
    };

    const part = partitionStudyDeck(items, srsState, now);
    assert.equal(part.weakestCategory, 'icm_chip_ev');
    assert.equal(part.weakestCategoryItems.length, 3);
    assert.deepEqual(part.mastered.map((x) => x.questionId), ['q-c']);
    assert.ok(part.dueToday.some((x) => x.questionId === 'q-a'));
    assert.ok(!part.dueToday.some((x) => x.questionId === 'q-c'));
    assert.deepEqual(part.counts, {
        dueToday: 2,
        weakestCategory: 3,
        all: 4,
        mastered: 1,
    });

    const drill = buildMissDrillQuestions(items, srsState, 2, now);
    assert.equal(drill.length, 2);
    assert.ok(!drill.some((x) => x.questionId === 'q-bad'), 'Malformed item must be excluded from drill');
    assert.equal(drill[0].questionId, 'q-a', 'Due + weakest category item must come first');

    // Account-scoped storage round-trip & corrupt JSON safety
    const mem = new Map();
    const fakeStorage = {
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => { mem.set(k, String(v)); },
    };
    assert.equal(getStudySrsStorageKey('user-123'), 'smarter_trivia_study_srs_v1:user-123');
    assert.equal(saveStudySrsState('user-123', srsState, fakeStorage), true);
    const loaded = loadStudySrsState('user-123', fakeStorage);
    assert.equal(loaded['q-c'].box, 4);
    assert.deepEqual(loadStudySrsState('user-other', fakeStorage), {});

    fakeStorage.setItem('smarter_trivia_study_srs_v1:corrupt', '{bad-json');
    assert.deepEqual(loadStudySrsState('corrupt', fakeStorage), {});
});

test('Wave 4 Law 3: study.js enforces zero-reward drill, SRS tabs, and >=44px role="switch"', () => {
    const study = read('pages/hub/trivia/study.js');

    // Zero-reward drill invariants: NEVER call session-start or session-submit
    assert.doesNotMatch(study, /\/api\/trivia\/session-start/, 'study.js must NEVER call /api/trivia/session-start');
    assert.doesNotMatch(study, /\/api\/trivia\/session-submit/, 'study.js must NEVER call /api/trivia/session-submit');

    assert.match(study, /Practice Drill - Zero Cost, Zero Rewards/);
    assert.match(study, /data-start-miss-drill="true"/);
    assert.match(study, /role="tablist"/);
    assert.match(study, /Due Today/);
    assert.match(study, /Weakest Category/);
    assert.match(study, /All Misses/);
    assert.match(study, /Mastered/);
    assert.match(study, /Train This Spot:/);

    // Preserve >= 44px role="switch" and zero raw checkboxes
    assert.doesNotMatch(study, /type=["']checkbox["']/);
    assert.match(study, /role="switch"/);
    assert.match(study, /\.study-mode-tab\s*\{[\s\S]{0,260}min-height:\s*44px/);
    assert.match(study, /\.study-drill__option\s*\{[\s\S]{0,260}min-height:\s*44px/);
});

test('Wave 4 Law 4: trivia-pool.js enforces thin-category pills, safe Select Top 10 Clean, guarded hotkeys, and Fortress invariants', () => {
    const pool = read('pages/admin/trivia-pool.js');

    // Thin-Category Quick Filter Pills
    assert.match(pool, /data-thin-category-filters="true"/);
    assert.match(pool, /Rules & Etiquette/);
    assert.match(pool, /Cash Game/);
    assert.match(pool, /MTT Situations/);
    assert.match(pool, /ICM & Chip EV/);

    // Select Top 10 Clean (100/100) stages selection only, never auto-submits
    assert.match(pool, /data-select-top-clean="true"/);
    assert.match(pool, /Select Top 10 Clean \(100\/100\)/);
    const selectTop10Body = pool.match(/const selectTop10Clean\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\};/);
    assert.ok(selectTop10Body, 'selectTop10Clean must exist');
    assert.doesNotMatch(selectTop10Body[0], /runBatchCurate/, 'selectTop10Clean must NEVER auto-submit');

    // Keyboard shortcuts strictly guarded against editable elements
    assert.match(pool, /data-curation-shortcuts-legend="true"/);
    assert.match(pool, /isEditableElement\(document\.activeElement\)/);
    assert.match(pool, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'/);
    assert.match(pool, /isContentEditable === true/);

    // Preserve Fortress invariants: isolated loadWorkbench try/catch, full receiptId, MFA
    assert.match(
        pool,
        /setSelectedIds\(\[\]\);\s*try\s*\{\s*await loadWorkbench\(\);\s*\}\s*catch\s*\(_refreshError\)\s*\{/,
    );
    assert.match(pool, /Receipt \$\{String\(payload\.receiptId \|\| ''\)\}/);
    assert.match(pool, /requiresMfa === true/);
    assert.match(pool, /requiresEnrollment === true/);
});

test('Wave 4 Law 5: zero forbidden hex colors, zero uppercase transforms, and zero em-dashes across all 3 Wave 4 Track 3 files', () => {
    const owned = [
        'src/lib/trivia/studySpacedRepetition.mjs',
        'pages/hub/trivia/study.js',
        'pages/admin/trivia-pool.js',
    ];
    for (const rel of owned) {
        const src = read(rel);
        assert.doesNotMatch(src, /text-transform:\s*uppercase/i, `${rel} must not use text-transform: uppercase`);
        assert.doesNotMatch(src, /textTransform:\s*['"]uppercase['"]/i, `${rel} must not use textTransform: uppercase`);
        assert.doesNotMatch(src, /[—–]/, `${rel} must not contain em-dashes or en-dashes`);
        const hexes = src.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        const bad = hexes.filter(isForbiddenHueHex);
        assert.deepEqual(bad, [], `${rel} contains forbidden hex colors: ${bad.join(', ')}`);
    }
});
