/**
 * THE ROUTE AND THE CLIENT AGREE - phase 8 of 8, 2026-09-29
 * ==========================================================================
 * Phases 1 to 7 built a chain across one boundary:
 *
 *     Postgres  ->  pages/api/store/diamond-transactions.js
 *               ->  src/components/store/DiamondWalletModal.jsx
 *
 * Both ends are already pinned - separately. the-wallet-badges-count-the-
 * whole-ledger and the-stats-panel-is-summed-in-sql hold the route; the
 * component guards hold the interface. Nothing held the JOIN, and a
 * separately-pinned boundary is one that can drift with both halves green:
 *
 *   - a field renamed on one side only;
 *   - a bucket key the SQL emits and no branch renders;
 *   - a column dropped from the route's `select(...)` that the interface
 *     still reads. `player_line` is the sharp one: it is a PostgREST
 *     COMPUTED column, so it is not in `*`, it is not in
 *     information_schema, and no stored-column snapshot can miss it on your
 *     behalf. Stop naming it and every row still renders - the ledger line
 *     just goes blank.
 *
 * Every symptom is the same: a figure a player notices before we do.
 *
 * HOW THIS GUARD KNOWS WHAT IS TRUE. Not from an assumption and not from a
 * migration file. Every database fact it compares against was read off
 * production with read-only SQL on 2026-09-29 and lives in ONE place,
 * scripts/ci/lib/diamond-wallet-contract.mjs, which is also what the live
 * smoke (scripts/ci/diamond-wallet-live-smoke.mjs) re-checks against the
 * database. Offline: the code matches the snapshot. On demand: the snapshot
 * matches the database. Neither reader can go stale without the other
 * saying so.
 *
 * "COULD NOT TELL" IS NOT GREEN (10.86). Every extractor below asserts its
 * own anchor is present BEFORE it asserts anything about what it found. A
 * regex that matches nothing because the code was reformatted would
 * otherwise report an empty set and pass, which is the exact failure this
 * whole family of guards exists to refuse.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stripComments } from '../scripts/ci/lib/rpc-calls.mjs';
import {
  STORED_COLUMNS,
  COMPUTED_COLUMNS,
  LIFETIME_TOTALS_KEYS,
  WALLET_SUMMARY_KEYS,
  WALLET_SUMMARY_ARENA_KEYS,
  FLOW_KEYS,
  FLOW_LINE_KEYS,
  BUCKET_KEYS,
  BUCKET_LABELS,
  ROUTE_PATH,
  CLIENT_PATH,
} from '../scripts/ci/lib/diamond-wallet-contract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ROUTE = stripComments(read(ROUTE_PATH));
const CLIENT = stripComments(read(CLIENT_PATH));

/** Every `<name>.<prop>` read in `src`, as a sorted unique list. */
function propsRead(src, name) {
  const found = new Set();
  const re = new RegExp(`\\b${name}\\s*(?:\\?)?\\.\\s*([A-Za-z_$][\\w$]*)`, 'g');
  let m;
  while ((m = re.exec(src)) !== null) found.add(m[1]);
  return [...found].sort();
}

/**
 * The source between two anchors. BOTH must be present and in order, or the
 * slice is a failure rather than an empty string - a renamed anchor must
 * break this guard loudly, never quietly narrow it to nothing.
 */
