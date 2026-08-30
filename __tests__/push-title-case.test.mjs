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

/** Pull the real implementation out of the worker rather than restating it. */
function loadToTitleCase() {
  const start = WORKER.indexOf('const TITLE_CASE_WORD_START');
  const end = WORKER.indexOf('\n}', WORKER.indexOf('function toTitleCase')) + 2;
  assert.ok(start > -1 && end > start, 'toTitleCase is no longer in worker/index.js');
  const src = WORKER.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return toTitleCase;`)();
}

const toTitleCase = loadToTitleCase();

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
