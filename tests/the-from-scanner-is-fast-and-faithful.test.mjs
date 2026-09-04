/**
 * LAW: the `.from('table')` scanner is literal-anchored, shared, and faithful.
 *
 * Added 2026-09-04. Three CI checks each carried their own copy of a regex
 * that BEGINS with an optional identifier group. A pattern with no literal to
 * anchor on is attempted at every character, and at each attempt the optional
 * group eats an identifier, fails on `.from(`, and backtracks through every
 * shorter prefix. Over the 32MB this repo scans that was more than 90 seconds
 * PER COPY - over four minutes of every Pre-Deploy Safety Checks run, plus a
 * fourth copy in the Supabase Invariants workflow - while everyone assumed the
 * cost was the 7.8MB PostgREST schema fetch, which takes 1.4 seconds.
 *
 * Three things are pinned:
 *
 *   1. No check script grows that pattern back. The tell is a regex whose
 *      first element is an optional identifier group followed, eventually, by
 *      `.from(`.
 *   2. The shared scanner in scripts/ci/lib/from-calls.mjs gives the SAME
 *      answer the old pattern gave, on every shape that ever mattered - the
 *      storage bucket split across lines, the `getClient().from(...)` call,
 *      the foreign-project receiver. Faster is worthless if a phantom table
 *      slips through the new one and would have been caught by the old.
 *   3. It is fast on a body of text the old pattern choked on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromCalls, lineIndex } from '../scripts/ci/lib/from-calls.mjs';

const ROOT = process.cwd();

/** The retired pattern, kept HERE ONLY, as the oracle the new scanner must match. */
const OLD_RE =
  /([A-Za-z_$][A-Za-z0-9_$]*)?\s*(?:\(\))?\s*(\.\s*storage)?\s*\.\s*from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;

function oldScan(clean) {
  const out = [];
  OLD_RE.lastIndex = 0;
  let m;
  while ((m = OLD_RE.exec(clean)) !== null) {
    out.push({ index: m.index, receiver: m[1] || '', isStorage: Boolean(m[2]), table: m[3] });
  }
  return out;
}

const CORPUS = `
const a = await supabase.from('profiles').select('*');
const b = await supabase
  .from('club_members')
  .select('chip_balance');
await supabase.storage.from('uploads').upload(p, f);
await supabase.storage
    .from('avatars')
    .download(k);
const c = getClient().from('tables').select('id');
const d = mlbDb.from('agg_pitcher').select('*');
const e = mlbSupabase
  .from("agg_batter")
  .select("*");
const f = storage.from('bucket');
const g = admin.from( 'hand_history' ).insert(row);
x.from('a').from('b');
from('not_a_call_on_anything'); // bare: neither pattern matches, on purpose
const h = supabaseServer().from("chip_ledger").upsert(rows);
`;

test('the shared scanner agrees with the retired pattern on every shape that mattered', () => {
  const mine = fromCalls(CORPUS).map(({ index, receiver, isStorage, table }) => ({
    index,
    receiver,
    isStorage,
    table,
  }));
  const theirs = oldScan(CORPUS);
  assert.deepEqual(mine, theirs);
  // And it actually saw the shapes, rather than agreeing on nothing.
  const tables = mine.map((m) => m.table);
  for (const t of [
    'profiles',
    'club_members',
    'uploads',
    'avatars',
    'tables',
    'agg_pitcher',
    'agg_batter',
    'bucket',
    'hand_history',
    'chip_ledger',
  ])
    assert.ok(tables.includes(t), `scanner missed ${t}`);
  assert.equal(mine.find((m) => m.table === 'uploads').isStorage, true);
  assert.equal(
    mine.find((m) => m.table === 'avatars').isStorage,
    true,
    'storage split across lines'
  );
  assert.equal(mine.find((m) => m.table === 'bucket').receiver, 'storage');
  assert.equal(mine.find((m) => m.table === 'agg_pitcher').receiver, 'mlbDb');
  assert.equal(mine.find((m) => m.table === 'tables').receiver, 'getClient');
  assert.equal(tables.includes('not_a_call_on_anything'), false, 'a bare from() is not a query');
});

test('the shared scanner agrees with the retired pattern on real files in this repo', () => {
  // A sample of real API routes: the corpus above is what I could think of;
  // this is what the codebase actually writes.
  const dir = join(ROOT, 'pages', 'api', 'club-arena');
  const files = readdirSync(dir)
    .filter((f) => /\.(js|ts)$/.test(f))
    .slice(0, 40);
  assert.ok(files.length > 10, 'expected a body of real routes to compare on');
  let sites = 0;
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (!src.includes('.from(')) continue;
    const mine = fromCalls(src).map(({ index, receiver, isStorage, table }) => ({
      index,
      receiver,
      isStorage,
      table,
    }));
    const theirs = oldScan(src);
    assert.deepEqual(mine, theirs, `disagreement in ${f}`);
    sites += mine.length;
  }
  assert.ok(
    sites > 20,
    `only ${sites} call sites compared - the sample is too thin to mean anything`
  );
});

test('lineIndex answers what slice/split answered', () => {
  const text = 'a\nbb\n\nccc\ndddd';
  const lineOf = lineIndex(text);
  for (let i = 0; i < text.length; i++) {
    assert.equal(lineOf(i), text.slice(0, i).split('\n').length, `at ${i}`);
  }
});

test('the scanner is literal-anchored: a megabyte of identifiers takes milliseconds', () => {
  // Identifiers with no `.from(` after them are exactly what made the old
  // pattern backtrack. The new one skips straight to the literal.
  const noise = ('someVeryLongIdentifierName_' + 'x'.repeat(40) + ' ').repeat(20000);
  const t = process.hrtime.bigint();
  const found = fromCalls(noise + "supabase.from('tail')");
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.equal(found.length, 1);
  assert.ok(ms < 500, `scanning ~1MB of identifiers took ${ms.toFixed(0)}ms`);
});

test('no CI check script grows the leading-optional-group pattern back', () => {
  const dir = join(ROOT, 'scripts', 'ci');
  const offenders = [];
  for (const f of readdirSync(dir)) {
    if (!/^check-.*\.mjs$/.test(f)) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    // A regex literal that OPENS with an optional identifier group and goes
    // on to match `.from(` is the shape. Anything that needs the receiver
    // reads it backwards from the literal, through lib/from-calls.mjs.
    if (/\/\(\[A-Za-z_\$\]\[A-Za-z0-9_\$\]\*\)\?[^\n]*from\\\(/.test(src)) offenders.push(f);
  }
  assert.deepEqual(
    offenders,
    [],
    'these scripts carry the 86-second regex - use fromCalls() from scripts/ci/lib/from-calls.mjs'
  );
});
