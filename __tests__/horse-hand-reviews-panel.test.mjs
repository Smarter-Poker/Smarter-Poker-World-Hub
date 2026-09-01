/**
 * THE HAND-REVIEWS PANEL — the page Dan actually reads (2026-09-01).
 *
 * Four defects were found in it during the horse-audit sweep, and each one
 * made the panel quietly harder to trust:
 *
 *   1. THREE EXPANDERS WERE DIVS. The audit-row expander had already been
 *      converted to a real <button> with a comment explaining that "a div
 *      with onClick answered to neither [Enter nor Space]". The telemetry,
 *      league and leak-rate expanders were left as divs, so the same bug the
 *      file documents fixing was still live in three places.
 *
 *   2. AN INERT MATCHUP READ AS "NOT RESOLVED". bb/100 of exactly 0 with a
 *      stderr of exactly 0 over 12,000 hands does not mean "too close to
 *      call" - it means both arms played IDENTICALLY, so the flag under test
 *      never changed a decision. v18_squeeze_response sat like that for six
 *      days while the layer it measures had never once fired.
 *
 *   3. A ZERO STDERR MADE ANY EDGE "SIGNIFICANT". Math.abs(bb) > 2 * 0 is
 *      true for every non-zero bb. A degenerate sample is not certainty.
 *
 *   4. FINDINGS RENDERED UNSORTED AND UNGROUPED. 2026-08-31 produced 34
 *      findings; 18 of them were two codes repeating per event, and a
 *      critical could sit below an info.
 *
 * These tests pin the logic and the markup so none of the four returns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'pages/horses/hand-reviews.js'), 'utf8');

// ── The logic, mirrored exactly from the page ────────────────────────────
const RANK = { critical: 0, warn: 1, info: 2 };
function groupFindings(rawFindings) {
  const groups = [];
  const byCode = new Map();
  for (const f of rawFindings) {
    const key = `${f.severity}|${f.code}`;
    const seen = byCode.get(key);
    if (seen) seen.items.push(f);
    else {
      const g = { severity: f.severity, code: f.code, category: f.category, items: [f] };
      byCode.set(key, g);
      groups.push(g);
    }
  }
  groups.sort(
    (x, y) => (RANK[x.severity] ?? 3) - (RANK[y.severity] ?? 3) || y.items.length - x.items.length
  );
  return groups;
}
function verdict(bb100, stderr) {
  const bb = Number(bb100);
  const se = Number(stderr);
  const inert = bb === 0 && se === 0;
  const sig = !inert && se > 0 && Math.abs(bb) > 2 * se;
  if (inert) return 'inert';
  if (sig) return bb > 0 ? 'significant_positive' : 'significant_negative';
  return 'not_resolved';
}

// ── 1. Keyboard-operable expanders ───────────────────────────────────────
test('every expander is a real button, not a div with onClick', () => {
  const divExpanders = SRC.match(/<div\s+[^>]*onClick=\{\(\) => set\w+Open\(!/g) || [];
  assert.equal(
    divExpanders.length,
    0,
    'an expander is still a div with onClick - it answers to neither Enter nor Space'
  );
  for (const state of ['telemetryOpen', 'leagueOpen', 'trendsOpen', 'open']) {
    assert.ok(
      SRC.includes(`aria-expanded={${state}}`),
      `expander for ${state} must report aria-expanded`
    );
  }
});

test('each expander names the panel it controls, and that panel exists', () => {
  const controls = [...SRC.matchAll(/aria-controls="([^"{]+)"/g)].map((m) => m[1]);
  assert.ok(controls.length >= 3, 'expected at least three static aria-controls targets');
  for (const id of controls) {
    assert.ok(SRC.includes(`id="${id}"`), `aria-controls="${id}" points at no rendered element`);
  }
});

// ── 2 and 3. League verdicts ─────────────────────────────────────────────
test('an inert matchup is called inert, not unresolved', () => {
  // The real v18_squeeze_response row, 12,000 hands.
  assert.equal(verdict('0', '0'), 'inert');
  assert.ok(SRC.includes('Inert - Both Arms Identical'), 'the page must render the inert verdict');
});

test('a zero stderr is a degenerate sample, never significance', () => {
  assert.equal(verdict('5', '0'), 'not_resolved');
  assert.equal(verdict('-5', '0'), 'not_resolved');
});

test('the page itself computes the verdict this way', () => {
  /*
   * The three tests above exercise a MIRROR of the page's expression. A
   * mirror proves the rule is right; it cannot prove the page uses it -
   * reverting the page's own line left them all green. So the expression is
   * also pinned literally, which is what actually stops the regression.
   */
  assert.ok(
    SRC.includes('const inert = bb === 0 && se === 0;'),
    'the page must detect an inert matchup'
  );
  assert.ok(
    SRC.includes('const sig = !inert && se > 0 && Math.abs(bb) > 2 * se;'),
    'the page must require a positive stderr and exclude inert rows'
  );
  assert.ok(
    !/const sig = Math\.abs\(Number\(m\.bb100\)\) > 2 \* Number\(m\.stderr\);/.test(SRC),
    'the old unguarded significance test is back'
  );
});

