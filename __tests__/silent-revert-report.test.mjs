import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const detector = fileURLToPath(new URL('../scripts/ci/detect-silent-revert.mjs', import.meta.url));

function history(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'silent-revert-report-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Regression Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  const commit = (content, subject) => {
    writeFileSync(join(cwd, 'feature.js'), content);
    git('add', 'feature.js');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '-qm', subject);
    return git('rev-parse', 'HEAD');
  };
  commit('original\n', 'initial implementation');
  const base = commit('improved\n', 'correct feature behavior');
  const report = (ref = base) => spawnSync(process.execPath, [detector, '--base', ref], { cwd, encoding: 'utf8' });
  return { commit, report };
}

test('an exact historical restoration remains visible without requiring a label', (t) => {
  const { commit, report } = history(t);
  commit('original\n', 'update feature');
  const result = report();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /SILENT REVERT DETECTED/);
  assert.match(result.stdout + result.stderr, /feature\.js/);
  assert.match(result.stdout + result.stderr, /correct feature behavior/);
  assert.doesNotMatch(result.stdout + result.stderr, /revert-approved|\[allow-revert\]|human approval/i);
});

test('declared restorations are also reported without a keyword bypass', (t) => {
  const { commit, report } = history(t);
  commit('original\n', 'revert feature for compatibility');
  const result = report();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /SILENT REVERT DETECTED/);
});

test('new behavior produces a clean report', (t) => {
  const { commit, report } = history(t);
  commit('further improved\n', 'extend feature');
  const result = report();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no .*reverts/);
});

test('unreadable history is an operational failure, not a clean report', (t) => {
  const { report } = history(t);
  const result = report('missing-ref');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /no .*reverts/);
});
