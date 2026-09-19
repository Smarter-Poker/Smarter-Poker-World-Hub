/**
 * THE CHARTS ARE ON THE CHART PAGE (AEO phase 3, 2026-09-19).
 *
 * Measured on production, /hub/preflop-charts served 112 words: its summary
 * block and nothing else. The range lab draws the charts after mount, so the
 * one question the page exists to answer, what a position opens, was written
 * nowhere a reader without JavaScript could find it.
 *
 * The corpus was never behind a fetch. src/config/solverRanges.js is bundled
 * with the app and /api/training/preflop-ranges reads it straight out of the
 * module. "What does UTG open in 6-max?" is a question an engine is asked
 * and can only answer from a page that says so in words.
 *
 * TWO NUMBERS, NOT ONE. A mixed range has two honest sizes and they are far
 * apart: the button opens 25.2 percent of combinations counted at the rate
 * each hand is actually played, and touches 40 percent of them at least some
 * of the time. The inline comments in solverRanges.js quote roughly the
 * second kind and are higher again (48 percent for the button). Publishing
 * one number and calling it "the range" would be wrong about half the time,
 * so the page prints both and says which is which.
 *
 * PROVENANCE. The corpus is an authored teaching reference, not a solver
 * export, and the API that serves it says so in its own disclosure. A page
 * that prints ranges without that sentence is making a stronger claim than
 * the data supports.
 *
 * Exercises the pure functions against the real corpus; no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  combosFor,
  actionShare,
  supportShare,
  describeRange,
  openingRanges,
  TOTAL_COMBOS,
} from '../src/lib/seo/preflopReference.js';
import { RFI, BB_DEFENSE, FOUR_BET } from '../src/config/solverRanges.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SEATS = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB'];

test('the corpus the page prints is still there', () => {
  for (const seat of SEATS) {
    assert.ok(RFI[seat], `the opening range for ${seat} is gone`);
    assert.ok(Object.keys(RFI[seat]).length > 10, `${seat} opens fewer than eleven hands`);
  }
  assert.ok(Object.keys(BB_DEFENSE).length >= 4, 'the big blind defending spots are gone');
  assert.ok(Object.keys(FOUR_BET).length >= 3, 'the four betting spots are gone');
});

test('a hand is only called always when it always happens', () => {
  const range = describeRange({
    AA: { raise: 1.0 },
    KK: { raise: 0.999 },
    QQ: { raise: 0.82 },
    JJ: { raise: 0.001 },
    TT: { call: 1.0 },
  }, 'raise');
  assert.deepEqual(range.always, ['AA', 'KK'], '1.0 and the float that rounds to it');
  assert.deepEqual(
    range.mixed.map((m) => `${m.hand} ${m.frequency}`),
    ['QQ 82', 'JJ 0'],
    'and everything played some of the time keeps its rate',
  );
  assert.ok(!range.always.includes('TT'), 'a hand that only calls is not an opening hand');
});

test('the two sizes of a range are different numbers and both are published', () => {
  const opens = openingRanges(RFI, SEATS);
  for (const range of opens) {
    assert.ok(range.percent > 0, `${range.position} opens nothing`);
    assert.ok(
      range.reach >= range.percent,
      `${range.position}: reach ${range.reach} is below the frequency weighted ${range.percent}, `
        + 'which is arithmetically impossible',
    );
  }
  const button = opens.find((r) => r.position === 'BTN');
  assert.ok(
    button.reach - button.percent > 5,
    'the two measures are far enough apart on the widest range that collapsing '
      + 'them into one number would be a real error, which is why both are printed',
  );

  const page = read('src/components/seo/PreflopReference.js');
  assert.match(page, /\{range\.percent\}% Of Hands/, 'the frequency weighted size is printed');
  assert.match(page, /\{range\.reach\}%/, 'and so is the reach');
});

test('a combination count is a combination count', () => {
  assert.equal(combosFor('AA'), 6);
  assert.equal(combosFor('AKs'), 4);
  assert.equal(combosFor('AKo'), 12);
  assert.equal(TOTAL_COMBOS, 1326);
  const everything = Object.fromEntries(
    openingRanges(RFI, ['BTN'])[0].always.map((hand) => [hand, { raise: 1 }]),
  );
  assert.equal(
    actionShare(everything, 'raise'),
    supportShare(everything, 'raise'),
    'with no mixed hands the two measures agree exactly',
  );
});

test('the page says what the corpus is, and is not', () => {
  const component = read('src/components/seo/PreflopReference.js');
  assert.match(
    component,
    /Not A Solver\s*\n?\s*Export/,
    'the copy states this is an authored reference and not a solver export. '
      + 'The API that serves the same corpus carries that disclosure; a page '
      + 'printing the ranges without it claims more than the data supports.',
  );
  assert.match(component, /Authored\s*\n?\s*Teaching Reference/, 'and says what it is');
});

test('the reference reaches the server HTML of the page', () => {
  const page = read('pages/hub/memory-games.js');
  assert.match(page, /import PreflopReference from/, 'the page imports it');
  const summaryAt = page.indexOf('<HubPageSummary page="preflop-charts"');
  const referenceAt = page.indexOf('<PreflopReference />');
  assert.ok(summaryAt > 0 && referenceAt > summaryAt,
    'and renders it beside the summary, outside PageTransition, which is the '
    + 'only part of this page a crawler that runs no JavaScript ever sees');
  const canonical = read('pages/hub/preflop-charts.js');
  assert.match(canonical, /export \{ default \} from '\.\/memory-games'/,
    '/hub/preflop-charts is the canonical route and re-exports this page');
});
