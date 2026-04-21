// ═════════════════════════════════════════════════════════════════════════
// phase-b-verify unit tests — pure-logic coverage only (no network).
//
// The net/DB-bound code paths (fetchWithRetry, findPostMergeDeploy,
// openAutoRevertPr, listPendingVerify) are exercised by the live
// staging/DRY_RUN runs on cron-01; here we only pin the small amount of
// pure logic exported for testing, so broken imports or typo'd PROJECTS
// entries fail fast in CI.
// ═════════════════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';

import { projectForRepo, PROJECTS } from './phase-b-verify.mjs';

test('PROJECTS: every entry has the required shape', () => {
  assert.ok(Array.isArray(PROJECTS));
  assert.ok(PROJECTS.length >= 1, 'at least one project wired up');
  for (const p of PROJECTS) {
    assert.equal(typeof p.projectId, 'string');
    assert.match(p.projectId, /^prj_/, 'projectId looks like a Vercel prj_ id');
    assert.equal(typeof p.vercelName, 'string');
    assert.equal(typeof p.githubRepo, 'string');
    assert.match(p.githubRepo, /^[^/]+\/[^/]+$/, 'githubRepo is owner/name');
  }
});

test('projectForRepo: returns the matching project', () => {
  const p = projectForRepo('Smarter-Poker/Smarter-Poker-World-Hub');
  assert.ok(p, 'hub-vanguard should be resolvable from the main WH repo');
  assert.equal(p.vercelName, 'hub-vanguard');
});

test('projectForRepo: returns undefined for an unmapped repo', () => {
  assert.equal(projectForRepo('some/other-repo'), undefined);
});

test('projectForRepo: does not match partial repo strings', () => {
  // Guard against a future refactor where repo lookup uses startsWith
  // or substring matching — that would cross-wire the dispatcher.
  assert.equal(projectForRepo('Smarter-Poker/Smarter-Poker'), undefined);
  assert.equal(projectForRepo('Smarter-Poker-World-Hub'), undefined);
});