function between(src, startAnchor, endAnchor, label) {
  const a = src.indexOf(startAnchor);
  assert.notEqual(a, -1, `${label}: start anchor is gone from the route: ${startAnchor}`);
  const b = endAnchor === null ? src.length : src.indexOf(endAnchor, a + startAnchor.length);
  assert.notEqual(b, -1, `${label}: end anchor is gone from the route: ${endAnchor}`);
  const slice = src.slice(a, b);
  assert.ok(slice.length > 40, `${label}: the anchored block is empty`);
  return slice;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART 1 - THE COLUMN SET
// ═══════════════════════════════════════════════════════════════════════════

/** The literal inside the route's `.select(...)` for the ROW query. */
function rowSelectLiteral() {
  const m = ROUTE.match(/\.from\(\s*'diamond_transactions'\s*\)\s*\n?\s*\.select\(\s*'([^']+)'/);
  assert.ok(m, 'the route no longer selects from diamond_transactions in the shape this guard reads');
  return m[1];
}

test('the row select asks for `*` AND names every computed column by hand', () => {
  const literal = rowSelectLiteral();
  const parts = literal.split(',').map((s) => s.trim()).filter(Boolean);
  assert.ok(parts.includes('*'), `the row select dropped '*': ${literal}`);
  for (const computed of COMPUTED_COLUMNS) {
    assert.ok(
      parts.includes(computed),
      `'${computed}' is a PostgREST COMPUTED column: it is NOT part of '*'. ` +
        `The route must name it, or every row arrives with the field absent ` +
        `and the wallet prints a blank line. Current select: '${literal}'`
    );
  }
});

test('every transaction column the wallet reads is a column the route selected', () => {
  const clientReads = propsRead(CLIENT, 'tx');
  assert.ok(
    clientReads.length >= 6,
    `read ${clientReads.length} tx.* properties from the wallet - the extractor found ` +
      'almost nothing, which means the component was restructured and this guard ' +
      'is no longer looking at the ledger row'
  );

  const served = new Set([...STORED_COLUMNS, ...COMPUTED_COLUMNS]);
  const unserved = clientReads.filter((c) => !served.has(c));
  assert.deepEqual(
    unserved,
    [],
    'the wallet reads fields the route never serves. Each one renders as ' +
      `undefined, which is a blank figure on a real player's screen: ${unserved.join(', ')}`
  );
});

test('a computed column is never selected without being read, nor read without being selected', () => {
  const literal = rowSelectLiteral();
  const named = literal.split(',').map((s) => s.trim()).filter((s) => s && s !== '*');
  const clientReads = new Set(propsRead(CLIENT, 'tx'));

  for (const col of named) {
    assert.ok(
      clientReads.has(col),
      `the route asks PostgREST for '${col}' and nothing in the wallet reads it. ` +
        'A computed column costs a function call per row; dead weight on a ' +
        'paged ledger is not free. Remove it from the select or use it.'
    );
  }
  for (const col of COMPUTED_COLUMNS) {
    if (clientReads.has(col)) {
      assert.ok(named.includes(col), `the wallet reads tx.${col} and the route does not select it`);
    }
  }
});

test('the lifetime window select and the route reducer ask for the same columns', () => {
  const m = ROUTE.match(/\.select\(\s*'(amount[^']*)'\s*\)/);
  assert.ok(m, 'the lifetime window select is gone from the route in the shape this guard reads');
  const selected = m[1].split(',').map((s) => s.trim()).filter(Boolean).sort();

  const loop = between(
    ROUTE,
    'for (const row of allRows)',
    'let exact = false;',
    'lifetime reducer'
  );
  const usedInLoop = propsRead(loop, 'row').sort();

  for (const col of usedInLoop) {
    assert.ok(
      selected.includes(col),
      `the reducer reads row.${col} and the window select does not ask for it: ` +
        `it is undefined in every row. Selected: ${selected.join(', ')}`
    );
  }
  for (const col of selected) {
    assert.ok(
      usedInLoop.includes(col),
      `the window select asks for '${col}' over up to 5,000 rows and the reducer ` +
        'never reads it'
    );
  }
  for (const col of selected) {
    assert.ok(STORED_COLUMNS.includes(col), `the window select asks for a column production does not have: ${col}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 2 - THE RPC KEYS
// ═══════════════════════════════════════════════════════════════════════════

test('every key the route reads off fn_diamond_lifetime_totals is a key it returns', () => {
  const block = between(
    ROUTE,
    'const { data: totals, error: totalsErr } = await totalsPromise;',
    'const oldestAt',
    'lifetime totals'
  );
  const reads = propsRead(block, 'row');
  assert.ok(reads.length > 0, 'the route stopped reading anything off fn_diamond_lifetime_totals');
  for (const key of reads) {
    assert.ok(
      LIFETIME_TOTALS_KEYS.includes(key),
      `fn_diamond_lifetime_totals does not return '${key}'. It returns ` +
        `${LIFETIME_TOTALS_KEYS.join(', ')} (pg_get_function_result, production, 2026-09-29). ` +
        'Reading a key it does not return yields undefined, which the route turns ' +
        'into a non-finite number and silently falls back to the windowed sum.'
    );
  }
  for (const needed of ['lifetime_earned', 'lifetime_spent']) {
    assert.ok(reads.includes(needed), `the route no longer reads the headline figure ${needed}`);
  }
});

test('every key the route reads off fn_diamond_wallet_summary is a key it returns', () => {
  const block = between(ROUTE, 'let summary = null;', 'let flow = null;', 'wallet summary');
  const reads = propsRead(block, 'row').filter((k) => k !== 'arena');
  assert.ok(reads.length >= 4, 'the route stopped reading the diamond figures off the summary');
  for (const key of reads) {
    assert.ok(
      WALLET_SUMMARY_KEYS.includes(key),
      `fn_diamond_wallet_summary does not return '${key}'. Its own ` +
        `jsonb_build_object returns ${WALLET_SUMMARY_KEYS.join(', ')} (production, 2026-09-29).`
    );
  }
  const arenaReads = propsRead(block, 'row\\s*\\.\\s*arena');
  for (const key of arenaReads) {
    assert.ok(
      WALLET_SUMMARY_ARENA_KEYS.includes(key),
      `the summary's nested arena object does not carry '${key}'. It carries ` +
        `${WALLET_SUMMARY_ARENA_KEYS.join(', ')}.`
    );
  }
  assert.ok(
    arenaReads.includes('cash_games_enabled') && arenaReads.includes('tournaments_enabled'),
    'arenaOpen is no longer derived from the two arena switches'
  );
});

test('every key the route reads off fn_diamond_flow_by_kind is a key it returns', () => {
  const block = between(ROUTE, 'let flow = null;', 'return res.status(200)', 'flow by kind');
  for (const key of propsRead(block, 'row')) {
    assert.ok(
      FLOW_KEYS.includes(key),
      `fn_diamond_flow_by_kind does not return '${key}'. Its own jsonb_build_object ` +
        `returns ${FLOW_KEYS.join(', ')} (production, 2026-09-29).`
    );
  }
  const lineReads = propsRead(block, 'r');
  assert.ok(lineReads.length >= 6, 'the route stopped reading the bucket lines');
  for (const key of lineReads) {
    assert.ok(
      FLOW_LINE_KEYS.includes(key),
      `a bucket line does not carry '${key}'. It carries ${FLOW_LINE_KEYS.join(', ')}. ` +
        'The route throws on a non-numeric figure, so a renamed key does not blank ' +
        'one bar - it makes the whole breakdown read as unavailable.'
    );
  }
  for (const needed of FLOW_LINE_KEYS) {
    assert.ok(lineReads.includes(needed), `the route stopped carrying the bucket line's ${needed}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 3 - THE ROUTE'S OWN RESPONSE, AND WHAT THE WALLET DESTRUCTURES
// ═══════════════════════════════════════════════════════════════════════════

/** The keys of the object literal the route answers 200 with. */
function responseKeys() {
  const at = ROUTE.indexOf('return res.status(200).json({');
  assert.notEqual(at, -1, 'the route no longer answers 200 with an object literal');
  const body = ROUTE.slice(at, ROUTE.indexOf('});', at));
  const keys = [...body.matchAll(/^\s{6,}([a-z_][\w]*)\s*[,:]/gim)].map((m) => m[1]);
  assert.ok(keys.length >= 10, `read only ${keys.length} response keys - the extractor lost the literal`);
  return new Set(keys);
}

/** The object literal assigned to `name` inside the route, by its keys. */
function routeObjectKeys(name) {
  const at = ROUTE.indexOf(`${name} = {`);
  assert.notEqual(at, -1, `the route no longer builds a \`${name}\` object`);
  const body = ROUTE.slice(at, ROUTE.indexOf('};', at));
  const keys = [...body.matchAll(/(?:^|\n)\s+([A-Za-z_$][\w$]*)\s*[,:]/g)].map((m) => m[1]);
  assert.ok(keys.length >= 3, `read only ${keys.length} keys off the route's ${name} object`);
  return new Set(keys);
}

test('every field the wallet reads off the response is a field the route sends', () => {
  const sent = responseKeys();
  const reads = propsRead(CLIENT, 'data').filter((k) => sent.has(k) || /^[a-z_]+$/.test(k));
  const onTheResponse = reads.filter((k) =>
    CLIENT.includes(`data.${k}`) && !['data', 'length', 'map', 'filter', 'friends'].includes(k)
  );
  assert.ok(onTheResponse.length >= 8, 'the extractor lost the wallet response handler');

  // Only the fields this route's own handler touches; the component talks to
  // other endpoints through the same `data` name.
  const handler = between(
    CLIENT,
    "const res = await fetch(\n          `/api/store/diamond-transactions",
    'setVipTier(',
    'wallet fetch handler'
  );
  const handlerReads = propsRead(handler, 'data');
  assert.ok(handlerReads.length >= 8, 'the extractor lost the wallet response handler body');
  for (const key of handlerReads) {
    assert.ok(
      sent.has(key),
      `the wallet reads data.${key} and /api/store/diamond-transactions never sends it. ` +
        `It sends: ${[...sent].sort().join(', ')}`
    );
  }
  for (const needed of ['transactions', 'balance', 'total', 'counts', 'lifetime', 'summary', 'flow']) {
    assert.ok(handlerReads.includes(needed), `the wallet stopped reading data.${needed}`);
  }
});

test('every field the wallet reads off summary, lifetime and flow is a field the route builds', () => {
  const summaryKeys = routeObjectKeys('summary');
  const lifetimeKeys = routeObjectKeys('lifetime');
  const flowKeys = routeObjectKeys('flow');

  for (const key of propsRead(CLIENT, 'walletSummary')) {
    assert.ok(
      summaryKeys.has(key),
      `the wallet reads walletSummary.${key}; the route's summary object carries ` +
        `${[...summaryKeys].sort().join(', ')}. The Send panel would print "undefined".`
    );
  }
  for (const key of propsRead(CLIENT, 'lifetime')) {
    assert.ok(
      lifetimeKeys.has(key),
      `the wallet reads lifetime.${key}; the route's lifetime object carries ` +
        `${[...lifetimeKeys].sort().join(', ')}.`
    );
  }
  for (const key of propsRead(CLIENT, 'flow')) {
    assert.ok(
      flowKeys.has(key),
      `the wallet reads flow.${key}; the route's flow object carries ` +
        `${[...flowKeys].sort().join(', ')}.`
    );
  }
  for (const key of propsRead(CLIENT, 'line').concat(propsRead(CLIENT, 'sentLine'))) {
    assert.ok(
      ['bucket', 'label', 'lifetime', 'lifetimeCount', 'last30', 'last30Count'].includes(key),
      `the wallet reads a bucket line's ${key}; the route maps each line to ` +
        'bucket, label, lifetime, lifetimeCount, last30, last30Count'
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 4 - THE BUCKET KEYS
// ═══════════════════════════════════════════════════════════════════════════

test('every bucket key the wallet names is a bucket fn_diamond_kind_bucket can emit', () => {
  const named = new Set();
  for (const m of CLIENT.matchAll(/giftLine\(\s*flow\.(?:spent|earned)\s*,\s*'([a-z0-9_]+)'/g)) {
    named.add(m[1]);
  }
  for (const m of CLIENT.matchAll(/\.bucket\s*===\s*'([a-z0-9_]+)'/g)) named.add(m[1]);
  assert.ok(
    named.size >= 2,
    'the wallet no longer names any bucket key - the two gift plates are how ' +
      'this guard knows the bucket vocabulary is still shared'
  );
  for (const key of named) {
    assert.ok(
      BUCKET_KEYS.includes(key),
      `the wallet looks for the bucket '${key}' and fn_diamond_kind_bucket cannot ` +
        `emit it, so that plate is dead and reads null for ever. Emittable: ` +
        BUCKET_KEYS.join(', ')
    );
  }
  for (const needed of ['gifts_sent', 'gifts_received']) {
    assert.ok(named.has(needed), `the wallet stopped reading the '${needed}' bucket`);
  }
});

test('the breakdown renders every bucket it is given, rather than an allowlist of them', () => {
  assert.ok(
    /for \(const line of \[\.\.\.flow\.earned, \.\.\.flow\.spent\]\)/.test(CLIENT),
    'Top Sources no longer accumulates over BOTH whole arrays. A bucket the SQL ' +
      'emits and this loop skips is diamonds a player watches vanish from the ' +
      'breakdown, and fn_diamond_kind_bucket can emit 21 of them while a live ' +
      'ledger currently produces 15 - the other six arrive without warning.'
  );
  assert.ok(
    /sourceMap\[line\.label\]\s*=\s*\(sourceMap\[line\.label\]\s*\|\|\s*0\)\s*\+\s*line\.lifetime/.test(
      CLIENT
    ),
    'Top Sources no longer keys by the line label the SQL supplies. Keying by ' +
      'anything the interface maintains by hand is the allowlist that goes stale.'
  );
  assert.ok(
    !/flow\.(?:earned|spent)\s*\.\s*filter\(/.test(CLIENT),
    'the wallet filters the bucket lines before rendering them. Whatever the ' +
      'predicate is today, it is a second opinion about which buckets count.'
  );
  assert.ok(
    !/(?:spent|earned)\s*\.\s*filter\(/.test(
      ROUTE.slice(ROUTE.indexOf('let flow = null;'))
    ),
    'the route filters the bucket lines on the way through. The route copies ' +
      'buckets; it does not choose them.'
  );
});

test('every bucket production can emit carries a label, and the wallet prints labels', () => {
  for (const key of BUCKET_KEYS) {
    const label = BUCKET_LABELS[key];
    assert.equal(typeof label, 'string', `bucket '${key}' has no label`);
    assert.ok(label.length > 0, `bucket '${key}' has an empty label`);
  }
  /* 21 -> 22 on 2026-10-07: `arena_rake` ('Diamond Arena Rake') joined the
     database on 2026-10-05 (Club Arena migration 20261005183028) and this
     snapshot had not been told. */
  assert.equal(BUCKET_KEYS.length, 22, 'the pinned bucket set changed size without this guard moving');
  assert.equal(BUCKET_LABELS.arena_rake, 'Diamond Arena Rake');
  assert.ok(
    /marketplaceCopy\(name\)/.test(CLIENT),
    'the bars no longer print the SQL label through marketplaceCopy, so a new ' +
      'bucket would arrive with raw copy'
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// PART 5 - AN UNREAD ANSWER IS NEVER A ZERO, AND THE RAW DESCRIPTION IS NEVER
// PRINTED (2026-10-07 regression sweep)
// ═══════════════════════════════════════════════════════════════════════════

test('an unread profile is sent as an unread balance, never as 0', () => {
  const block = between(ROUTE, 'data: profile', "from('profiles')", 'profile read');
  assert.ok(
    /\{\s*data:\s*profile,\s*error:\s*profileErr\s*\}/.test(`{ ${block}`),
    'the route discards the profile read error again, so a refused read becomes balance 0'
  );
  assert.ok(
    !/profile\?\.diamonds\s*\?\?\s*0/.test(ROUTE),
    'the route coerces an unread balance to 0 again (10.86 rule 2)'
  );
  assert.ok(
    /balance:\s*profileRead\s*\?\s*Number\(profile\.diamonds\)\s*:\s*null/.test(ROUTE),
    'the route no longer sends null for a balance it could not read'
  );
});

test('the wallet keeps the figure it had when the route could not read the balance', () => {
  assert.ok(
    !/data\.balance\s*\?\?\s*0/.test(CLIENT),
    'the wallet turns an unread balance into 0 again'
  );
  assert.ok(
    /if\s*\(balanceRead\)\s*\{\s*setBalance\(bal\)/.test(CLIENT),
    'the wallet overwrites its balance with an unread one'
  );
  assert.ok(
    /filterRef\.current === 'all' && balanceRead\)/.test(CLIENT),
    'the wallet caches a page whose balance it could not read'
  );
});

test('a ledger row prints player_line or its label, never the raw description', () => {
  assert.ok(
    !/tx\.description/.test(CLIENT),
    'the wallet reads tx.description again; phase 6 says a player reads player_line, ' +
      'and the raw description carries operator notes and the internal Mint prefix'
  );
  assert.ok(/value=\{tx\.player_line \|\| config\.label\}/.test(CLIENT));
});
