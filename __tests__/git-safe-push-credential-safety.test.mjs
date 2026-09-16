import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptUrl = new URL('../scripts/git-safe-push.sh', import.meta.url);

test('the authenticated push URL is never persisted as the branch upstream', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.doesNotMatch(
    script,
    /git push[^\n]*--set-upstream[^\n]*\$AUTH_URL|git push[^\n]*--set-upstream[^\n]*"\$\{?AUTH_URL\}?"/,
  );
  assert.match(script, /git push[^\n]*"\$AUTH_URL"[^\n]*"HEAD:refs\/heads\/\$\{BRANCH\}"/);
  assert.match(script, /git update-ref "refs\/remotes\/\$\{REMOTE\}\/\$\{BRANCH\}" HEAD/);
  assert.match(
    script,
    /git branch --set-upstream-to="\$\{REMOTE\}\/\$\{BRANCH\}" "\$\{BRANCH\}"/,
  );
});

test('the credential-bearing URL is not printed explicitly', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.doesNotMatch(script, /echo[^\n]*(?:AUTH_URL|GH_TOKEN)/);
  assert.doesNotMatch(script, /printf[^\n]*(?:AUTH_URL|GH_TOKEN)/);
});

test('an already-contained remote branch does not rewrite a tested merge from main', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.doesNotMatch(script, /^\s*(?:if ! )?GIT_EDITOR=true git pull --rebase/m);
  assert.match(script, /git fetch "\$\{REMOTE\}" "\$\{BRANCH\}"/);
  assert.match(script, /git merge-base --is-ancestor FETCH_HEAD HEAD/);
  assert.match(script, /elif ! GIT_EDITOR=true git rebase FETCH_HEAD/);
});

test('a first push can create a feature branch without retrying an impossible fetch', async () => {
  const script = await readFile(scriptUrl, 'utf8');

  assert.match(script, /git ls-remote --heads "\$\{REMOTE\}" "refs\/heads\/\$\{BRANCH\}"/);
  assert.match(script, /REMOTE_BRANCH_MISSING=true/);
  assert.match(script, /is new; it will be created by this push/);
  assert.match(script, /if \[ "\$REMOTE_BRANCH_MISSING" = true \]/);
});


