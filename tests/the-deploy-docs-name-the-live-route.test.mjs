/**
 * LAW: no document in this repo tells an agent to publish Club Arena from here.
 *
 * Added 2026-09-04. Club Arena stopped publishing through the World Hub on
 * 2026-09-03: it builds in its own repo and rsyncs to its own origin, and this
 * repo carries ONE rewrite. The scripts, the vendored directory and the sync
 * workflow are all deleted from main.
 *
 * Four documents in this repo did not get the message, and three of them were
 * live instructions in the present tense with no banner:
 *
 *   - .agent/workflows/club-arena-rebuild.md said "THE ONLY WAY TO DEPLOY ...
 *     No exceptions" over `bash scripts/build-club-arena.sh`, and listed
 *     "NEVER gitignore public/hub/club-arena/" as HARD LAW - the exact inverse
 *     of what .gitignore says.
 *   - scripts/hooks/pre-commit-core.sh - an EXECUTING git hook - printed
 *     `bash scripts/sync-club-arena.sh` as its remediation, and offered two
 *     escape hatches (ARENA_BUILD=1, MERGE_HEAD) that would have let the
 *     directory back in.
 *   - .agent/AGENT-OPERATIONS-GUIDE.md had drifted from Club Arena's copy of
 *     the same file, and still described the sync as the publish path.
 *   - AGENT-DEPLOYMENT-GUIDE.md, 294 lines under a MANDATORY READING banner,
 *     described downloading 200+ chunks from a Club Arena Vercel project and
 *     pushing them here with the Git Trees API.
 *
 * WHY A STALE INSTRUCTION IS WORSE THAN A MISSING ONE, here specifically:
 * Next.js serves public/ BEFORE a rewrite. So an agent that followed any of
 * those would not have created a harmless duplicate - it would have SHADOWED
 * the live bundle. Production keeps serving the committed copy while
 * publish-club-arena.yml publishes into the void, and nothing anywhere reports
 * a problem.
 *
 * This is a text law, not a behaviour test, because the failure mode is a
 * human or an agent reading prose and doing what it says.
 *
 * DELIBERATELY NOT A BARE SEARCH for "vercel" or "World Hub": both legitimately
 * appear in these files - this repo really does deploy to Vercel, and the
 * history of the cutover is worth keeping. What must not survive is an
 * INSTRUCTION.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/**
 * Prose that TELLS you to do a dead thing.
 *
 * The Club Arena copy of this law required a literal `bash ` prefix, so
 * `~/Documents/Smarter-Poker-World-Hub/scripts/build-club-arena.sh` on its own
 * line, and "run scripts/sync-club-arena.sh", both evaded it. These match the
 * script name wherever it appears with a path, which is the only way it can be
 * written as an instruction.
 */
const DEAD_INSTRUCTIONS = [
  [/\bvercel\s+--prod\b/i, 'tells the reader to deploy with the Vercel CLI'],
  [/scripts\/sync-club-arena\.sh/i, 'names a sync script deleted from main'],
  [/scripts\/build-club-arena\.sh/i, 'names a build script deleted from main'],
  [/scripts\/sync-to-world-hub\.sh/i, 'names a sync script deleted from main'],
  [/scripts\/antigravity-deploy\.sh/i, 'names a deploy script deleted from main'],
  [/MUST be set in Vercel dashboard/i, 'sends the reader to a dashboard that governs nothing'],
];

/**
 * A mention is allowed when the surrounding text says the thing is GONE. Every
 * one of these files carries the correction now, and the corrections have to be
 * allowed to name what they are correcting or the law forbids its own fix.
 */
const RETIREMENT_WORDS =
  /\b(deleted|retired|gone|no longer|does not exist|REPLACED|REWRITTEN|CORRECTED|stays deleted|used to|forbid[s]?|forbidden|must not|never|No `)\b|\*\*No `/i;

/**
 * Records of what HAPPENED, not instructions for what to do. An audit of the
 * 2026-08-21 publish deadlock has to be able to name the script that
 * deadlocked, and a handoff written in May has to be able to say what its
 * author was told to run. Sanitising history would destroy the only account of
 * why these rules exist - and nobody opens a dated audit looking for today's
 * deploy command. The line between the two is the directory.
 */
const HISTORY_DIRS = ['.agent/audits/', '.agent/handoffs/', 'docs/changelog/', 'docs/_archive/'];

/** Line-level: a naming is fine, an instruction is not. */
function deadInstructionsIn(text) {
  const found = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const [pattern, why] of DEAD_INSTRUCTIONS) {
      if (!pattern.test(lines[i])) continue;
      // The exemption window is DELIBERATELY ONE LINE EITHER SIDE. A wider
      // window let `.agent/workflows/completion-protocol.md` off, because an
      // unrelated "FORBIDDEN" in a CAUTION block twelve lines above sat in the
      // same paragraph as a live instruction to "run `npx vercel --prod`
      // locally". A prohibition or a correction that actually governs the line
      // is written next to it - "**No `vercel --prod`.**" in the same table
      // cell, "CLAUDE.md 1.3 forbids ..." in the same sentence.
      const context = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
      if (RETIREMENT_WORDS.test(context)) continue;
      found.push(`line ${i + 1}: ${why} -> ${lines[i].trim().slice(0, 100)}`);
    }
  }
  return found;
}

