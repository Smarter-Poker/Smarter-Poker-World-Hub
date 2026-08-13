/**
 * LEAK DETECTION — STAT UNITS CONTRACT
 * ─────────────────────────────────────────────────────────────────────────
 * Every threshold in LEAK_PATTERNS is written in PERCENT:
 *   vpip < 18, threeBetFreq > 14, foldToCbet > 55, cbetFreq < 40 ...
 *
 * `player_stats` stores those rates as FRACTIONS. Measured in production on
 * 2026-08-09 across 1,156 rows: vpip spans 0.00–0.55, pfr 0.00–0.32, and NOT
 * ONE ROW exceeds 1. Compared raw, `vpip < 18` is therefore true for every
 * player who has ever existed:
 *
 *   • all 1,089 accounts past the 500-hand gate would be told they are
 *     "Overfolding Preflop" — including a 0.55 (55%) VPIP maniac, whose
 *     actual leak is the exact opposite;
 *   • 974 of them carry vpip = 0, an unwritten column rather than a
 *     measurement (several with 60k+ hands, which no human produces);
 *   • each fabricated leak also burns a Grok call generating a "fix" for a
 *     problem the player does not have.
 *
 * This was caught the day auto-detection shipped, before any user saw it.
 * These tests exist so the units contract can never silently break again —
 * whether by a new stats writer emitting fractions, or by someone "cleaning
 * up" the normalisation.
 *
 * The normaliser is extracted from source and evaluated standalone, because
 * detect.js imports webpack-resolved modules and cannot be imported under
 * `node --test` (same technique as equity-worker-parity.test.mjs).
 *
 * Run: node --test __tests__/leak-detect-stat-units.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DETECT = path.join(ROOT, 'pages/api/assistant/leaks/detect.js');

function loadNormalizeStats() {
    const src = fs.readFileSync(DETECT, 'utf8');
    const start = src.indexOf('function normalizeStats');
    assert.ok(start >= 0, 'normalizeStats not found — has detect.js been restructured?');
    const end = src.indexOf('function computeStatsFromHands', start);
    assert.ok(end > start, 'could not bound normalizeStats');
    return new Function('return (' + src.slice(start, end).trim() + ')')();
}

/** The real production shape: player_stats rows carry fractions. */
const row = (over = {}) => ({ hands_played: 900, vpip: 0.14, pfr: 0.11, ...over });

test('fractional rates are scaled to the percent the thresholds expect', () => {
    const n = loadNormalizeStats()(row({ vpip: 0.14, pfr: 0.11 }));
    assert.ok(Math.abs(n.vpip - 14) < 1e-6, `0.14 must read as 14%, got ${n.vpip}`);
    assert.ok(Math.abs(n.pfr - 11) < 1e-6, `0.11 must read as 11%, got ${n.pfr}`);
});

test('a 55% VPIP maniac is NOT flagged as overfolding (the headline bug)', () => {
    const n = loadNormalizeStats()(row({ vpip: 0.55, hands_played: 800 }));
    assert.ok(Math.abs(n.vpip - 55) < 1e-6, `0.55 must read as 55%, got ${n.vpip}`);
    // LEAK_PATTERNS.overfolding_preflop: vpip < 18 && handsPlayed > 500
    assert.equal(n.vpip < 18 && n.handsPlayed > 500, false,
        'a 55% VPIP player must never be told they are overfolding preflop');
});

test('a genuinely tight player IS still flagged', () => {
    const n = loadNormalizeStats()(row({ vpip: 0.12, hands_played: 900 }));
    assert.equal(n.vpip < 18 && n.handsPlayed > 500, true,
        'the fix must not neuter real detection — 12% VPIP over 900 hands is a real leak');
});

test('values already in percent are left alone (no double scaling)', () => {
    const n = loadNormalizeStats()(row({ vpip: 24, pfr: 18 }));
    assert.equal(n.vpip, 24, 'a source that already emits percent must not be rescaled');
    assert.equal(n.pfr, 18);
    assert.equal(n.vpip < 18, false);
});

test('vpip/pfr of exactly 0 is an unwritten column, not a measurement', () => {
    // 974 of 1,089 eligible production rows look exactly like this.
    const n = loadNormalizeStats()(row({ vpip: 0, pfr: 0, hands_played: 67000 }));
    assert.equal(n.vpip, null, 'vpip = 0 over 67k hands is not a real rate — it must read as unmeasured');
    assert.equal(n.pfr, null);
    // patternIsMeasured() skips any pattern whose required key is null, so a
    // null here is what stops the fabricated leak reaching the user.
});

test('absent columns stay null rather than becoming a fabricated 0', () => {
    const n = loadNormalizeStats()({ hands_played: 900 });
    for (const k of ['vpip', 'pfr', 'threeBetFreq', 'foldToCbet', 'cbetFreq', 'riverBluffFreq']) {
        assert.equal(n[k], null, `${k} must be null when the column does not exist`);
    }
});

test('opportunity-gated postflop rates keep their honest zeros', () => {
    // 0% river bluffs across 25 real spots IS the leak — it must survive.
    const n = loadNormalizeStats()({
        hands_played: 900, river_bluff_freq: 0, river_bluff_opportunities: 25,
        cbet_freq: 0, cbet_opportunities: 60,
    });
    assert.equal(n.riverBluffFreq, 0, 'a measured 0% must not be discarded as unmeasured');
    assert.equal(n.riverBluffOpps, 25);
    assert.equal(n.cbetFreq, 0);
    assert.equal(n.riverBluffFreq < 8 && n.riverBluffOpps > 20, true, 'this is a genuine detectable leak');
});

test('postflop fractions are scaled too', () => {
    const n = loadNormalizeStats()({
        hands_played: 900,
        fold_to_cbet: 0.62, cbets_faced: 80,
        three_bet_freq: 0.02,
    });
    assert.ok(Math.abs(n.foldToCbet - 62) < 1e-6, `0.62 must read as 62%, got ${n.foldToCbet}`);
    assert.equal(n.foldToCbet > 55 && n.cbetsFaced > 50, true, 'overfolding to c-bets should fire at 62%');
    assert.ok(Math.abs(n.threeBetFreq - 2) < 1e-6);
});

test('sample-size counts are never scaled — they are counts, not rates', () => {
    const n = loadNormalizeStats()({
        hands_played: 900, cbets_faced: 1, cbet_opportunities: 1, river_bluff_opportunities: 1,
    });
    assert.equal(n.cbetsFaced, 1, 'a count of 1 must stay 1, not become 100');
    assert.equal(n.cbetOpps, 1);
    assert.equal(n.riverBluffOpps, 1);
});