// Execute the actual submission entry against real isolated Git repositories.
// Only the GitHub transport/CLI is replaced; no credentials or network are used.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
const agentSource = readFileSync(process.env.AGENT_PUSH_TEST_SOURCE || new URL('../scripts/agent-push.sh', import.meta.url), 'utf8');
function fixture(t, { branch = 'agent/test', owned = true, auth = true, push = true, merge = true } = {}) {
  const temp = mkdtempSync(join(tmpdir(), 'agent-submit-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, owned ? '.agent-trees/test' : 'shared');
  const bin = join(temp, 'bin');
  mkdirSync(root, { recursive: true }); mkdirSync(bin);
  const git = (...args) => execFileSync(realGit, args, { cwd: root, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
  git('init', '-b', branch); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(join(root, 'change.txt'), 'before\n'); writeFileSync(join(root, 'other.txt'), 'preserve\n');
  git('add', 'change.txt', 'other.txt'); git('commit', '-m', 'baseline');
  const baseline = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'change.txt'), 'after\n');
  writeFileSync(join(root, 'other.txt'), 'unrelated dirty content\n');
  writeFileSync(join(root, 'submit.sh'), agentSource, { mode: 0o755 });
  writeFileSync(join(bin, 'git'), `#!/bin/bash
if [[ "$1 $2 $3" == 'remote get-url origin' ]]; then echo git@github.com:Smarter-Poker/Smarter-Poker-World-Hub.git; exit; fi
if [[ "$1" == fetch ]]; then exit; fi
if [[ "$1" == push ]]; then printf '%s\\n' "$*" >> "$TRACE"; exit ${push ? 0 : 1}; fi
exec "$REAL_GIT" "$@"
`, { mode: 0o755 });
  writeFileSync(join(bin, 'gh'), `#!/bin/bash
printf '%s\\n' "$*" >> "$TRACE"
case "$1 $2" in
 'auth status') exit ${auth ? 0 : 1} ;;
 'pr list') if [[ -f "$PR_CREATED" ]]; then echo 42; fi ;;
 'pr create') touch "$PR_CREATED"; echo https://github.com/Smarter-Poker/Smarter-Poker-World-Hub/pull/42 ;;
 'pr merge') exit ${merge ? 0 : 1} ;;
 *) exit 3 ;;
esac
`, { mode: 0o755 });
  // The original script must not be allowed to inspect the host keychain.
  writeFileSync(join(bin, 'security'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const trace = join(temp, 'trace');
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit, TRACE: trace, PR_CREATED: join(temp, 'pr'), GH_TOKEN:'', GITHUB_TOKEN:'' };
  delete env.GIT_DIR; delete env.GIT_WORK_TREE; delete env.GIT_INDEX_FILE;
  const run = (...paths) => spawnSync('bash', ['submit.sh', 'Repair submission', ...paths], { cwd: root, env, encoding:'utf8' });
  return { root, git, baseline, run, trace: () => existsSync(trace) ? readFileSync(trace,'utf8') : '' };
}

test('agent submission uses host auth and the exact existing branch, with protected auto-merge', (t) => {
  const f = fixture(t); const result = f.run('change.txt');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.git('show', 'HEAD:change.txt'), 'after');
  assert.equal(f.git('show', 'HEAD:other.txt'), 'preserve');
  assert.equal(readFileSync(join(f.root,'other.txt'),'utf8'), 'unrelated dirty content\n');
  assert.match(f.trace(), /push --set-upstream origin agent\/test/);
  assert.match(f.trace(), new RegExp(`pr merge 42 .*--auto --squash --match-head-commit ${f.git('rev-parse','HEAD')}`));
  assert.doesNotMatch(f.trace(), /--admin|x-access-token|--force|no-verify/);
  assert.match(result.stdout, /does not certify merge or publication/);
  assert.match(result.stdout, /no automatic World Hub publisher is installed/);
});
test('agent submission reuses its existing open PR on a repeated invocation', (t) => {
  const f=fixture(t); assert.equal(f.run('change.txt').status,0);
  const head=f.git('rev-parse','HEAD'); assert.equal(f.run('change.txt').status,0);
  assert.equal(f.git('rev-parse','HEAD'),head);
  assert.equal(f.trace().split('\n').filter(x=>x.startsWith('pr create ')).length,1);
});
test('agent submission preserves an existing staged index and refuses to sweep it in', (t) => {
  const f=fixture(t); f.git('add','other.txt'); const before=f.git('diff','--cached');
  assert.notEqual(f.run('change.txt').status,0); assert.equal(f.git('diff','--cached'),before);
  assert.equal(f.git('rev-parse','HEAD'),f.baseline); assert.equal(f.trace(),'');
});
test('agent submission refuses shared clones and main branches before changing anything', (t) => {
  for(const options of [{owned:false},{branch:'main'}]) {
    const f=fixture(t,options); assert.notEqual(f.run('change.txt').status,0);
    assert.equal(f.git('rev-parse','HEAD'),f.baseline); assert.equal(f.trace(),'');
  }
});
test('agent submission refuses traversal, directories and environment files', (t) => {
  const f=fixture(t);
  for(const path of ['../change.txt','.','.env.production.local',':(glob)*']) {
    assert.notEqual(f.run(path).status,0); assert.equal(f.git('rev-parse','HEAD'),f.baseline);
  }
  assert.equal(f.trace(),'');
});
test('missing host authentication leaves the reviewed files uncommitted and intact', (t) => {
  const f=fixture(t,{auth:false}); assert.notEqual(f.run('change.txt').status,0);
  assert.equal(f.git('rev-parse','HEAD'),f.baseline); assert.equal(f.git('diff','--cached'),'');
  assert.doesNotMatch(f.trace(),/push |pr create/);
});
test('failed transport retains the local commit and never requests a merge', (t) => {
  const f=fixture(t,{push:false}); const result=f.run('change.txt'); assert.notEqual(result.status,0);
  assert.notEqual(f.git('rev-parse','HEAD'),f.baseline); assert.equal(f.git('show','HEAD:change.txt'),'after');
  assert.doesNotMatch(f.trace(),/pr merge/); assert.doesNotMatch(result.stdout,/SUBMITTED:/);
});
test('merge refusal is visible and does not delete the producer branch', (t) => {
  const f=fixture(t,{merge:false}); const result=f.run('change.txt'); assert.notEqual(result.status,0);
  assert.equal(f.git('branch','--show-current'),'agent/test'); assert.doesNotMatch(result.stdout,/SUBMITTED:/);
});