test('the two-sigma rule is unchanged for real samples', () => {
  // Real rows from the 2026-08-31 card.
  assert.equal(verdict('45.41', '5.43'), 'significant_positive');
  assert.equal(verdict('0.35', '0.24'), 'not_resolved'); // 0.35 < 0.48
  assert.equal(verdict('-0.37', '0.3'), 'not_resolved'); // 0.37 < 0.60
  assert.equal(verdict('1.62', '0.76'), 'significant_positive'); // 1.62 > 1.52
});

// ── 4. Findings order and grouping ───────────────────────────────────────
test('criticals sort first and no finding is lost', () => {
  const raw = [
    { severity: 'info', code: 'leak_tag_detector_new' },
    { severity: 'info', code: 'leak_tag_detector_new' },
    { severity: 'warn', code: 'freeroll_started_empty' },
    { severity: 'critical', code: 'tournament_overlay' },
    { severity: 'critical', code: 'tournament_overlay' },
    { severity: 'warn', code: 'fleet_seat_starvation' },
    { severity: 'critical', code: 'fleet_idle_share' },
  ];
  const groups = groupFindings(raw);
  const order = groups.map((g) => RANK[g.severity]);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i - 1] <= order[i], 'severity order is not monotonic');
  }
  assert.equal(
    groups.reduce((n, g) => n + g.items.length, 0),
    raw.length,
    'grouping dropped a finding'
  );
  // The biggest repeat leads within its severity band.
  assert.equal(groups[0].code, 'tournament_overlay');
  assert.equal(groups[0].items.length, 2);
});

test('a repeated code folds into one card that still lists every item', () => {
  const raw = Array.from({ length: 10 }, (_, i) => ({
    severity: 'critical',
    code: 'tournament_overlay',
    title: `event ${i}`,
  }));
  const groups = groupFindings(raw);
  assert.equal(groups.length, 1, 'ten repeats of one code must render as one card');
  assert.equal(groups[0].items.length, 10, 'the card must keep all ten titles');
  assert.ok(SRC.includes('x${g.items.length}'), 'the card must show the repeat count');
});

test('findings of the same code but different severity stay separate', () => {
  // horse_big_pot_bleed really does arrive as both on the same day: five
  // critical and five warn. Folding those together would hide the split.
  const raw = [
    { severity: 'critical', code: 'horse_big_pot_bleed' },
    { severity: 'warn', code: 'horse_big_pot_bleed' },
  ];
  assert.equal(groupFindings(raw).length, 2);
});

// ── The Claude analysis block ────────────────────────────────────────────
test('shipped renders as a list, not a joined string', () => {
  assert.ok(
    !SRC.includes('shipped.join('),
    'join(", ") runs every pull-request entry into one unreadable paragraph'
  );
  assert.ok(SRC.includes('a.agent_analysis.shipped.map('), 'shipped must render as list items');
});

// ── The staleness banner ─────────────────────────────────────────────────
test('the league card says how old it is', () => {
  // The league lost three days in four at the end of August and this table
  // rendered the surviving run with nothing to say it was stale.
  assert.ok(SRC.includes('Stale Card:'), 'the league card must warn when it is not current');
  assert.ok(SRC.includes("role=\"alert\""), 'the staleness warning must be announced');
});

// ── House rules ──────────────────────────────────────────────────────────
test('no em dashes in the panel source', () => {
  assert.ok(!SRC.includes('—'), 'em dashes are forbidden');
});
