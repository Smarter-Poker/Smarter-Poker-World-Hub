import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
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

// Execute the maintained hook with real Node module resolution. Only the
// unrelated guards and the Title Case scanner's verdict are fixture inputs;
// no push, network call, dependency installation, or application scan occurs.
async function pushHook({ parser = 'absent', titleExit = 0, uiExit = 0, jsExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'wh-pre-push-'));
  try {
    const put = (name, body) => {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), body);
    };
    put('.husky/pre-push', await readFile(new URL('../.husky/pre-push', import.meta.url)));
    put('scripts/guard-merged-branch.sh', 'printf "merged\\n" >> "$TRACE"\n');
    put('scripts/hooks/pre-push-js-safety.sh', 'printf "js\\n" >> "$TRACE"\nexit "${JS_EXIT:-0}"\n');
    const mark = (name, exit) => `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.TRACE, '${name}\\n');\nprocess.exit(${exit});\n`;
    put('scripts/ci/check-ui-text.mjs', mark('ui', uiExit));
    put('scripts/ci/check-title-case.mjs', "import 'typescript';\n" + mark('title', titleExit));
    if (parser !== 'absent') {
      put('node_modules/typescript/package.json', JSON.stringify({ name: 'typescript', main: parser === 'broken' ? 'missing.js' : 'index.js' }));
      if (parser === 'present') put('node_modules/typescript/index.js', 'module.exports = {};\n');
    }
    const env = { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH, NODE_PATH: '', NODE_OPTIONS: '', TRACE: join(root, 'trace'), JS_EXIT: String(jsExit) };
    assert.equal(spawnSync('git', ['init', '--quiet', root], { env, encoding: 'utf8' }).status, 0);
    const result = spawnSync('/bin/sh', ['.husky/pre-push', 'origin', 'unused-fixture-remote'], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    return { ...result, trace: readFileSync(env.TRACE, 'utf8').trim().split('\n') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('missing TypeScript explicitly defers only Title Case and keeps pure guards', async () => {
  const result = await pushHook();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.trace, ['merged', 'js', 'ui']);
  assert.match(result.stdout, /DEFERRED: Title Case was not run locally/);
  assert.match(result.stdout, /Required Pre-Deploy Safety Checks \/ CHECK 20 must pass before merge/);
});

test('present TypeScript executes Title Case and preserves its failing verdict', async () => {
  for (const titleExit of [0, 9]) {
    const result = await pushHook({ parser: 'present', titleExit });
    assert.equal(result.status, titleExit === 0 ? 0 : 1, result.stderr);
    assert.deepEqual(result.trace, ['merged', 'js', 'ui', 'title']);
    assert.doesNotMatch(result.stdout, /DEFERRED/);
  }
});

test('a broken installed parser blocks instead of being called absent', async () => {
  const result = await pushHook({ parser: 'broken' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED: could not resolve the Title Case parser/);
  assert.doesNotMatch(result.stdout, /DEFERRED/);
});

test('missing TypeScript cannot erase either earlier pure guard failure', async () => {
  for (const options of [{ uiExit: 7 }, { jsExit: 8 }]) {
    const result = await pushHook(options);
    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(result.trace, ['merged', 'js', 'ui']);
  }
});

test('the deferred command stays blocking in the required PR safety job', async () => {
  const workflow = await readFile(new URL('../.github/workflows/build-safety-gate.yml', import.meta.url), 'utf8');
  const job = workflow.split('\n  safety-checks:\n')[1]?.split(/\n  [a-z][a-z-]*:\n/)[0];
  assert.ok(job);
  assert.match(job, /^    name: Pre-Deploy Safety Checks$/m);
  assert.match(job, /^    if: github.event_name == 'pull_request'$/m);
  assert.doesNotMatch(job, /^    continue-on-error:/m);
  const step = job.split('      - name: "CHECK 20: Title Case on every player-facing page"\n')[1]?.split(/\n      - /)[0];
  assert.ok(step);
  assert.match(step, /^          node scripts\/ci\/check-title-case\.mjs$/m);
  assert.match(step, /could not install the TypeScript parser CHECK 20 needs.*exit 1/);
  assert.doesNotMatch(step, /^        (?:if|continue-on-error):/m);
});
