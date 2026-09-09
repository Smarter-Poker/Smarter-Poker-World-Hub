/**
 * THE FOOTER GATE TESTS A WORLD THAT EXISTS.
 *
 * On 2026-09-08 PR #1586 retired /hub/my-clubs to a 307 into Social Pages
 * Managed. The world stayed in the registry; only the page went. But
 * e2e/fixtures/world-menu-cases.ts kept a SECOND, hand-written map of world
 * id to path, and that map still said /hub/my-clubs.
 *
 * So the Global Footer E2E navigated to a redirect, landed in the Social
 * Media world, and waited ten seconds for a `my-clubs` drawer. Twice per run.
 * Every run.
 *
 *   152 failures in the last 200 runs of that workflow.
 *   Zero successes in the 16 hours after the redirect landed.
 *
 * It is not a required check, so it blocked nothing. That IS the damage: a
 * real footer regression in that window was indistinguishable from the noise,
 * and by the time anyone looked, "Global Footer E2E is always red" had become
 * something everybody knew and nobody acted on.
 *
 * The retirement commit was careful. It checked the two node suites that pin
 * route counts, and said so in its own message: "no test needs touching in
 * the same commit". The Playwright fixture was the one it could not see from
 * there. That is the gap this law closes: the path is now derived from the
 * registry the product already maintains, and the one world that genuinely
 * cannot be covered is written down with the facts that make it true.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    canonicalPath, exclusions, pageFileFor, readRegistry,
    reachableWorlds, staleExclusions, surveyWorlds,
} from '../scripts/ci/world-menu-coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('every world the suite visits has a page file behind it', () => {
    const missing = reachableWorlds()
        .filter((w) => pageFileFor(w.path) === null)
        .map((w) => `${w.id} -> ${w.path}`);
    assert.deepEqual(missing, [], 'a world whose route has no page cannot render a drawer');
});

test('the path comes from the registry, not from a second list', () => {
    // The bug in one line: two lists, one of them stale. There is now one.
    for (const world of readRegistry().worlds) {
        const surveyed = surveyWorlds().find((w) => w.id === world.id);
        assert.equal(surveyed.path, canonicalPath(world), `${world.id} must use its own routePrefixes[0]`);
    }
    const fixture = read('e2e/fixtures/world-menu-cases.ts');
    assert.ok(!fixture.includes('PATH_BY_WORLD'), 'the hand-written path map must not come back');
});

test('the reason my-clubs is skipped is still true', () => {
    // If either of these stops being the case, the world may be coverable
    // again - and this failing is how somebody finds out.
    assert.deepEqual(staleExclusions(), [],
        'a skipped world is only skipped while its evidence holds');
    assert.deepEqual(Object.keys(exclusions()), ['my-clubs']);
});

test('my-clubs really is a redirect, and its own route really is gated', () => {
    // Stated separately from the evidence list so that a wrong evidence
    // string cannot make both this and the check above vacuously pass.
    const retired = read('pages/hub/my-clubs.js');
    assert.match(retired, /export async function getServerSideProps/);
    assert.match(retired, /redirect:\s*\{/);
    assert.match(retired, /MY_CLUBS_DESTINATION\s*=\s*'\/hub\/social-pages\?tab=managed'/);

    const world = readRegistry().worlds.find((w) => w.id === 'my-clubs');
    assert.equal(canonicalPath(world), '/hub/my-venues', 'the world itself points at my-venues');
    assert.match(read('pages/hub/my-venues.js'), /router\.push\('\/login\?redirect=\/hub\/my-venues'\)/);
});

test('the shared Arena retirement preserves the remaining world coverage', () => {
    const worlds = readRegistry().worlds;
    assert.equal(worlds.length, 13);
    assert.equal(reachableWorlds().length, 12);
    assert.ok(worlds.some((world) => world.id === 'my-clubs'));
    assert.ok(!worlds.some((world) => world.id === 'diamond-arena'));
    assert.deepEqual(
        worlds.filter((world) => !reachableWorlds().some((entry) => entry.id === world.id)).map((world) => world.id),
        ['my-clubs'],
    );
});

test('the specs say what went wrong instead of timing out', () => {
    // Sixteen hours of "Timeout 10000ms exceeded while waiting on the
    // predicate" said nothing about a redirect. Both specs now check where
    // they landed, first.
    for (const spec of ['e2e/022-world-menu-visual.spec.ts', 'e2e/023-world-menu-webkit.spec.ts']) {
        const src = read(spec);
        assert.match(src, /expectStillInWorld\(page, world\)/, `${spec} must check where it landed`);
        const goto = src.indexOf('page.goto(world.path');
        const check = src.indexOf('expectStillInWorld(page, world)');
        assert.ok(goto !== -1 && check > goto, `${spec} must check AFTER navigating`);
    }
});

test('a skipped world is left out of the cases the specs iterate', () => {
    const ids = reachableWorlds().map((w) => w.id);
    for (const skipped of Object.keys(exclusions())) {
        assert.ok(!ids.includes(skipped), `${skipped} is skipped and must not be iterated`);
    }
});

test('a stale snapshot does not outlive the world it pictured', () => {
    // The drawer marks the current route, so a snapshot taken at one path is
    // not reusable at another. A skipped world's references must go with it,
    // or the next person restoring coverage compares against a lie.
    for (const skipped of Object.keys(exclusions())) {
        for (const shot of ['desktop', 'mobile']) {
            const rel = `e2e/022-world-menu-visual.spec.ts-snapshots/${skipped}-${shot}.png`;
            assert.ok(!existsSync(join(ROOT, rel)), `${rel} pictures a world the suite no longer visits`);
        }
    }
});

test('the specs never import a module Playwright cannot transpile', () => {
    // Playwright compiles .ts specs to CommonJS. An `.mjs` that uses
    // `import.meta` throws "Cannot use 'import.meta' outside a module" at
    // load time, and Playwright reports that as "No tests found" - a suite
    // that passes by running nothing, which is exactly the failure this file
    // exists to prevent. Caught by running it; pinned so nobody has to.
    const fixture = read('e2e/fixtures/world-menu-cases.ts');
    const imports = [...fixture.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(imports.filter((i) => i.endsWith('.mjs')), [],
        'the specs and the node law share JSON, they do not import each other');
    assert.ok(imports.includes('./world-menu-signed-out-exclusions.json'),
        'the skip list must be the same file the law reads');
});
