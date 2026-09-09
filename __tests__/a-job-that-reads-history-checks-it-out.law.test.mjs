/**
 * A JOB THAT READS HISTORY CHECKS IT OUT.
 *
 * `actions/checkout` defaults to fetch-depth: 1 - one commit, no ancestry.
 * publish-watchdog.yml ran that way until 2026-09-09 while two scripts in the
 * same job read history, and one of them states the opposite in a comment:
 * "the workflow checks main out with full history, so every question here is
 * answerable by git in a few seconds with no API at all."
 *
 * Club Arena's copy of the same workflow has carried `fetch-depth: 0` since
 * 2026-09-02, with a comment naming this exact failure. The fix was written
 * once and never carried across, so World Hub kept the bug and the reassuring
 * comment together.
 *
 * MEASURED ON 2026-09-09, on a real depth-1 clone of this repository:
 *
 *   git cat-file -e <the commit production serves>
 *     -> fatal: Not a valid object name
 *
 *   git log -200 --format=%T origin/main
 *     -> 1 line. The script wants 200.
 *
 *   the stranded-branch sweep
 *     -> 293 branches named, against 272 with real history. The 21 in
 *        between are FULLY MERGED - the compare API puts main behind_by=0
 *        on chore/remove-react-is-v2, commander-audit-1,
 *        fix/preflop-charts-bugs, training/table-pixel-reference and the
 *        rest - and each was reported to a human as "N commits ahead of
 *        main with no pull request. Nothing will ever merge it."
 *
 * git answers a question about a commit it does not have with a fatal error
 * on stderr, and every one of these calls ends in `2>/dev/null || echo 0`.
 * A wrong answer arrives looking exactly like a real one, which is why this
 * has to be a law and not a comment.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    auditWorkflows, checkoutDepth, historyCommandsIn, referencedScripts, stripComments,
} from '../scripts/ci/check-history-depth.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('no job reads git history at a depth that cannot answer', () => {
    const blind = auditWorkflows().filter((r) => !r.ok);
    assert.deepEqual(blind.map((r) => `${r.file}/${r.job}@${r.depth}`), [],
        `these read history without checking it out: ${blind.map((r) => `${r.file} ${r.job} (${r.needs.join(', ')})`).join(' | ')}`);
});

test('the publish watchdog checks out all of main, cheaply', () => {
    const wf = read('.github/workflows/publish-watchdog.yml');
    assert.match(wf, /fetch-depth: 0/, 'both scripts in this job read history');
    // Without blob:none this costs 103s against 23s, every push to main.
    assert.match(wf, /filter: blob:none/, 'full history is only free without the old blobs');
});

test('a comment about git is not a git command', () => {
    // report-stuck-prs.sh mentions `git rev-list` twice, in prose about an
    // earlier version, and runs no git at all. A scanner that reads comments
    // fails that file and gets itself ignored.
    const script = read('.github/scripts/report-stuck-prs.sh');
    assert.match(script, /git rev-list/, 'the prose really is in there');
    assert.deepEqual(historyCommandsIn(script), [],
        'commented-out git is not a reason to slow a workflow down');
});

test('a # inside quotes or a parameter expansion does not start a comment', () => {
    assert.equal(stripComments("git log --format='%h #%n' -5").trim(), "git log --format='%h #%n' -5");
    assert.equal(stripComments('n=${#items[@]}').trim(), 'n=${#items[@]}');
    assert.equal(stripComments('echo hi   # git merge-base').trim(), 'echo hi');
    assert.equal(stripComments('# git merge-base').trim(), '');
});

test('the cheap everyday git commands do not demand a full clone', () => {
    // These are correct at depth 1 and are in half the workflows in the repo.
    // Demanding history for them would cost real time on every run for nothing.
    for (const cheap of ['git rev-parse HEAD', 'git log -1 --format=%H', 'git status --porcelain', 'git show -s --format=%ct HEAD']) {
        assert.deepEqual(historyCommandsIn(cheap), [], `${cheap} works at depth 1`);
    }
});

test('the commands that genuinely need ancestry are all caught', () => {
    const cases = [
        ['git merge-base --is-ancestor "$A" "$B"', 'git merge-base'],
        ['git cat-file -e "${SERVED}^{commit}"', 'git cat-file -e'],
        ['git rev-list --count origin/main..origin/$BR', 'git rev-list'],
        ['git log -200 --format=%T origin/main', 'git log -N'],
        ['git describe --tags', 'git describe'],
    ];
    for (const [cmd, why] of cases) {
        assert.ok(historyCommandsIn(cmd).includes(why), `${cmd} needs history`);
    }
});

test('a missing fetch-depth is read as the default of 1, not as absent', () => {
    // The original bug in one line: nothing said "1" anywhere, so nothing
    // looked wrong.
    assert.equal(checkoutDepth({ uses: 'actions/checkout@v4', with: { ref: 'main' } }), 1);
    assert.equal(checkoutDepth({ uses: 'actions/checkout@v4' }), 1);
    assert.equal(checkoutDepth({ uses: 'actions/checkout@v4', with: { 'fetch-depth': 0 } }), 0);
    // A quoted 0 from YAML is still all of history.
    assert.equal(checkoutDepth({ uses: 'actions/checkout@v4', with: { 'fetch-depth': '0' } }), 0);
});

test('the scripts a run block hands to an interpreter are followed', () => {
    const found = referencedScripts('bash .github/scripts/publish-watchdog.sh', ROOT);
    assert.equal(found.length, 1);
    assert.match(found[0], /publish-watchdog\.sh$/);
    // A path that does not exist is not invented.
    assert.deepEqual(referencedScripts('bash scripts/nope-not-here.sh', ROOT), []);
});

test('the audit actually looks at the watchdog, and knows why', () => {
    // A guard that silently stopped matching would pass forever. Pin the
    // subject: this job must remain one the audit examines.
    const row = auditWorkflows().find((r) => r.file === 'publish-watchdog.yml');
    assert.ok(row, 'the publish watchdog job reads history and must stay audited');
    assert.ok(row.needs.some((n) => n.includes('publish-watchdog.sh')));
    assert.ok(row.needs.some((n) => n.includes('orphan-work-watchdog.sh')));
});
