/**
 * EVERY PUSH NOTIFICATION IS TITLE CASED, AT THE POINT IT IS RENDERED.
 *
 * Dan, 2026-08-30: "the first letter of every word should be capitalized
 * inside the push notifications."
 *
 * Enforced in worker/index.js, in the `push` handler, for the same reason Club
 * Arena enforces the identical rule in its Toast layer rather than at call
 * sites: push copy is written by both repos plus a dozen crons and database
 * triggers, and a style that lives in a convention drifts by the next commit.
 *
 * This test reads the worker source and exercises the real transform, so it
 * cannot pass against a copy that has drifted from what ships.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'worker/index.js'), 'utf8');
/**
 * THE SECOND WORKER. This origin has two push-capable service workers —
 * `/sw.js` (worker/index.js, registered by Club Arena's pushClient) and
 * `/push/sw.js` (registered by the World Hub) — and this test read only the
 * first. `public/push/sw.js` was forked out of the other on 2026-08-25 to
 * escape a next-pwa precache hang, Dan's Title Case rule landed on 2026-08-30,
 * and nothing carried it across or noticed. On 2026-09-07 one device holding a
 * live subscription to each received the same Estate Digest twice, one copy
 * title cased and one not.
 */
const PUSH_WORKER = fs.readFileSync(path.join(ROOT, 'public/push/sw.js'), 'utf8');

const SHARED_BEGIN = 'TITLE_CASE_SHARED_BEGIN';
const SHARED_END = 'TITLE_CASE_SHARED_END';

/** The shared block, verbatim, from whichever worker source is handed in. */
function sharedBlock(source, name) {
  const start = source.indexOf(SHARED_BEGIN);
  const end = source.indexOf(SHARED_END, start);
  assert.ok(start > -1 && end > start, `the shared title-case block is missing from ${name}`);
  return source.slice(start + SHARED_BEGIN.length, end);
}

