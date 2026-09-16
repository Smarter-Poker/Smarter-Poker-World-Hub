import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const hookUrl = new URL('../scripts/hooks/pre-push-js-safety.sh', import.meta.url);

// Exercise the original selection block with real Git history and hook stdin.
// Stop before application checks; the existing tests below cover the outer gates.
function pushSelectionFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'wh-push-refs-'));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Hook fixture', GIT_AUTHOR_EMAIL: 'hook@example.invalid',
    GIT_COMMITTER_NAME: 'Hook fixture', GIT_COMMITTER_EMAIL: 'hook@example.invalid' };
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') && !['GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL',
      'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'].includes(key)) delete env[key];
  }
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const put = (name, body) => {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), body);
  };
  const commit = () => { git('add', '.'); git('commit', '--quiet', '-m', 'fixture'); return git('rev-parse', 'HEAD'); };
  const select = (input = '', remote = 'origin') => {
    const hook = readFileSync(hookUrl, 'utf8');
    const start = hook.indexOf('# Get list of changed files compared to remote');
    const end = hook.indexOf('\nif [ -z "$CHANGED_FILES" ]; then', start);
    assert.ok(start >= 0 && end > start, 'maintained selection boundary');
    const result = spawnSync('/bin/sh', ['-c', hook.slice(start, end) + '\nprintf \'%s\\n\' "$CHANGED_FILES"', 'pre-push', remote, 'unused-fixture-remote'],
      { cwd: root, env, input, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    return { ...result, files: result.stdout.trim().split('\n').filter(Boolean) };
  };
  const update = (local, remote, name = 'main') => `refs/heads/${name} ${local} refs/heads/${name} ${remote}\n`;
  try {
    git('init', '--quiet');
    put('old.js', 'export const old = 1;\n');
    const initial = commit();
    return run({ root, put, git, commit, select, update, initial, zero: '0'.repeat(initial.length) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('pre-push selects the Python-only update without replaying five commits of JS history', () => {
  pushSelectionFixture(({ put, git, commit, select, update }) => {
    put('old.js', 'export const old = 2;\n'); commit();
    for (let i = 0; i < 3; i++) { put('notes.txt', String(i)); commit(); }
    const previous = git('rev-parse', 'HEAD');
    put('wrapper.py', 'print("fixture")\n');
    const head = commit();
    assert.ok(git('diff', '--name-only', 'HEAD~5..HEAD').includes('old.js'));
    const result = select(update(head, previous));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.files, ['wrapper.py']);
  });
});

test('pre-push unions every ref range and includes both rename paths and deletions', () => {
  pushSelectionFixture(({ put, git, commit, select, update, initial, zero }) => {
    put('earlier.js', 'export const earlier = 1;\n');
    put('deleted.js', 'export const removed = 1;\n');
    const earlier = commit();
    git('mv', 'old.js', 'renamed.js'); git('rm', 'deleted.js');
    const head = commit();
    const result = select(update(head, earlier, 'one') + update(zero, initial, 'removed') + update(head, initial, 'two'));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.files, ['deleted.js', 'earlier.js', 'old.js', 'renamed.js']);
  });
});

test('pre-push absent input, new ref without baseline and unavailable remote base inspect all committed files', () => {
  pushSelectionFixture(({ put, commit, select, update, zero }) => {
    put('wrapper.py', 'print("fixture")\n'); const head = commit();
    for (const input of ['', update(head, zero), update(head, 'f'.repeat(head.length))]) {
      const result = select(input);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(result.files, ['old.js', 'wrapper.py']);
    }
  });
});

test('pre-push new ref uses only its actual remote main merge-base without rescanning published source', () => {
  pushSelectionFixture(({ put, git, commit, select, update, initial, zero }) => {
    put('old.js', 'export const alreadyPublished = 2;\n');
    const published = commit();
    git('update-ref', 'refs/remotes/fixture/main', published);
    git('update-ref', 'refs/remotes/origin/main', initial);
    put('wrapper.py', 'print("fixture")\n');
    const head = commit();
    const result = select(update(head, zero), 'fixture');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.files, ['wrapper.py']);
    // A resolvable main cannot narrow an existing ref with a missing old object.
    const unknown = select(update(head, 'f'.repeat(head.length)), 'fixture');
    assert.equal(unknown.status, 0, unknown.stderr);
    assert.deepEqual(unknown.files, ['old.js', 'wrapper.py']);
  });
});

test('pre-push deletion-only updates contain no new source to inspect', () => {
  pushSelectionFixture(({ select, update, initial, zero }) => {
    const result = select(update(zero, initial));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.files, []);
  });
});

test('pre-push rejects another or unresolvable local source instead of checking HEAD for it', () => {
  pushSelectionFixture(({ put, commit, select, update, initial }) => {
    put('later.js', 'export const later = 1;\n'); const head = commit();
    for (const local of [initial, 'f'.repeat(head.length)]) {
      const result = select(update(head, initial, 'one') + update(local, initial, 'two'));
      assert.equal(result.status, 1);
    }
  });
});

test('pre-push accepts an annotated tag of the actual checked commit', () => {
  pushSelectionFixture(({ git, select, update, initial, zero }) => {
    git('tag', '-a', 'fixture', '-m', 'fixture');
    const tag = git('rev-parse', 'fixture');
    assert.notEqual(tag, initial);
    const result = select(update(tag, zero));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.files, ['old.js']);
  });
});

