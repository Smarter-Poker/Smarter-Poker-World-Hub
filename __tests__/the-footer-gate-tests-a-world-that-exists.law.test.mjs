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

// ---------------------------------------------------------------------------
// 2026-09-19. The same failure, twice more, found by running the gate by hand
// after the Marketplace restoration rather than by anything watching it.
//
// One: Phase 2 gave five Marketplace stores their own in-flow commerce footer
// and excluded them from the global matrix in pages/_app.js and in the matrix
// generator. The Playwright spec kept its own third copy of that set and was
// not updated, so it walked 194 routes against a document that states 191 and
// demanded a global footer on four routes that deliberately no longer have one.
//
// Two: the Poker Arena lobby assertion read
// `getByRole('navigation', { name: 'Poker Arena' })`. Playwright matches that
// name as a case-insensitive SUBSTRING unless told otherwise, so when the lobby
// gained an in-content "Poker Arena Resources" links list the gate reported a
// footer on a page that renders none.
//
// Neither could block anything: Global Footer E2E is still not a required
// check. Both are pinned here instead, in the file `prebuild` runs, because a
// check that nobody can see is not a check.

const FOOTER_SPEC = 'e2e/global-footer-visual.spec.ts';
const MATRIX_GENERATOR = 'scripts/generate-world-footer-route-matrix.mjs';
const APP = 'pages/_app.js';

// The one route excluded from the matrix that the runtime does not suppress:
// it answers on the server with a redirect, so there is no footer to remove.
const REDIRECT_ONLY_ROUTE = '/hub/marketplace';

const routeSet = (rel, identifier) => {
    const source = read(rel);
    const opening = new RegExp(`${identifier}\\s*=\\s*new Set\\(\\[`).exec(source);
    assert.ok(opening, `${rel} no longer declares ${identifier} as a Set literal`);
    const start = opening.index + opening[0].length;
    const end = source.indexOf(']', start);
    assert.ok(end > start, `${rel} declares ${identifier} without a closing bracket`);
    return source.slice(start, end)
        .split(',')
        .map((entry) => entry.replace(/\/\/.*$/gm, '').trim())
        .filter(Boolean)
        .map((entry) => {
            const quoted = /^['"](.+)['"]$/.exec(entry);
            assert.ok(quoted, `${rel} lists a non-literal route in ${identifier}: ${entry}`);
            return quoted[1];
        })
        .sort();
};

test('the walk and the document it is measured against exclude the same routes', () => {
    // The spec asserts its walked length equals the total printed in
    // docs/world-hub-footer-route-matrix.md. That total is produced by the
    // generator. If the two exclusion sets disagree the walk cannot match the
    // document, and the failure reads as a route-count drift rather than as
    // the stale copy it is.
    assert.deepEqual(
        routeSet(FOOTER_SPEC, 'PAGE_OWNED_FOOTER_ROUTES'),
        routeSet(MATRIX_GENERATOR, 'pageOwnedFooterRoutes'),
        `${FOOTER_SPEC} and ${MATRIX_GENERATOR} must exclude exactly the same routes`,
    );
});

test('the runtime suppresses the global footer on every excluded route that renders', () => {
    const excluded = routeSet(MATRIX_GENERATOR, 'pageOwnedFooterRoutes');
    assert.deepEqual(
        routeSet(APP, 'MARKETPLACE_PAGE_OWNED_FOOTER_ROUTES'),
        excluded.filter((route) => route !== REDIRECT_ONLY_ROUTE),
        `${APP} must suppress the footer on every excluded route but ${REDIRECT_ONLY_ROUTE}`,
    );
    assert.ok(excluded.includes(REDIRECT_ONLY_ROUTE), `${REDIRECT_ONLY_ROUTE} must stay excluded`);

    // Stated separately so a wrong exclusion cannot make the asymmetry above
    // vacuously correct: that route is excluded because it renders nothing.
    const stub = read('pages/hub/marketplace.js');
    assert.match(stub, /export async function getServerSideProps/);
    assert.match(stub, /redirect:\s*\{/);
    assert.match(stub, /destination:\s*`\/hub\/diamond-store\$\{query\}`/);
    assert.match(stub, /return null;/);
});

test('every route the walk excludes is still a page', () => {
    for (const route of routeSet(MATRIX_GENERATOR, 'pageOwnedFooterRoutes')) {
        const base = join(ROOT, 'pages', route.replace(/^\//, ''));
        const found = ['.js', '.jsx', '.ts', '.tsx']
            .flatMap((ext) => [`${base}${ext}`, join(base, `index${ext}`)])
            .some((candidate) => existsSync(candidate));
        assert.ok(found, `${route} is excluded from the footer matrix but no longer exists`);
    }
});

test('the walk probes each world where its global footer actually lives', () => {
    const spec = read(FOOTER_SPEC);
    const opening = /const WORLD_ROUTES = \[/.exec(spec);
    assert.ok(opening, `${FOOTER_SPEC} no longer declares WORLD_ROUTES`);
    const block = spec.slice(opening.index + opening[0].length, spec.indexOf('\n];', opening.index));
    const excluded = routeSet(FOOTER_SPEC, 'PAGE_OWNED_FOOTER_ROUTES');
    const probes = [...block.matchAll(/(?:route|childRoute):\s*'([^']+)'/g)].map((m) => m[1]);
    assert.ok(probes.length >= 2, 'WORLD_ROUTES must still probe routes');
    for (const probe of probes) {
        assert.ok(
            !excluded.includes(probe),
            `${probe} owns its own footer, so it cannot be used to assert the global one`,
        );
    }
});

test('a footer is identified by its exact name, never by a substring of one', () => {
    // `getByRole(role, { name })` is a case-insensitive substring match by
    // default. Every footer nav in this gate is looked up by an exact name so
    // that ordinary page content carrying a world's name in its own label
    // cannot be counted as, or mistaken for, that world's footer.
    const spec = read(FOOTER_SPEC);
    const lookups = [...spec.matchAll(/getByRole\(\s*'navigation'\s*,\s*\{([^}]*)\}/g)];
    assert.ok(lookups.length > 0, `${FOOTER_SPEC} no longer looks a footer up by role`);
    for (const lookup of lookups) {
        assert.match(
            lookup[1],
            /exact:\s*true/,
            `a navigation lookup in ${FOOTER_SPEC} matches a substring: {${lookup[1].trim()}}`,
        );
    }

    // The lobby must be provably footerless, not merely unnamed: the arena's
    // dock is the thing that must be absent, and it carries its own controls.
    const lobby = spec.slice(spec.indexOf("await visit(page, '/hub/club-arena');"));
    assert.match(
        lobby.slice(0, 900),
        /await expect\(page\.locator\('\[data-footer-control\]'\)\)\.toHaveCount\(0\);/,
        'the lobby must assert the arena dock is absent, not just that a name is',
    );
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
