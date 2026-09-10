/**
 * A WORKTREE GETS A node_modules THAT WORKS
 *
 * On 2026-09-08 the World Hub's main clone held ONE package (typescript)
 * after a git-safe-push clean and a rolled-back install. agent-workspace.sh
 * cloned it faithfully into every tree claimed that day: no `next`, no
 * `tsc`, and a pre-push hook that died on check-title-case.mjs with
 * ERR_MODULE_NOT_FOUND. The script also called scripts/check-node-modules.sh,
 * which Club Arena has and this repo did not.
 *
 * Pinned here: the provisioner judges a source by its payload, borrows from
 * the freshest sibling with an identical lockfile when the main clone is
 * hollow, and the repair script exists, is executable, and skips the browser
 * downloads that take `npm ci` down on this Mac.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const code = (rel) => read(rel).replace(/^\s*#.*$/gm, '');

test('the provisioner judges the main clone by its payload and can borrow from a sibling', () => {
    const src = code('scripts/agent-workspace.sh');
    assert.match(src, /^node_modules_usable\(\) \{/m, 'a usability test exists');
    assert.match(src, /\[ -x "\$nm\/\.bin\/tsc" \] \|\| return 1/, 'the root needs the type checker binary');
    assert.match(src, /\[ "\$n" -ge 100 \] \|\| return 1/, 'and a real population');
    assert.match(src, /^find_node_modules_donor\(\) \{/m, 'a donor search exists');
    // 2026-09-10: the reference lockfile is the TREE's, not the main clone's.
    // A main clone behind origin/main has an install that matches its OWN old
    // lockfile, so judging a donor against it borrows the wrong dependency set.
    assert.match(src, /local lock="\$DIR\$\{rel:\+\/\$rel\}\/package-lock\.json"/, 'the donor is judged against the tree lockfile');
    assert.match(src, /cmp -s "\$cand\$\{rel:\+\/\$rel\}\/package-lock\.json" "\$lock" \|\| continue/, 'a donor must carry the tree lockfile');
    assert.match(src, /node_modules_matches_lockfile "\$nm" "\$lock" \|\| continue/, 'and its install must satisfy it');
    assert.match(src, /if ! node_modules_usable "\$src\/node_modules" "\$rel"; then/, 'the source is tested before it is cloned');
    assert.match(src, /bash "\$ROOT\/scripts\/check-node-modules\.sh"/, 'with no donor, the main clone is repaired');
});

test('an install is judged against a lockfile by npm’s own record, and a mismatched clone is finished with npm ci', () => {
    const src = code('scripts/agent-workspace.sh');
    assert.match(src, /^node_modules_matches_lockfile\(\) \{/m, 'the lockfile comparison exists');
    assert.match(src, /\.package-lock\.json/, 'npm’s own install record is what is read');
    assert.match(src, /v\.optional\) continue/, 'optional platform packages, empty by design, do not count');
    assert.match(src, /node_modules_matches_lockfile "\$src\/node_modules" "\$dst\/package-lock\.json"/, 'the source is checked against the tree lockfile');
    assert.match(src, /node_modules_matches_lockfile "\$dst\/node_modules" "\$dst\/package-lock\.json"/, 'and so is the clone, after it lands');
    assert.match(src, /\(cd "\$dst" && npm ci --no-audit --no-fund/, 'a mismatched clone is finished with npm ci in the tree itself');
});

test('the repair script exists here, runs, and installs without the browser downloads', () => {
    const rel = 'scripts/check-node-modules.sh';
    assert.ok(fs.existsSync(path.join(ROOT, rel)), 'Club Arena had it; this repo called it and did not');
    const mode = fs.statSync(path.join(ROOT, rel)).mode & 0o111;
    assert.ok(mode, 'a hook file committed non-executable is decorative');
    const src = code(rel);
    assert.match(src, /PUPPETEER_SKIP_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1/, 'puppeteer takes npm ci down on this Mac');
    assert.match(src, /npm ci --no-audit --no-fund/);
    for (const p of ['typescript', 'next', '@babel/core']) assert.match(src, new RegExp(p.replace('/', '\\/')), `${p} is probed`);
    assert.match(src, /--check/, 'a probe-only mode exists');
});
