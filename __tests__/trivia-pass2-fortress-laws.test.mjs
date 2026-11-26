/**
 * Trivia Pass-2 Fortress Anti-Regression Laws:
 *  1. pages/hub/trivia/index.js queries public.trivia_user_items (never nonexistent user_trivia_items).
 *  2. Every .tc-ink--* class referenced anywhere in pages/hub/trivia/ or src/components/trivia/
 *     is defined in src/styles/worlds/trivia-console.css.
 *  3. pages/api/trivia/daily.js never falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY or a hardcoded
 *     Supabase URL, and fails closed with HTTP 503 when server credentials are missing.
 *  4. normalizeSoloRunRecovery preserves answeredCount & totalQuestions, and useServerGradedRun.js
 *     persists them across session start, resume, and graded answers.
 *  5. CompetitiveLobbyBriefing.jsx gates schedule fetches on authState !== 'loading' and deduplicates
 *     /api/trivia/pvp/resume; pages/hub/trivia/index.js gates loadUserData on !authLoading;
 *     TriviaLobby.jsx deduplicates /api/trivia/pvp/ratings.
 *  6. pages/hub/trivia/study.js uses an accessible >= 44px role="switch" button instead of a raw
 *     <input type="checkbox">.
 *  7. GLOBAL ZERO-FORBIDDEN-COLOR SCAN across all Trivia frontend, config, lib, admin, and style
 *     files: zero yellow/gold/amber/orange/purple/violet/pink/magenta hex colors.
 *  8. Allow header is set before HTTP 405 in render-gto-panel.js, tournament-round-questions.js,
 *     and tournament-submit-round.js.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
    createSoloRunRecovery,
    normalizeSoloRunRecovery,
} from '../src/lib/trivia/soloRunRecovery.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

function walkFiles(dirRel, predicate, out = []) {
    const abs = join(ROOT, dirRel);
    if (!existsSync(abs)) return out;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
        const rel = join(dirRel, entry.name);
        if (entry.isDirectory()) {
            walkFiles(rel, predicate, out);
        } else if (predicate(entry.name, rel)) {
            out.push(rel);
        }
    }
    return out;
}

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
    // Forbidden: yellow/gold/amber/orange (15..75 deg), purple/violet/pink/magenta (255..345 deg)
    return (hue >= 15 && hue <= 75) || (hue >= 255 && hue <= 345);
}

test('Pass-2 Fortress Law 1: /hub/trivia queries trivia_user_items and never nonexistent user_trivia_items', () => {
    const indexSrc = read('pages/hub/trivia/index.js');
    assert.doesNotMatch(indexSrc, /['"`]user_trivia_items['"`]/, 'pages/hub/trivia/index.js must never query user_trivia_items');
    assert.match(indexSrc, /\.from\(\s*['"]trivia_user_items['"]\s*\)/, 'pages/hub/trivia/index.js must query trivia_user_items');
});

test('Pass-2 Fortress Law 2: every .tc-ink--* class referenced in Trivia UI is defined in trivia-console.css', () => {
    const consoleCss = read('src/styles/worlds/trivia-console.css');
    const definedInks = new Set(
        Array.from(consoleCss.matchAll(/\.(tc-ink--[a-z0-9-]+)\b/g), (m) => m[1]),
    );
    assert.ok(definedInks.has('tc-ink--cyan'), 'trivia-console.css must define .tc-ink--cyan');
    assert.ok(definedInks.has('tc-ink--blue'), 'trivia-console.css must define .tc-ink--blue');

    const uiFiles = [
        ...walkFiles('pages/hub/trivia', (name) => /\.(js|jsx|ts|tsx)$/.test(name)),
        ...walkFiles('src/components/trivia', (name) => /\.(js|jsx|ts|tsx)$/.test(name)),
    ];
    const missing = [];
    for (const rel of uiFiles) {
        const src = read(rel);
        for (const match of src.matchAll(/\b(tc-ink--[a-z0-9-]+)\b/g)) {
            const cls = match[1];
            if (!definedInks.has(cls)) {
                missing.push(`${rel}: .${cls}`);
            }
        }
    }
    assert.deepEqual(missing, [], `Undefined .tc-ink--* classes found: ${missing.join(', ')}`);
});

test('Pass-2 Fortress Law 3: pages/api/trivia/daily.js fails closed 503 with zero ANON_KEY or hardcoded URL fallback', () => {
    const dailySrc = read('pages/api/trivia/daily.js');
    assert.doesNotMatch(dailySrc, /NEXT_PUBLIC_SUPABASE_ANON_KEY/, 'daily.js must never fall back to NEXT_PUBLIC_SUPABASE_ANON_KEY');
    assert.doesNotMatch(dailySrc, /https:\/\/[a-z0-9-]+\.supabase\.co/i, 'daily.js must never hardcode a Supabase URL');
    assert.match(dailySrc, /if\s*\(\s*!url\s*\|\|\s*!serviceKey\s*\)\s*\{\s*return\s+null;\s*\}/);
    assert.match(dailySrc, /if\s*\(\s*!supabase\s*\)[\s\S]{0,160}status\(\s*503\s*\)/);
});

test('Pass-2 Fortress Law 4: soloRunRecovery preserves answeredCount & totalQuestions and useServerGradedRun persists them', () => {
    const now = 1_764_000_000_000;
    const sessionId = '11111111-2222-4333-8444-555555555555';
    const created = createSoloRunRecovery({
        mode: 'history',
        accountId: 'acct-1',
        sessionId,
        phase: 'active',
        createdAt: now,
        answeredCount: 4,
        totalQuestions: 20,
    });
    assert.equal(created.answeredCount, 4);
    assert.equal(created.totalQuestions, 20);

    const invalidProgress = normalizeSoloRunRecovery({
        ...created,
        answeredCount: -1,
        totalQuestions: 0,
    }, { mode: 'history', accountId: 'acct-1', now });
    assert.equal(invalidProgress.answeredCount, null);
    assert.equal(invalidProgress.totalQuestions, null);

    const hookSrc = read('src/hooks/useServerGradedRun.js');
    assert.match(hookSrc, /answeredCount:\s*resolvedAnsweredCount/);
    assert.match(hookSrc, /totalQuestions:\s*resolvedTotalQuestions/);
    assert.match(hookSrc, /answeredCount:\s*boundedAnswered/);
});

test('Pass-2 Fortress Law 5: Lobby competitive and user-data reads are auth-gated and deduplicated', () => {
    const briefingSrc = read('src/components/trivia/competitive/CompetitiveLobbyBriefing.jsx');
    const indexSrc = read('pages/hub/trivia/index.js');
    const lobbySrc = read('src/components/trivia/TriviaLobby.jsx');

    assert.match(
        briefingSrc,
        /if\s*\(\s*!requestPlan\.schedule\s*\)[\s\S]{0,220}if\s*\(\s*authState\s*===\s*'loading'\s*\)/,
        'CompetitiveLobbyBriefing must gate schedule fetch while authState === loading',
    );
    assert.match(briefingSrc, /pvpResumeFetchCache/, 'CompetitiveLobbyBriefing must deduplicate /api/trivia/pvp/resume');
    assert.match(
        indexSrc,
        /const\s+loadUserData\s*=\s*useCallback\(async\s*\(\{\s*force\s*=\s*false\s*\}\s*=\s*\{\}\)\s*=>\s*\{\s*if\s*\(\s*authLoading\s*\)\s*return;/,
        'pages/hub/trivia/index.js must gate loadUserData on !authLoading',
    );
    assert.match(indexSrc, /lastCompletedFetchKeyRef/, 'pages/hub/trivia/index.js must track lastCompletedFetchKeyRef');
    assert.match(lobbySrc, /pvpRatingsFetchCache/, 'TriviaLobby must deduplicate /api/trivia/pvp/ratings');
});

test('Pass-2 Fortress Law 6: /hub/trivia/study uses accessible >= 44px role="switch" button instead of raw checkbox', () => {
    const studySrc = read('pages/hub/trivia/study.js');
    assert.doesNotMatch(studySrc, /type=["']checkbox["']/, 'study.js must not render a raw <input type="checkbox">');
    assert.match(studySrc, /role="switch"/);
    assert.match(studySrc, /aria-checked=\{hideMastered\}/);
    assert.match(studySrc, /\.study-session-bar__toggle\s*\{[\s\S]{0,280}min-height:\s*44px/);
    assert.match(studySrc, /\.study-session-bar__toggle\s*\{[\s\S]{0,280}min-width:\s*44px/);
});

test('Pass-2 Fortress Law 7: GLOBAL zero forbidden yellow/gold/amber/orange/purple/pink hex colors across all Trivia files', () => {
    const extRe = /\.(js|jsx|ts|tsx|mjs|css)$/;
    const triviaFiles = [
        ...walkFiles('pages/hub/trivia', (name) => extRe.test(name)),
        ...walkFiles('pages/admin', (name) => name.startsWith('trivia') && extRe.test(name)),
        ...walkFiles('src/components/trivia', (name) => extRe.test(name)),
        ...walkFiles('src/styles/worlds', (name) => name.startsWith('trivia') && extRe.test(name)),
        ...walkFiles('src/config', (name) => name.startsWith('trivia') && extRe.test(name)),
        ...walkFiles('src/lib/trivia', (name) => extRe.test(name)),
    ];
    assert.ok(triviaFiles.length > 50, `Expected >50 Trivia files scanned, got ${triviaFiles.length}`);

    const violations = [];
    for (const rel of triviaFiles) {
        const lines = read(rel).split('\n');
        lines.forEach((line, idx) => {
            const matches = line.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
            for (const hex of matches) {
                if (isForbiddenHueHex(hex)) {
                    violations.push(`${rel}:${idx + 1} (${hex})`);
                }
            }
        });
    }
    assert.deepEqual(
        violations,
        [],
        `Forbidden non-#SMARTERDESIGN hex colors found in Trivia files:\n${violations.join('\n')}`,
    );
});

test('Pass-2 Fortress Law 8: Allow header is set before HTTP 405 in render-gto-panel, tournament-round-questions, and tournament-submit-round', () => {
    const checks = [
        ['pages/api/trivia/render-gto-panel.js', /res\.setHeader\(\s*['"]Allow['"]\s*,\s*['"]POST['"]\s*\)\s*;\s*return\s+res\.status\(\s*405\s*\)/],
        ['pages/api/trivia/tournament-round-questions.js', /res\.setHeader\(\s*['"]Allow['"]\s*,\s*['"]GET,\s*POST['"]\s*\)\s*;\s*return\s+res\.status\(\s*405\s*\)/],
        ['pages/api/trivia/tournament-submit-round.js', /res\.setHeader\(\s*['"]Allow['"]\s*,\s*['"]POST['"]\s*\)\s*;\s*return\s+res\.status\(\s*405\s*\)/],
    ];
    for (const [rel, pattern] of checks) {
        assert.match(read(rel), pattern, `${rel} must set Allow header before returning 405`);
    }
});