test('pre-push cannot validate modified worktree or index bytes as committed source', () => {
  for (const staged of [false, true]) {
    pushSelectionFixture(({ put, git, select, update, initial, zero }) => {
      put('old.js', 'export const uncommitted = 1;\n');
      if (staged) git('add', 'old.js');
      const result = select(update(initial, zero));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /checked source differs/);
    });
  }
});

test('pre-push malformed update input is not treated as no changed files', () => {
  pushSelectionFixture(({ select, update, initial }) => {
    for (const input of ['not a Git update\n', update(initial, initial).trimEnd() + ' extra\n', update('-'.repeat(initial.length), initial)]) {
      const result = select(input);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /malformed Git pre-push/);
    }
  });
});

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
async function pushHook({ parser = 'absent', titleExit = 0, uiExit = 0, jsExit = 0, pushInput = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'wh-pre-push-'));
  try {
    const put = (name, body) => {
      mkdirSync(dirname(join(root, name)), { recursive: true });
      writeFileSync(join(root, name), body);
    };
    put('.husky/pre-push', await readFile(new URL('../.husky/pre-push', import.meta.url)));
    put('scripts/guard-merged-branch.sh', 'printf "merged\\n" >> "$TRACE"\n');
    put('scripts/hooks/pre-push-js-safety.sh', 'cat > "$PUSH_INPUT"\nprintf "js\\n" >> "$TRACE"\nexit "${JS_EXIT:-0}"\n');
    const mark = (name, exit) => `import { appendFileSync } from 'node:fs';\nappendFileSync(process.env.TRACE, '${name}\\n');\nprocess.exit(${exit});\n`;
    put('scripts/ci/check-ui-text.mjs', mark('ui', uiExit));
    put('scripts/ci/check-title-case.mjs', "import 'typescript';\n" + mark('title', titleExit));
    if (parser !== 'absent') {
      put('node_modules/typescript/package.json', JSON.stringify({ name: 'typescript', main: parser === 'broken' ? 'missing.js' : 'index.js' }));
      if (parser === 'present') put('node_modules/typescript/index.js', 'module.exports = {};\n');
    }
    const env = { ...process.env, PATH: dirname(process.execPath) + delimiter + process.env.PATH, NODE_PATH: '', NODE_OPTIONS: '', TRACE: join(root, 'trace'), PUSH_INPUT: join(root, 'push-input'), JS_EXIT: String(jsExit) };
    assert.equal(spawnSync('git', ['init', '--quiet', root], { env, encoding: 'utf8' }).status, 0);
    const result = spawnSync('/bin/sh', ['.husky/pre-push', 'origin', 'unused-fixture-remote'], { cwd: root, env, input: pushInput, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    return { ...result, trace: readFileSync(env.TRACE, 'utf8').trim().split('\n'), pushInput: readFileSync(env.PUSH_INPUT, 'utf8') };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('the outer hook forwards every Git ref update and still runs independent UI and title gates', async () => {
  const input = `refs/heads/one ${'1'.repeat(40)} refs/heads/one ${'0'.repeat(40)}\nrefs/heads/two ${'1'.repeat(40)} refs/heads/two ${'2'.repeat(40)}\n`;
  const result = await pushHook({ parser: 'present', pushInput: input });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.pushInput, input);
  assert.deepEqual(result.trace, ['merged', 'js', 'ui', 'title']);
});

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
