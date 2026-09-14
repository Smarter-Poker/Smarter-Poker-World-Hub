/**
 * THE PROVISIONER'S HELPERS ARE AS FRESH AS THE PROVISIONER.
 *
 * agent-workspace.sh already knows the clone it runs from is not kept current.
 * It fetches, compares itself against origin/main, and re-execs main's copy if
 * they differ - and its comment explains why that is an exec and not a warning:
 * "An agent reading a warning has to decide whether a 624-commit-old
 * provisioner matters, with no information to decide it with."
 *
 * That fixes THIS script. It does not fix the scripts it then runs by path,
 * because $ROOT still points at the same stale working tree.
 *
 * MEASURED 2026-09-14, with the Hub clone 334 commits behind origin/main and
 * Club Arena 1,288:
 *
 *   1. The last line of the file called check-node-modules.sh with no
 *      existence check. That helper is newer than the checkout, so a run ended
 *      in a bare `bash: .../check-node-modules.sh: No such file or directory`
 *      and the node_modules repair never ran. The same helper is guarded with
 *      `-x` 300 lines earlier - the file already knew to check, in one place.
 *
 *      It had something to repair: when the clone was brought current and the
 *      provisioner re-run, it reported "THE SHARED node_modules IS GUTTED
 *      (missing typescript)" and fixed it. Every tree cloned from that clone
 *      had been coming up without typescript.
 *
 *   2. WORSE, AND SILENT. SNAP was resolved from ${BASH_SOURCE[0]}, which after
 *      a re-exec is a file in $TMPDIR - so it became
 *      /tmp/agent-trees-snapshot.sh, did not exist, and `[ -f "$SNAP" ]` turned
 *      the whole thing into a no-op.
 *
 *      agent-trees-snapshot.sh is what makes uncommitted work survive
 *      `git reset --hard`. It stopped running exactly when the clone was stale,
 *      which is exactly when trees are most likely to be old and holding work
 *      nobody has pushed. Between them those two clones held 899 modified
 *      tracked files, and the snapshot had not run in either.
 *
 * So a helper is resolved the way the script resolves itself. Not a warning,
 * for the same reason.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'scripts/agent-workspace.sh'), 'utf8');

/** Lines that are real code, not the commentary that explains the code. */
const code = src.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');

test('no helper is shelled by a bare path into the stale clone', () => {
    // The whole bug in one assertion. $ROOT is the main clone's WORKING TREE.
    const bare = [...code.matchAll(/bash "\$\{?ROOT\}?\/[^"]+"/g)].map((m) => m[0]);
    assert.deepEqual(bare, [], `these run whatever that checkout happens to hold: ${bare.join(', ')}`);
});

test('and none is resolved from BASH_SOURCE, which the re-exec moves to /tmp', () => {
    assert.ok(!/BASH_SOURCE\[0\][^\n]*agent-trees-snapshot/.test(code),
        'after the re-exec this resolved into $TMPDIR and the snapshot silently stopped running');
});

test('the resolver prefers the checkout only when it matches origin/main', () => {
    const fn = code.slice(code.indexOf('run_repo_script() {'));
    assert.ok(fn.length > 200, 'run_repo_script must exist');
    assert.match(fn, /git -C "\$ROOT" show "origin\/main:\$rel"/, 'main is the reference copy');
    assert.match(fn, /\[ -r "\$disk" \] && \[ "\$main_copy" = "\$\(cat "\$disk"\)" \]/,
        'the disk copy is used only when it is identical to main');
});

test('a helper that exists nowhere is said, not crashed through', () => {
    // The original symptom was a raw shell error with no explanation. Anything
    // is better than that, and saying so is best.
    const fn = code.slice(code.indexOf('run_repo_script() {'));
    assert.match(fn, /not on origin\/main - skipped/);
    // Every caller is best-effort; the resolver must not take the run down.
    assert.match(fn, /return 0/);
});

test('the steps that matter all go through it', () => {
    for (const helper of [
        'scripts/check-node-modules.sh',
        'scripts/ensure-hooks.sh',
        'scripts/check-unpushed-work.sh',
        'scripts/agent-trees-snapshot.sh',
    ]) {
        assert.match(code, new RegExp(`run_repo_script ${helper.replace(/[/.]/g, '\\$&')}`),
            `${helper} must be resolved, not assumed`);
    }
});

test('the snapshot still runs from the clone, not from wherever the script sits', () => {
    // It walks that repo's worktrees, so cwd decides which repo it protects.
    const fn = code.slice(code.indexOf('run_repo_script() {'));
    assert.match(fn, /cd "\$ROOT" && bash/, 'helpers run with the clone as cwd');
});

test('it is defined before anything calls it', () => {
    const defined = code.indexOf('run_repo_script() {');
    const firstCall = code.search(/run_repo_script scripts\//);
    assert.ok(defined > -1 && firstCall > defined,
        'a function called above its definition is a silent no-op in bash');
});
