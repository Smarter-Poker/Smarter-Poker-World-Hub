// A TOAST SHOWS EVEN WHEN ITS ANIMATION CANNOT LOAD (2026-11-28).
//
// #3252 moved the animated toast stack (framer-motion) into its own chunk that
// downloads on the first toast. The first toast of a visit is often "You Are
// Offline", which fires exactly when nothing can download, so it never
// appeared: e2e/029's standalone export cases went offline, pressed Export and
// saw no message. ToastContainer now renders the same cards without motion
// whenever the chunk errors or the browser is offline, and that card lives in
// a file with no framer-motion import, so it is always in the shell.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f) => readFileSync(join(process.cwd(), f), 'utf8');

test('the toast card that the shell can always render has no framer-motion import', () => {
  const card = read('src/components/ui/ToastCard.js');
  assert.doesNotMatch(card, /from ['"]framer-motion['"]/, 'ToastCard must not import framer-motion');
  assert.match(card, /export function ToastPlainList\(/);
});

test('the container falls back to plain cards when the animated stack cannot load', () => {
  const container = read('src/components/ui/ToastContainer.js');
  assert.match(container, /import \{ ToastPlainList \} from '\.\/ToastCard';/, 'ToastContainer must import the plain list statically');
  assert.match(container, /loading: \(\{ error \}\) => \(error \|\| \(typeof navigator !== 'undefined' && navigator\.onLine === false\) \? <ToastPlainList \/> : null\)/,
    'the dynamic ToastStack must render ToastPlainList on error or offline');
});

test('the animated stack and the plain list draw the same card', () => {
  const stack = read('src/components/ui/ToastStack.js');
  assert.match(stack, /import ToastCard from '\.\/ToastCard';/);
  assert.match(stack, /as=\{motion\.div\}/);
  assert.doesNotMatch(stack, /padding: '16px 20px'/, 'ToastStack must not keep its own copy of the card markup');
});
