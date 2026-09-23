/**
 * THE REF GUARD MAY NOT SAY "NOT ON ORIGIN" WITHOUT LOOKING AT ORIGIN
 * ─────────────────────────────────────────────────────────────────────────
 * .husky/reference-transaction is the only hook that fires before a
 * `git reset --hard origin/main` lands, and its job is to refuse an update
 * that would orphan work nobody else has a copy of.
 *
 * Until 2026-09-21 it decided that with one command:
 *
 *     ORPHANED=$(git log "$NEW..$OLD" --oneline)
 *
 * and then printed "They are NOT on origin" about whatever came back. That
 * range answers "reachable from OLD, not from NEW". It says nothing at all
 * about origin, and the hook had not read a single origin ref. Measured in
 * this repository on 2026-09-21: commit a45bc57c, which
 * `git branch -r --contains` lists on
 * origin/rescue/world-hub-news-search-2026-09-21, was reported NOT on origin
 * by exactly that line. CLAUDE.md 10.86, rule 1 - a check answering
 * confidently when it has not asked - and the cost is not cosmetic, because
 * the recovery the message then prescribes is the wrong one.
 *
 * These tests pin the three outcomes it must now have. The first of them is
 * the one that matters most: the guard must still REFUSE genuinely unpushed
 * work. A fix that made the hook quieter by making it permissive would pass a
 * "does it lie" test and lose the next session's commits.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HOOK = resolve(process.cwd(), '.husky/reference-transaction');
const ZERO = '0'.repeat(40);

function git(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commit(cwd, name) {
  writeFileSync(join(cwd, name), name);
  git(cwd, ['add', name]);
  git(cwd, ['commit', '-q', '-m', name]);
  return git(cwd, ['rev-parse', 'HEAD']);
}

/**
 * Run the hook exactly as git does: argv[1] = "prepared", one
 * "<old> <new> <ref>" line per ref update on stdin.
 *
 * CI and GITHUB_ACTIONS are deliberately deleted from the child environment.
 * The hook returns 0 immediately when either is set (a runner moves refs
 * backwards as a matter of course), so leaving them in place would make every
 * assertion below pass for the wrong reason - the same shape of false green
 * this whole file is about.
 */
function runHook(cwd, lines) {
  const env = { ...process.env };
  delete env.CI;
  delete env.GITHUB_ACTIONS;
  delete env.AGENT_REF_GUARD_OK;
  // spawnSync, not execFileSync: on a ZERO exit execFileSync hands back stdout
  // and throws the stderr away, and the allowed path says everything it has to
  // say on stderr. A test that could only read the failing runs would be
  // asserting on half the behaviour.
  const r = spawnSync('bash', [HOOK, 'prepared'], {
    cwd,
    env,
    input: lines.map((l) => `${l}\n`).join(''),
    encoding: 'utf8',
  });
  return { code: r.status, out: String(r.stdout || ''), err: String(r.stderr || '') };
}

/** A clone with a real origin, a pushed branch, and an unpushed commit. */
function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'refguard-'));
  const origin = join(root, 'origin.git');
  const work = join(root, 'work');
  git(root, ['init', '-q', '--bare', '-b', 'main', origin]);
  git(root, ['clone', '-q', origin, work]);
  const base = commit(work, 'base');
  git(work, ['push', '-q', 'origin', 'main']);
  return { root, origin, work, base };
}

