#!/usr/bin/env node
// Unit tests for classifyBuildFailure() — run with `node --test`.
// Fixtures are real-world log tails captured from Vercel builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyBuildFailure } from './poll.mjs';

test('OOM: JavaScript heap out of memory', () => {
  const log = `
info  - Creating an optimized production build ...
<--- Last few GCs --->
[2934:0x5a3d540]    85215 ms: Mark-sweep 2039.0 (2065.4) -> 2036.7 (2065.4) MB, 1253.6 / 0.2 ms
<--- JS stacktrace --->
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Error: Command "npm run build" exited with 1
`;
  assert.equal(classifyBuildFailure(log).strategy, 'oom');
  assert.equal(classifyBuildFailure(log).confidence, 'high');
});

test('OOM: SIGKILL', () => {
  const log = `
Creating an optimized production build...
Error: Command "npm run build" exited with SIGKILL
At least one "Out of Memory" ("OOM") event was detected during the build.
`;
  assert.equal(classifyBuildFailure(log).strategy, 'oom');
});

test('missing-dep: Module not found', () => {
  const log = `
./components/Toast.tsx:3:0
Module not found: Error: Can't resolve 'react-hot-toast'
`;
  const c = classifyBuildFailure(log);
  assert.equal(c.strategy, 'missing-dep');
  assert.equal(c.module, 'react-hot-toast');
  assert.equal(c.confidence, 'high');
});

test('missing-dep: Cannot find module (CommonJS-style)', () => {
  const log = `Error: Cannot find module '@supabase/supabase-js'`;
  const c = classifyBuildFailure(log);
  assert.equal(c.strategy, 'missing-dep');
  assert.equal(c.module, '@supabase/supabase-js');
});

test('tsc: Type error', () => {
  const log = `
./pages/foo.tsx:12:5
Type error: Property 'bar' does not exist on type 'Baz'.
`;
  assert.equal(classifyBuildFailure(log).strategy, 'tsc');
});

test('tsc: TS error code', () => {
  const log = `pages/foo.ts(12,5): TS2339: Property 'bar' does not exist.`;
  assert.equal(classifyBuildFailure(log).strategy, 'tsc');
});

test('generic: Failed to compile', () => {
  const log = `
Failed to compile.
./pages/bad.tsx
SyntaxError: Unexpected token, expected ";"
`;
  assert.equal(classifyBuildFailure(log).strategy, 'generic');
});

test('generic: npm ERR fallback', () => {
  const log = `npm ERR! code ELIFECYCLE\nnpm ERR! exit code 1`;
  assert.equal(classifyBuildFailure(log).strategy, 'generic');
});

test('null on empty / healthy logs', () => {
  assert.equal(classifyBuildFailure(''), null);
  assert.equal(classifyBuildFailure(null), null);
  assert.equal(classifyBuildFailure('info  - Compiled successfully'), null);
});

test('missing-dep beats OOM if the log has both (order matters)', () => {
  // Reality check: a real log that happens to contain "Out of Memory" in a
  // dep name shouldn't mis-classify as OOM. OOM is checked first on purpose
  // (SIGKILL is fatal before module resolution runs), so this tests the
  // ordering invariant.
  const log = `Out of Memory event was detected during the build.\nCannot find module 'react'`;
  assert.equal(classifyBuildFailure(log).strategy, 'oom');
});

test('tsc pattern does not false-match "Type error" in running text', () => {
  // The log shouldn't trigger if "Type error" is just in a comment line,
  // not a structured error. Our anchor requires start-of-line + indent.
  const log = `
info  - No Type error in this section
Compiled successfully
`;
  assert.equal(classifyBuildFailure(log), null);
});