/** Every tracked doc and script an agent might read or run. */
function docsAndScripts() {
  const SKIP = new Set([
    'node_modules',
    '.git',
    '.next',
    'dist',
    'coverage',
    'public',
    '.agent-trees',
    '_to_delete',
    '_archive',
    'playwright-report',
    'test-results',
    '.venv',
  ]);
  const out = [];
  const walk = (dir) => {
    // withFileTypes, and SYMLINKS ARE SKIPPED. Caught in the Club Arena copy
    // of this law on 2026-09-04: a CI checkout carries a dangling
    // `.node_modules` symlink (agents link the shared install in rather than
    // reinstalling), and `statSync` on a dangling link throws ENOENT - so the
    // law passed on every machine where the target existed and failed on the
    // runner. A symlink is never a document this repo is responsible for.
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.name.startsWith('.tmp') || entry.isSymbolicLink()) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.(md|sh)$/.test(entry.name)) out.push(relative(ROOT, full));
    }
  };
  walk(ROOT);
  return out;
}

test('no markdown or shell file in this repo gives a dead deploy instruction', () => {
  const offenders = [];
  for (const path of docsAndScripts()) {
    // This file quotes every dead instruction on purpose.
    if (path === 'tests/the-deploy-docs-name-the-live-route.test.mjs') continue;
    if (HISTORY_DIRS.some((d) => path.startsWith(d))) continue;
    const found = deadInstructionsIn(read(path));
    if (found.length) offenders.push(`${path}\n    ${found.join('\n    ')}`);
  }
  assert.equal(
    offenders.length,
    0,
    'these files tell an agent to publish Club Arena from this repo, which would ' +
      'SHADOW the live bundle rather than duplicate it:\n  ' +
      offenders.join('\n  ')
  );
});

test('the documents an agent opens first name the route that exists', () => {
  for (const path of [
    '.agent/workflows/club-arena-rebuild.md',
    'AGENT-DEPLOYMENT-GUIDE.md',
    'AGENTS-PUSH-GUIDE.md',
  ]) {
    const text = read(path);
    assert.match(text, /ca-static\.smarter\.poker/, `${path} does not name the origin`);
    assert.match(text, /publish-club-arena\.yml/, `${path} does not name the publisher`);
    assert.match(text, /build-info\.json/, `${path} does not say how to confirm a publish`);
  }
});

test('the pre-commit guard on the deleted directory has no escape hatch', () => {
  const hook = read('scripts/hooks/pre-commit-core.sh');
  // Executable lines only. The rewritten guard EXPLAINS in comments which two
  // escape hatches it removed and why, and a law that cannot tell a comment
  // from code would forbid its own explanation.
  const checkA = hook
    .slice(0, hook.indexOf('# ─── CHECK B'))
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  assert.ok(
    !/ARENA_BUILD:-0/.test(checkA),
    'ARENA_BUILD=1 would let the vendored bundle back in; the build script it ' +
      'was there for no longer exists'
  );
  assert.ok(
    !/MERGE_HEAD/.test(checkA),
    'the merge exemption would let a pre-deletion branch re-vendor the bundle'
  );
  assert.match(checkA, /exit 1/, 'CHECK A must still block');
});

test('the deleted directory and its scripts are actually gone from disk', () => {
  for (const path of [
    'public/hub/club-arena',
    'scripts/sync-club-arena.sh',
    'scripts/build-club-arena.sh',
    '.github/workflows/club-arena-scheduled-deploy.yml',
  ]) {
    assert.ok(!existsSync(join(ROOT, path)), `${path} is back - it must not be`);
  }
});


const POLICY_FILES = [
  'OWNER-POLICY.md', 'OPERATING-LAW.md', 'HARDENING.md', 'REFERENCE-INDEX.md',
];
const FIRST_OPEN_DOCS = [
  'AGENT-PLAYBOOK.md', 'AGENTS-PUSH-GUIDE.md', 'CLAUDE.md',
  '.agents/rules/00-agent-playbook.md',
];
const RETIRED_ACTIVE_DIRECTIONS = [
  /your job ends at [“"`]push a branch/i,
  /autopilot (?:squash-)?merges (?:it |only |the moment)/i,
  /gh[^\n]{0,20}is NOT installed/i,
  /migrations[^\n]*will be applied by CI/i,
  /root retains sole (?:integration|release)/i,
];

test('the root loader reaches the portable policy and every policy file exists', () => {
    const loader = read('AGENTS.md');
    for (const file of POLICY_FILES) {
        assert.ok(loader.includes(`docs/agent-policy/${file}`));
        assert.ok(read(`docs/agent-policy/${file}`).trim());
    }
});

test('first-open guides do not reinstate retired release or environment directions', () => {
    for (const file of FIRST_OPEN_DOCS) {
        for (const retired of RETIRED_ACTIVE_DIRECTIONS) {
            assert.doesNotMatch(read(file), retired, file);
        }
    }
});

// The existing required publication gate also verifies local pre-push refusal.
import "../__tests__/pre-push-typescript-baseline-safety.test.mjs";


test('active agent templates cannot restore human gates or hook bypass directions', () => {
  const retired = /Always needs human:|Require human-verify checkpoint|Only return this after human verification|Wait for confirmation[.]|Use [`]?--no-verify[`]? on (?:all )?(?:git )?commits/i;
  function inspect(directory) {
    for (const entry of readdirSync(join(ROOT, directory), { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (entry.isFile() && path.endsWith('.md')) assert.doesNotMatch(read(path), retired, path);
    }
  }
  for (const directory of ['.agent/agents', '.agent/get-shit-done', '.agent/skills', '.agent/workflows']) inspect(directory);
});

import { verifyPolicy } from '../docs/agent-policy/agent-policy.mjs';
test('the active policy hashes and tool version match their reviewed manifest', () => {
  assert.equal(verifyPolicy(join(ROOT, 'docs/agent-policy')).policyVersion, '2.9');
});