describe('.husky/reference-transaction', () => {
  test('LOST: it still refuses an update that drops a commit no origin ref has', () => {
    const { root, work, base } = scratch();
    try {
      const only = commit(work, 'unpushed');
      const r = runHook(work, `${only} ${base} refs/heads/main`.split('\n'));

      assert.equal(r.code, 1, 'a genuinely unpushed commit must be refused');
      assert.match(r.err, /BLOCKED/);
      assert.match(r.err, new RegExp(only.slice(0, 7)), 'it names the commit it is protecting');
      assert.match(r.err, /refs\/wip\/orphan-guard\//, 'it saves the old tip first');
      // The snapshot is a real ref holding the real commit, not just a string
      // in a message. Blocking and saving are different jobs.
      const snap = git(work, ['for-each-ref', '--format=%(objectname)', 'refs/wip/orphan-guard']);
      assert.equal(snap, only);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('SAFE: a commit that IS on an origin ref is not called lost, and is not refused', () => {
    const { root, work, base } = scratch();
    try {
      // The exact shape of the 2026-09-21 measurement: the work lives on a
      // branch that has been pushed, and main is being moved off it.
      git(work, ['checkout', '-q', '-b', 'rescue/thing']);
      const pushed = commit(work, 'pushed');
      git(work, ['push', '-q', 'origin', 'rescue/thing']);

      const r = runHook(work, `${pushed} ${base} refs/heads/main`.split('\n'));

      assert.equal(r.code, 0, 'work that origin already holds must not be refused');
      assert.doesNotMatch(r.err, /NOT on origin/, 'the old falsehood must not come back');
      assert.doesNotMatch(r.err, /BLOCKED/);
      assert.match(r.err, /already on an origin ref/);
      assert.match(r.err, /rescue\/thing/, 'it names the ref that carries them');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('MIXED: it blocks, and names only the commits origin does not have', () => {
    const { root, work, base } = scratch();
    try {
      git(work, ['checkout', '-q', '-b', 'shared']);
      const pushed = commit(work, 'pushed');
      git(work, ['push', '-q', 'origin', 'shared']);
      const unpushed = commit(work, 'unpushed');

      const r = runHook(work, `${unpushed} ${base} refs/heads/main`.split('\n'));

      assert.equal(r.code, 1);
      assert.match(r.err, new RegExp(unpushed.slice(0, 7)), 'the one at risk is listed');
      assert.doesNotMatch(
        r.err,
        new RegExp(pushed.slice(0, 7)),
        'the one origin already has is not listed as lost'
      );
      assert.match(r.err, /1 of the 2 commit\(s\)/, 'it counts both halves honestly');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('UNKNOWN: an unreadable range is refused with its own exit code, never read as clean', () => {
    const { root, work, base } = scratch();
    try {
      const missing = 'a'.repeat(40); // no such object
      const r = runHook(work, `${missing} ${base} refs/heads/main`.split('\n'));

      assert.equal(r.code, 3, 'UNKNOWN has its own code and does not share it with LOST or clean');
      assert.match(r.err, /UNKNOWN/);
      assert.doesNotMatch(r.err, /NOT on origin/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('UNKNOWN: a clone with no origin refs cannot claim anything is missing from origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'refguard-noorigin-'));
    try {
      const work = join(root, 'solo');
      git(root, ['init', '-q', '-b', 'main', work]);
      const base = commit(work, 'base');
      const tip = commit(work, 'tip');

      const r = runHook(work, `${tip} ${base} refs/heads/main`.split('\n'));

      assert.equal(r.code, 3);
      assert.match(r.err, /no refs\/remotes\/origin/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('a ref creation or deletion is still ignored, and a non-main ref is not its business', () => {
    const { root, work, base } = scratch();
    try {
      const only = commit(work, 'unpushed');
      assert.equal(runHook(work, [`${ZERO} ${only} refs/heads/main`]).code, 0);
      assert.equal(runHook(work, [`${only} ${ZERO} refs/heads/main`]).code, 0);
      assert.equal(runHook(work, [`${only} ${base} refs/heads/feature`]).code, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('the hook does not point at a retired shared-clone publisher', () => {
    const { root, work, base } = scratch();
    try {
      const only = commit(work, 'unpushed');
      const r = runHook(work, [`${only} ${base} refs/heads/main`]);
      // 10.86 rule 4: a fix that leaves the next person reaching for something
      // that does not apply has not landed. PUBLISHING.md is the active route;
      // git-safe-push.sh is the retired shared-clone path.
      assert.doesNotMatch(r.err, /git-safe-push\.sh/);
      assert.match(r.err, /PUBLISHING\.md/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
