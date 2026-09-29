/**
 * A RANGE COMMENT STATES ITS DATA (AEO phase 3, 2026-09-22).
 *
 * src/config/solverRanges.js is the corpus behind /hub/preflop-charts and the
 * eleven preflop lessons under /learn. Its comments described each range with
 * a size, and every one of them disagreed with the data under it:
 *
 *     range           comment said      the data, by frequency
 *     UTG open        ~15.5%            8.4%
 *     BTN open        ~48%              25.2%
 *     BB vs UTG       ~32% defend       9.5%
 *     BB vs SB        ~62% defend       22.6%
 *
 * The header also said the ranges were "aggregated from PioSOLVER/GTO+
 * solutions", directly under a paragraph saying they are not a solver export
 * and have no solve, tree or checksum behind them. The pages generated from
 * this file print the provenance truthfully; the file itself did not.
 *
 * A teaching file whose comments disagree with its data eventually teaches the
 * comment: the next person to author a page reads the header, not the arithmetic.
 *
 * THIS LAW recomputes every "measured:" comment from the table it sits in, and
 * holds the header to the same provenance the pages print. It does not fix the
 * ranges to any size: whether a big blind should defend 9.5% against an early
 * open is a content decision. It only makes sure the file says what it holds.
 *
 * Reads the corpus and the source; no network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as corpus from '../src/config/solverRanges.js';
import { actionShare, supportShare } from '../src/lib/seo/preflopReference.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'src/config/solverRanges.js'), 'utf8');

/** Raise and call merged into one action, which is what "defends" means. */
function merged(freqMap) {
  const out = {};
  for (const [hand, actions] of Object.entries(freqMap || {})) {
    out[hand] = { any: (Number(actions?.raise) || 0) + (Number(actions?.call) || 0) };
  }
  return out;
}

/** Every "measured:" comment, with the table and key it describes. */
function measuredComments() {
  const lines = SOURCE.split('\n');
  const found = [];
  let table = null;
  let key = null;
  lines.forEach((line, index) => {
    const exported = line.match(/^export const ([A-Z_0-9]+) = \{/);
    if (exported) { table = exported[1]; key = null; }
    const entry = line.match(/^ {4}([A-Za-z_0-9]+): \{\s*$/);
    if (entry) key = entry[1];
    const comment = line.match(/\/\/ measured: (.*)$/);
    if (comment) {
      // A comment above an export describes the table that follows it.
      let owner = table;
      let ownerKey = key;
      const next = lines.slice(index + 1).find((l) => /^export const /.test(l));
      if (!/^\s/.test(line) && next) {
        owner = next.match(/^export const ([A-Z_0-9]+)/)[1];
        ownerKey = null;
      }
      found.push({ line: index + 1, text: comment[1], table: owner, key: ownerKey });
    }
  });
  return found;
}

test('the header does not claim a provenance the data does not have', () => {
  const header = SOURCE.slice(0, SOURCE.indexOf('*/'));
  assert.doesNotMatch(header, /Aggregated from PioSOLVER|Source:\s*[^\n]*(PioSOLVER|GTO\+)\s+solutions/i,
    'the corpus is an authored reference; the header must not say it was aggregated from solver output');
  assert.match(header, /not a provenance-sealed solver export/, 'and it keeps saying what it is not');
});

test('there is a measured size for every opening range and defending spot', () => {
  const comments = measuredComments();
  for (const seat of ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']) {
    assert.ok(comments.some((c) => c.table === 'RFI' && c.key === seat), `RFI ${seat} has a measured comment`);
  }
  for (const spot of Object.keys(corpus.BB_DEFENSE)) {
    assert.ok(comments.some((c) => c.table === 'BB_DEFENSE' && c.key === spot), `BB_DEFENSE ${spot} has a measured comment`);
  }
  // No comment anywhere in the file states a range size in the old "~N%"
  // shape, which is how every one of the wrong numbers was written.
  const stale = SOURCE.split('\n').filter((l) => /\/\/.*~\s?\d+(\.\d+)?%/.test(l));
  assert.deepEqual(stale, [], 'range sizes are stated as measured values, not approximate targets');
});

test('every measured comment matches the data it describes', () => {
  const wrong = [];
  for (const c of measuredComments()) {
    const table = corpus[c.table];
    const map = c.key ? table?.[c.key] : table;
    assert.ok(map, `line ${c.line}: cannot find ${c.table}${c.key ? `.${c.key}` : ''}`);
    const defending = c.table === 'BB_DEFENSE';
    const expected = {
      raise: actionShare(map, 'raise'),
      call: actionShare(map, 'call'),
      '3-bet': actionShare(map, 'raise'),
      complete: actionShare(map, 'complete'),
      defends: actionShare(merged(map), 'any'),
      reaches: defending ? supportShare(merged(map), 'any') : supportShare(map, 'raise'),
    };
    const stated = [...c.text.matchAll(/(raise|call|3-bet|complete|defends|reaches) (\d+(?:\.\d+)?)%/g)];
    assert.ok(stated.length > 0, `line ${c.line}: a measured comment states at least one size`);
    for (const [, label, value] of stated) {
      if (Math.abs(Number(value) - expected[label]) > 0.05) {
        wrong.push(`line ${c.line} ${c.table}${c.key ? `.${c.key}` : ''}: says ${label} ${value}%, the data is ${expected[label]}%`);
      }
    }
  }
  assert.deepEqual(wrong, [], 'A comment in this file must state what its data holds:\n  ' + wrong.join('\n  '));
});
