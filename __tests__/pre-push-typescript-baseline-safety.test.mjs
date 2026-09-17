import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const hookUrl = new URL('../scripts/hooks/pre-push-js-safety.sh', import.meta.url);

test('TypeScript pre-push baseline never mutates the current worktree or shared stash', async () => {
  const hook = await readFile(hookUrl, 'utf8');

  assert.doesNotMatch(hook, /^\s*git stash\b/m);
  assert.doesNotMatch(hook, /^\s*git stash pop\b/m);
  assert.match(hook, /worktree add --detach/);
  assert.match(hook, /core\.hooksPath=\/dev\/null/);
  assert.match(hook, /worktree remove --force/);
});

test('TypeScript pre-push comparison is safe when Husky invokes a shell wrapper', async () => {
  const hook = await readFile(hookUrl, 'utf8');

  assert.doesNotMatch(hook, /<\(\s*(?:echo|printf)/);
  assert.match(hook, /grep -Fqx "\$error_line"/);
});

// Execute the maintained guard against actual isolated Git candidates. Git
// variables exported by a parent hook must never redirect fixture operations.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.startsWith('GIT_') && !['NODE_PATH', 'NODE_OPTIONS'].includes(key)));
function candidateFixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'hub-push-candidate-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, env: fixtureEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'candidate');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const commit = (name, source) => {
    writeFileSync(join(cwd, name), source);
    git('add', '--', name);
    git('commit', '-m', 'fixture');
  };
  commit('README.md', 'base\n');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  const run = (input = '') => spawnSync('bash', [fileURLToPath(hookUrl)], {
    cwd, env: fixtureEnv, input, encoding: 'utf8', timeout: 10000,
  });
  return { cwd, git, commit, run, base };
}

test('a missing Babel parser blocks an application change older than five commits', (t) => {
  const f = candidateFixture(t);
  f.commit('page.jsx', 'export default () => <main />;\n');
  for (let i = 0; i < 6; i++) f.commit('notes.md', `note ${i}\n`);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /PUSH BLOCKED:.*@babel\/parser is unavailable/);
});

test('missing TypeScript blocks even when the parser can be resolved', (t) => {
  const f = candidateFixture(t);
  f.commit('page.ts', 'export const count: number = 1;\n');
  const parser = join(f.cwd, 'node_modules/@babel/parser');
  mkdirSync(parser, { recursive: true });
  writeFileSync(join(parser, 'index.js'), '// resolution-only fixture; parsing must not start\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /PUSH BLOCKED:.*TypeScript is unavailable/);
});

test('ordinary documentation needs no application parser', (t) => {
  const f = candidateFixture(t);
  f.commit('notes.md', 'documentation only\n');
  const result = f.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /No JS\/TS files changed/);
});

test('a different pushed revision cannot borrow current checkout evidence', (t) => {
  const f = candidateFixture(t);
  f.commit('notes.md', 'new candidate\n');
  const result = f.run(`refs/heads/old ${f.base} refs/heads/old ${'0'.repeat(40)}\n`);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /check each pushed revision in its own checkout/);
});

test('uncommitted tracked bytes cannot qualify the committed candidate', (t) => {
  const f = candidateFixture(t);
  writeFileSync(join(f.cwd, 'README.md'), 'different working bytes\n');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stdout, /commit tracked changes/);
});
