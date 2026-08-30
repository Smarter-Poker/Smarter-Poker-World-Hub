/**
 * ═══ THE BUILD QUEUE MUST BELONG TO PRODUCTION FIRST (Dan 2026-08-30) ══════
 *
 * Measured 2026-08-29/30: a Club Arena fix merged, synced into this repo at
 * 03:55, and did not reach smarter.poker until ~04:20 — the Vercel build
 * concurrency pool was full of PREVIEW builds for `agent/*` branches pushed
 * by other agents in the same minutes. Not merely slow: the production deploy
 * for the sync commit was CANCELED while queued, and the change only shipped
 * by riding a later commit's build.
 *
 * `scripts/vercel-should-build.sh` is Vercel's Ignored Build Step:
 *     exit 0 = SKIP the build, exit 1 = BUILD.
 *
 * These run the REAL script against throwaway git repos, so they pin
 * behaviour rather than wording. The one that matters most is the third:
 * the Club Arena sync lands on main as a PRODUCTION deploy, and if the
 * agent-branch rule were ever applied without the preview check, that is the
 * build that would vanish — taking every Club Arena release with it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(HERE, '../scripts/vercel-should-build.sh');

/**
 * Run the gate in a throwaway repo holding two commits, so the script's own
 * `git diff HEAD~1 HEAD` resolves exactly as it does on Vercel.
 * @returns 0 when the build is SKIPPED, 1 when it PROCEEDS.
 */
function runGate({ env = {}, changedFile = 'pages/index.js' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'should-build-'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: dir, stdio: 'pipe', env: { ...process.env, HOME: dir } });
  try {
    git('init', '-q');
    git('config', 'user.email', 't@t.t');
    git('config', 'user.name', 't');
    writeFileSync(path.join(dir, 'seed.txt'), 'seed');
    git('add', '-A');
    git('commit', '-qm', 'seed');

    const target = path.join(dir, changedFile);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'change');
    git('add', '-A');
    git('commit', '-qm', 'change');

    try {
      execFileSync('bash', [SCRIPT], {
        cwd: dir,
        stdio: 'pipe',
        env: { ...process.env, HOME: dir, ...env },
      });
      return 0;
    } catch (err) {
      return err.status;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const PREVIEW = (ref) => ({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ref });
const PRODUCTION = { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' };

describe('agent branch previews never take a build slot', () => {
  test('an agent/* preview is skipped even though app code changed', () => {
    assert.equal(
      runGate({ env: PREVIEW('agent/cowork-x/fix/thing'), changedFile: 'pages/index.js' }),
      0
    );
  });

  test('production is NEVER skipped by the branch rule', () => {
    assert.equal(runGate({ env: PRODUCTION, changedFile: 'pages/index.js' }), 1);
  });

  test('THE ONE THAT MATTERS: a Club Arena sync on main still builds', () => {
    assert.equal(
      runGate({ env: PRODUCTION, changedFile: 'public/hub/club-arena/build-info.json' }),
      1,
      'the club-arena sync build was skipped — every Club Arena release would stop shipping'
    );
  });

  test('a non-agent preview still builds', () => {
    assert.equal(runGate({ env: PREVIEW('codex/some-fix'), changedFile: 'pages/index.js' }), 1);
  });

  test('a branch merely CONTAINING "agent" is not an agent branch', () => {
    assert.equal(
      runGate({ env: PREVIEW('feat/user-agent-parser'), changedFile: 'pages/index.js' }),
      1
    );
  });

  test('with no Vercel env at all (a local run) nothing is skipped by branch', () => {
    assert.equal(runGate({ env: {}, changedFile: 'pages/index.js' }), 1);
  });
});

describe('the 2026-05-18 docs-only saving is unchanged', () => {
  test('a docs-only production change is still skipped', () => {
    assert.equal(runGate({ env: PRODUCTION, changedFile: 'docs/notes.md' }), 0);
  });

  test('an app-code production change still builds', () => {
    assert.equal(runGate({ env: PRODUCTION, changedFile: 'src/lib/thing.js' }), 1);
  });
});
