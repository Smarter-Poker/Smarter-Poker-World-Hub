/**
 * A TEST THAT READS NOTHING FAILS.
 *
 * On 2026-11-09 a live probe reported "Draft A did not survive a reload"
 * twice. The drafts were in the account both times — read straight out of
 * messenger_conversation_state at draft_revision 1. What had actually
 * happened was that every read the probe made was refused by its own request
 * allowlist, and a refused read surfaced as an empty draft. The check that
 * came before it, "both fixture conversations started with no stored draft",
 * had been passing the whole time by reading nothing and finding nothing.
 *
 * That is the shape: a test cannot tell "I looked and it was fine" from
 * "I could not look". The second is reported as the first.
 *
 * The same shape sits in any test that discovers its subjects from the
 * filesystem and then asserts inside a loop over them. Move the files, the
 * loop runs zero times, every assertion is skipped, and the suite goes green
 * over an empty room. The Global Footer E2E incident recorded in
 * the-footer-gate-tests-a-world-that-exists.law has the same root: a test
 * whose subject had quietly stopped existing.
 *
 * Nine such loops existed when this law was written. Each now asserts a floor
 * drawn from the measured count, so a discovery that returns nothing — or
 * silently shrinks — fails loudly instead of passing quietly.
 *
 * A SECOND, RELATED FAULT, fixed in the same change: 43 files built paths
 * with `new URL(..., import.meta.url).pathname`. A file URL percent-encodes a
 * space, so in a checkout whose path contains one — which is every compliant
 * agent worktree here, since they live under "/Volumes/SmarterWork 1/" — the
 * path came back containing "%20" and every filesystem call on it threw
 * ENOENT. Those tests could never run where the house rules say to run them.
 * They now decode with fileURLToPath.
 */
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { unguardedDiscoveryLoops, TEST_DIR } from '../scripts/ci/discovery-loop-audit.mjs';

test('no test loops over a filesystem discovery without asserting it found something', () => {
    const findings = unguardedDiscoveryLoops();
    assert.deepEqual(findings.map(f => `${f.file} -> ${f.name}`), [],
        'This loop runs zero times if the discovery returns nothing, and the test still reports success. '
        + 'Assert a floor on the collection first.');
});

test('the audit actually reads the suite, and would catch a new offender', () => {
    // This law is itself a discovery-driven check, so it proves it can see.
    const files = readdirSync(TEST_DIR).filter(name => name.endsWith('.mjs'));
    assert.ok(files.length > 500, `Expected the test suite, found ${files.length} files`);
    const withDiscovery = files.filter(name => /readdirSync|globSync/.test(readFileSync(join(TEST_DIR, name), 'utf8')));
    assert.ok(withDiscovery.length > 20, `Expected many discovery-driven tests, found ${withDiscovery.length}`);
});

test('no file builds a path from import.meta.url without decoding it', () => {
    // "/Volumes/SmarterWork 1/..." becomes "/Volumes/SmarterWork%201/..." and
    // every fs call on it throws ENOENT. Worktrees live there by house rule.
    const offenders = [];
    for (const dir of [TEST_DIR, 'scripts', 'scripts/ci']) {
        let entries;
        try { entries = readdirSync(dir); } catch { continue; }
        for (const name of entries) {
            if (!/\.(?:mjs|js)$/.test(name)) continue;
            let source;
            try { source = readFileSync(join(dir, name), 'utf8'); } catch { continue; }
            // Prose about the fault is not the fault: strip comments first,
            // or every file that documents this law reports itself.
            const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
            if (/import\.meta\.url\)\.pathname/.test(code)) offenders.push(join(dir, name));
        }
    }
    assert.deepEqual(offenders, [],
        'Use fileURLToPath(new URL(..., import.meta.url)). A file URL percent-encodes a space, '
        + 'so .pathname cannot address a checkout whose path contains one.');
});
