/*
 * TWO CI LAWS, LEARNED THE EXPENSIVE WAY (2026-11-09).
 *
 * The Undefined Identifier Guard failed on EVERY pull request for months. Not
 * because of the code it checks — it never got that far. Two independent
 * faults compounded:
 *
 *   1. It cached node_modules under a key only it wrote. GitHub scopes a cache
 *      saved on a branch to that branch; only a cache saved on the DEFAULT
 *      branch is readable from every pull request. The job is pull_request
 *      only, so it wrote a cache nobody could ever read, and every run was a
 *      cold full install.
 *   2. That install was a plain `npm ci`, which runs install scripts, which
 *      builds `canvas` from source, which needs system libraries the hosted
 *      runner does not have. It exited 1 before the check ran.
 *
 * These pin both laws for every workflow, so neither returns quietly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.github/workflows';
const files = readdirSync(DIR).filter(name => name.endsWith('.yml') || name.endsWith('.yaml'));
assert.ok(files.length >= 20, `Expected the workflow directory, found ${files.length} — a loop over nothing proves nothing`);
const sources = new Map(files.map(name => [name, readFileSync(join(DIR, name), 'utf8')]));

// A workflow whose `on:` block pushes to main writes caches every PR can read.
const writesCacheOnDefaultBranch = source => {
  const on = source.slice(source.indexOf('\non:'), source.indexOf('\njobs:'));
  return /\n\s*push:/.test(on) && /branches:\s*\[?\s*'?"?main/.test(on);
};
const cacheKeys = source => [...source.matchAll(/^\s*key:\s*(\S.*)$/gm)]
  .map(match => match[1].trim().replace(/\$\{\{[^}]*\}\}/g, '*'));

test('no workflow compiles a native module it cannot build on the runner', () => {
  // Measured 2026-11-09: `canvas` ships no prebuilt binary for the Node 22
  // ABI, so a scripted `npm ci` there compiles it from source and needs pixman
  // and cairo, which the hosted runners do not have. The same install on
  // Node 24 downloads a prebuild and passes. So the hazard is the pairing of
  // Node 22 with a scripted install, not `npm ci` itself.
  const offenders = [];
  for (const [name, source] of sources) {
    if (!/node-version:\s*'?22/.test(source)) continue;
    const scripted = source.split('\n').some(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !/\bnpm ci\b/.test(trimmed)) return false;
      if (/--ignore-scripts/.test(trimmed)) return false;
      if (/echo |::warning::/.test(trimmed)) return false;   // prose about a failure
      return true;
    });
    // A documented `|| npm install` fallback survives the compile failure.
    if (scripted && !/npm ci[^\n]*\|\|/.test(source)) offenders.push(name);
  }
  assert.deepEqual(offenders, [],
    'This workflow pins Node 22 and installs with scripts, so it compiles canvas from source and the runner cannot.');
});

test('a cache key a pull-request-only job depends on is one a main-running workflow writes', () => {
  // Collect every key written by a workflow that runs on pushes to main.
  const restorableOnEveryPr = new Set();
  for (const source of sources.values()) {
    if (!writesCacheOnDefaultBranch(source)) continue;
    for (const key of cacheKeys(source)) restorableOnEveryPr.add(key);
  }
  assert.ok(restorableOnEveryPr.size > 0, 'No workflow writes a cache on main; the premise of this law is gone');

  const unreadable = [];
  for (const [name, source] of sources) {
    if (writesCacheOnDefaultBranch(source)) continue;      // it writes its own
    for (const key of cacheKeys(source)) {
      if (!key.startsWith('nm-')) continue;                // node_modules caches only
      if (!restorableOnEveryPr.has(key)) unreadable.push(`${name}: ${key}`);
    }
  }
  assert.deepEqual(unreadable, [],
    'This key is written only on pull-request branches, so it can never be restored and the job always installs cold.');
});

test('the Undefined Identifier Guard is pinned to the tree it restores', () => {
  const guard = sources.get('undefined-identifier-guard.yml');
  assert.ok(guard, 'the guard workflow exists');
  // Node version and cache key must agree, or the restored tree is the wrong one.
  assert.match(guard, /node-version:\s*'24\.12\.0'/);
  assert.match(guard, /key:\s*nm-wh-noscripts-\$\{\{ runner\.os \}\}-node24-/);
  assert.match(guard, /npm ci --ignore-scripts/);
});
