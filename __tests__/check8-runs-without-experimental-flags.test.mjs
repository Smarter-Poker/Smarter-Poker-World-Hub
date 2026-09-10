/**
 * LAW: CHECK 8 must be runnable by a plain `node --test`
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS
 *   On 2026-09-09, CHECK 8 was RED on main - 7 failing tests on every run, all
 *   from one file, and it had been red since that file was added to the import
 *   chain in `_test-guards-exist.test.mjs`.
 *
 *   The file was not broken. `training-request-deadline.test.mjs` builds its
 *   subject with `new vm.SourceTextModule(...)`, which exists only under
 *   `node --experimental-vm-modules`. Run with the flag it is 12/12; run
 *   without it, 7 of 12 throw "vm.SourceTextModule is not a constructor". It
 *   already had a correct home in the `test:training:phase6-authority` script,
 *   which passes the flag. Someone imported it into CHECK 8 as well, and CHECK
 *   8 is invoked as a plain `node --test` by
 *   .github/workflows/build-safety-gate.yml.
 *
 *   That is the section 10.8 shape exactly: a gate that fails on every run
 *   stops being a gate, because everyone learns to read past it.
 *
 * WHAT IT PINS
 *   No test reachable from `_test-guards-exist.test.mjs` may depend on a node
 *   flag that CHECK 8 does not pass. Today that means `vm.SourceTextModule`
 *   and `vm.SyntheticModule`, both of which require --experimental-vm-modules.
 *   A test that needs one belongs in a package.json script that supplies it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHAIN = join(HERE, '_test-guards-exist.test.mjs');

/** APIs that only exist when node gets --experimental-vm-modules. */
const FLAG_ONLY = /\bnew\s+vm\.(SourceTextModule|SyntheticModule)\b/;

/**
 * This file is the one legitimate exception: it has to name the API in its own
 * pattern and prose, so it matches itself. Only THIS file is skipped, by exact
 * name - not a directory, not a prefix - and the control below proves the
 * detector still fires on a file that really does use the API.
 */
const SELF = 'check8-runs-without-experimental-flags.test.mjs';

/** Every test file `_test-guards-exist.test.mjs` imports, one level deep. */
function importedByChain() {
    const src = readFileSync(CHAIN, 'utf8');
    const out = [];
    for (const m of src.matchAll(/^\s*import\s+'(\.\.?\/[^']+)';/gm)) {
        out.push(m[1]);
    }
    return out;
}

test('the chain file exists and imports a meaningful number of tests', () => {
    assert.ok(existsSync(CHAIN), '_test-guards-exist.test.mjs is missing');
    const imports = importedByChain();
    // Control: if the import scraper broke, this law would pass while reading
    // nothing, which is the failure mode it exists to prevent elsewhere.
    assert.ok(
        imports.length > 50,
        `only found ${imports.length} imports in the CHECK 8 chain - the scraper is broken`
    );
});

test('no test in the CHECK 8 chain needs --experimental-vm-modules', () => {
    const offenders = [];
    for (const rel of importedByChain()) {
        const p = join(HERE, rel);
        if (!existsSync(p)) continue; // a missing import is a different law's job
        if (rel.endsWith(SELF)) continue; // see SELF above
        if (FLAG_ONLY.test(readFileSync(p, 'utf8'))) offenders.push(rel);
    }
    assert.deepEqual(
        offenders,
        [],
        'these are imported by CHECK 8 but need --experimental-vm-modules, so they ' +
            'throw "vm.SourceTextModule is not a constructor" on every run. Move them to a ' +
            'package.json script that passes the flag:\n  ' + offenders.join('\n  ')
    );
});

test('the detector really fires on a file that uses the flag-only API', () => {
    // Control. Without this, a broken FLAG_ONLY pattern - or an over-broad
    // exclusion - would leave the law green while detecting nothing, which is
    // the exact failure it was written to catch elsewhere.
    const real = join(HERE, 'training-request-deadline.test.mjs');
    assert.ok(existsSync(real), 'the known flag-dependent test is missing');
    assert.ok(
        FLAG_ONLY.test(readFileSync(real, 'utf8')),
        'FLAG_ONLY no longer matches a file that genuinely uses new vm.SourceTextModule'
    );
    // and it must NOT be in the chain
    assert.ok(
        !importedByChain().some((r) => r.endsWith('training-request-deadline.test.mjs')),
        'training-request-deadline.test.mjs is back in the CHECK 8 chain and will turn it red'
    );
});

test('the flag-dependent test still runs somewhere that passes the flag', () => {
    const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
    const scripts = Object.values(pkg.scripts || {});
    const flagged = scripts.filter((s) => s.includes('--experimental-vm-modules'));
    assert.ok(flagged.length > 0, 'no script passes --experimental-vm-modules at all');
    assert.ok(
        flagged.some((s) => s.includes('training-request-deadline.test.mjs')),
        'training-request-deadline.test.mjs was removed from CHECK 8 and must still run ' +
            'in a script that passes --experimental-vm-modules, or its coverage is simply gone'
    );
});