/** Pull the real implementation out of the worker rather than restating it. */
function loadToTitleCase(source, name) {
  const start = source.indexOf('const TITLE_CASE_WORD_START');
  const end = source.indexOf('\n}', source.indexOf('function toTitleCase')) + 2;
  assert.ok(start > -1 && end > start, `toTitleCase is no longer in ${name}`);
  const src = source.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return toTitleCase;`)();
}

const toTitleCase = loadToTitleCase(WORKER, 'worker/index.js');

test('the first letter of every word is capitalized', () => {
  assert.equal(
    toTitleCase('your cash-out of 12,345 chips was approved'),
    'Your Cash-Out Of 12,345 Chips Was Approved'
  );
  // Hyphenated words read as two words, so both halves get their capital.
  assert.match(toTitleCase('auto-fold is on'), /Auto-Fold/);
});

test('acronyms and game names survive', () => {
  // This platform is made of these. Flattening NLH to "Nlh" would be worse
  // than the lowercase the rule replaced.
  const out = toTitleCase('a seat opened at PLO4 5.00/10.00 in NLH 6-Max');
  assert.equal(out, 'A Seat Opened At PLO4 5.00/10.00 In NLH 6-Max');
  for (const acronym of ['PLO4', 'NLH']) assert.ok(out.includes(acronym), `${acronym} was mangled`);
});

test('a plural suffix is not a word', () => {
  // Straight from Dan's screenshot. Treating "(" as a word boundary renders
  // this "Subscription(S) ... User(S)", which is worse than what it replaced.
  assert.equal(
    toTitleCase('3 zombie subscription(s) across 1 user(s) cannot receive push'),
    '3 Zombie Subscription(s) Across 1 User(s) Cannot Receive Push'
  );
});

test('a bracket that really does start a word still gets its capital', () => {
  assert.equal(toTitleCase('(recommended) check your VIP status'), '(Recommended) Check Your VIP Status');
});

test('copy that is already correct is left alone', () => {
  const already = 'A Seat Just Opened At Bomb Pot NLH 0.25/0.50. Sit Down Now To Claim It.';
  assert.equal(toTitleCase(already), already);
});

test('it never throws, whatever it is handed', () => {
  for (const input of ['', null, undefined, 42, {}, []]) {
    assert.doesNotThrow(() => toTitleCase(input), `threw on ${JSON.stringify(input)}`);
  }
});

test('no lookbehind in the worker: it would break install on older engines', () => {
  // A regex literal is parsed when the SERVICE WORKER SCRIPT IS EVALUATED, so
  // an unsupported construct does not degrade the transform — it stops the
  // worker installing, which takes web push down for the whole origin. That is
  // exactly the outage of 2026-08-29. See .agent/audits/.
  //
  // Matched against CODE, not prose. The comment above the transform explains
  // why there is no lookbehind and quotes the syntax to do it, so a test that
  // greps the raw file fails on its own explanation — which is exactly what
  // this one did on its first run.
  const code = WORKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(
    !/\(\?<[=!]/.test(code),
    'worker/index.js contains a lookbehind; it must parse on every engine that can run a service worker'
  );
});

test('both showNotification paths get the transform', () => {
  // There is a fallback call for the Chrome trap where an unknown option makes
  // showNotification throw and display nothing. It must not be the one that
  // renders untransformed copy.
  assert.match(WORKER, /const title = toTitleCase\(/, 'the title is not transformed');
  assert.match(WORKER, /body: toTitleCase\(/, 'the body is not transformed');
  const fallback = WORKER.slice(WORKER.indexOf('showNotification(title, { body: options.body })'));
  assert.ok(fallback.length > 0, 'the fallback showNotification call moved; re-check it uses the same vars');
});

/**
 * ── A NAME IS NOT A WORD (2026-09-07) ─────────────────────────────────────
 * The Estate Digest went out as "Production Serves Main Exactly (A224b68ae)".
 * `a224b68ae` is a git commit; capitalising it does not style a sentence, it
 * edits an identifier so it can no longer be pasted into `git show`.
 */
test('a token containing a digit is a name and is left exactly as written', () => {
  assert.equal(
    toTitleCase('production serves main exactly (a224b68ae).'),
    'Production Serves Main Exactly (a224b68ae).'
  );
  // The real digest line, end to end.
  assert.equal(
    toTitleCase('club arena: 100+ commits to main, 3270 workflow runs'),
    'Club Arena: 100+ Commits To Main, 3270 Workflow Runs'
  );
  // Versions and ids, in the shapes this platform actually emits.
  assert.equal(toTitleCase('engine v2 shipped'), 'Engine v2 Shipped');
  assert.equal(toTitleCase('table a1b2c3 stalled'), 'Table a1b2c3 Stalled');
  // And a plain word that merely SITS beside a number is still a word.
  assert.equal(toTitleCase('3 tables stalled'), '3 Tables Stalled');
});

test('the two service workers render a notification identically', () => {
  // Byte-for-byte, not "behaves the same" — the whole failure mode was a copy
  // that drifted while both files still looked reasonable on their own.
  assert.equal(
    sharedBlock(PUSH_WORKER, 'public/push/sw.js'),
    sharedBlock(WORKER, 'worker/index.js'),
    'the title-case block has diverged between the two service workers'
  );

  const other = loadToTitleCase(PUSH_WORKER, 'public/push/sw.js');
  for (const sample of [
    'production serves main exactly (a224b68ae).',
    'a seat opened at PLO4 5.00/10.00 in NLH 6-Max',
    '3 zombie subscription(s) across 1 user(s) cannot receive push',
  ]) {
    assert.equal(other(sample), toTitleCase(sample), `the two workers disagree on: ${sample}`);
  }

  // And the fork must actually CALL it — a shared block nobody invokes is the
  // same silence in a different shape.
  assert.match(PUSH_WORKER, /const title = toTitleCase\(/, 'public/push/sw.js does not transform the title');
  assert.match(PUSH_WORKER, /body: toTitleCase\(/, 'public/push/sw.js does not transform the body');
});

test('neither worker contains a lookbehind', () => {
  for (const [name, source] of [
    ['worker/index.js', WORKER],
    ['public/push/sw.js', PUSH_WORKER],
  ]) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\(\?<[=!]/.test(code), `${name} contains a lookbehind`);
  }
});
