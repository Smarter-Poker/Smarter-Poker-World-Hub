/**
 * LAW: unfinished work is never proposed and never auto-merged.
 *
 * Added 2026-11-27 for PR #3170. An agent pushed
 * `bookmark/video-library-smarterdesign-2026-11-27` as a handoff bookmark, head
 * commit "wip(video-library): bookmark ... unfinished, see handoff". Agent
 * Branch Proposal signalled it, Agent Open PR opened #3170 for it, and Agent
 * Autopilot armed protected squash auto-merge, which landed unapproved UI in
 * production at 20:20:47Z.
 *
 * Both halves now call `.github/scripts/unfinished-work-guard.sh`. This runs
 * the real script, so it tests what the script DOES, and reads the real
 * workflows, so neither half can stop calling it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const GUARD = join(ROOT, '.github', 'scripts', 'unfinished-work-guard.sh');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function guard(branch, subject, draft) {
  const args = [GUARD, branch, subject];
  if (draft !== undefined) args.push(String(draft));
  const res = spawnSync('bash', args, { encoding: 'utf8' });
  return { status: res.status, out: `${res.stdout}${res.stderr}` };
}

test('the exact PR #3170 branch and head commit are held', () => {
  const r = guard(
    'bookmark/video-library-smarterdesign-2026-11-27',
    'wip(video-library): bookmark 2026-11-27 lane C mid-pass (explanations to help, de-nest frames); unfinished, see handoff',
  );
  assert.equal(r.status, 10, r.out);
});

test('bookmark/, wip/ and handoff/ branches are held whatever the commit says', () => {
  for (const branch of [
    'bookmark/x',
    'wip/x',
    'handoff/x',
    'WIP/x',
    'agent/claude/bookmark/x',
    'agent/claude/handoff-2026-11-27',
  ]) {
    const r = guard(branch, 'fix(header): keep the help icon in place');
    assert.equal(r.status, 10, `${branch}\n${r.out}`);
  }
});

test('a head commit that starts with wip or says bookmark or unfinished is held on any branch', () => {
  for (const subject of [
    'wip: half a header',
    'WIP(video): frames',
    '[WIP] frames',
    'wip',
    'feat(video): save a bookmark for the next agent',
    'docs: Bookmark for lane C',
    'refactor: frames (unfinished)',
  ]) {
    const r = guard('agent/claude/video-frames', subject);
    assert.equal(r.status, 10, `${subject}\n${r.out}`);
  }
});

test('a draft pull request is held, so it can never be auto-merged', () => {
  const r = guard('agent/claude/ready-work', 'fix: ready work', true);
  assert.equal(r.status, 10, r.out);
  assert.match(r.out, /draft/);
});

test('finished work on an ordinary agent branch still proceeds', () => {
  for (const [branch, subject] of [
    ['agent/claude/header-help', 'fix(header): keep the help icon in place'],
    ['fix/wipe-stale-cache', 'fix: wipe stale cache entries'],
    ['agent/claude-evidence/evidence/header-help-2026-11-27', 'evidence: screenshots for PR #3168'],
  ]) {
    const r = guard(branch, subject, false);
    assert.equal(r.status, 0, `${branch} / ${subject}\n${r.out}`);
  }
});

test('a missing branch is a usage error, never a pass', () => {
  const r = guard('', 'fix: x');
  assert.notEqual(r.status, 0);
  assert.notEqual(r.status, 10);
});

test('Agent Branch Proposal does not even signal for bookmark/, handoff/ or wip/', () => {
  const proposal = read('.github/workflows/agent-branch-proposal.yml');
  for (const p of ['bookmark', 'handoff', 'wip']) {
    assert.match(proposal, new RegExp(`branches-ignore:[\\s\\S]*?- '${p}/\\*\\*'`), p);
  }
});

test('Agent Open PR refuses held prefixes and runs the guard before gh pr create', () => {
  const openPr = read('.github/workflows/agent-open-pr.yml');
  for (const p of ['bookmark', 'handoff', 'wip']) {
    assert.match(openPr, new RegExp(`!startsWith\\(github\\.event\\.workflow_run\\.head_branch, '${p}/'\\)`), p);
  }
  const guardIdx = openPr.indexOf('.github/scripts/unfinished-work-guard.sh');
  const createIdx = openPr.indexOf('gh pr create');
  assert.ok(guardIdx > 0 && createIdx > guardIdx, 'the guard must run before the PR is created');
  assert.match(openPr.slice(guardIdx, createIdx), /"\$HOLD_RC" = "10"[\s\S]*?exit 0/);
});

test('Agent Autopilot arms auto-merge only after the guard says the PR is not held', () => {
  const autopilot = read('.github/workflows/agent-autopilot.yml');
  assert.match(autopilot, /types:\s*\[[^\]]*converted_to_draft[^\]]*\]/, 'a PR turned back to draft must be disarmed');
  assert.match(autopilot, /bash \.github\/scripts\/unfinished-work-guard\.sh "\$BRANCH" "\$SUBJECT" "\$DRAFT"/);

  const queueJob = autopilot.slice(autopilot.indexOf('\n  queue-pr:'), autopilot.indexOf('\n  hold-unfinished-work:'));
  assert.match(queueJob, /needs:\s*classify/);
  assert.match(queueJob, /needs\.classify\.outputs\.hold == 'false'/);
  assert.match(queueJob, /github\.event\.pull_request\.draft == false/);

  const holdJob = autopilot.slice(autopilot.indexOf('\n  hold-unfinished-work:'));
  assert.match(holdJob, /needs\.classify\.outputs\.hold == 'true'/);
  assert.match(holdJob, /--disable-auto/);
  assert.doesNotMatch(holdJob, /--squash/, 'the hold job never merges anything');
});
