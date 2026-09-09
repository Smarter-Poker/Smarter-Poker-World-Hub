#!/usr/bin/env node
/**
 * WHICH WORLDS THE SIGNED-OUT FOOTER E2E CAN ACTUALLY VISIT.
 *
 * e2e/022, 023 and 024 open each world's command drawer as a visitor who is
 * not signed in (`storageState: { cookies: [], origins: [] }`). A world
 * belongs in that list only if such a visitor can reach a page that renders
 * its drawer.
 *
 * WHAT WENT WRONG. e2e/fixtures/world-menu-cases.ts kept a hand-written map
 * of world id to path. It agreed with the registry for 13 of 14 worlds. On
 * 2026-09-08 PR #1586 retired /hub/my-clubs to a 307 - the page was a
 * 1,127-line duplicate of Social Pages Managed and two of its three sections
 * had never worked - and the fourteenth entry was not updated. The spec kept
 * navigating to /hub/my-clubs, kept being redirected into the Social Media
 * world, and kept waiting ten seconds for a `my-clubs` drawer that was never
 * coming.
 *
 * It cost 152 failures in the last 200 Global Footer E2E runs, and every run
 * for the 16 hours after the redirect landed. The gate is not required, so it
 * blocked nothing - which is the damage. A real footer regression in that
 * window would have looked exactly like the noise.
 *
 * The retirement commit was careful. It checked the two node suites that pin
 * route counts and said so in its own message: "no test needs touching in the
 * same commit". The Playwright fixture was the one it could not see.
 *
 * THE PATH IS NOW DERIVED, THE EXCLUSION IS NOT.
 *
 * `routePrefixes[0]` is the world's canonical page and the registry already
 * held it, so the duplicated map is gone and cannot drift again.
 *
 * Reachability is NOT derived, and that is deliberate. The obvious version -
 * grep the page for a redirect or a push to /login - was written, run, and
 * thrown away: it called three worlds unreachable that pass this suite every
 * day. bankroll-manager's push to /login is inside an onClick. marketplace's
 * getServerSideProps redirect is conditional. diamond-arena's match was
 * `redirect: 'manual'`, a fetch option. A guard that is wrong about three of
 * fourteen is worse than no guard, because people learn to skip it.
 *
 * So an exclusion is written down, with the exact facts that justify it, and
 * __tests__/the-footer-gate-tests-a-world-that-exists.law.test.mjs asserts
 * those facts still hold. When they stop holding the law fails and a person
 * decides whether the world has earned its coverage back.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
export const REGISTRY_PATH = 'src/config/world-footer-navigation.json';

/**
 * Worlds a signed-out visitor cannot reach, and the exact reason.
 *
 * `evidence` is what the law re-checks: a literal that must still be present
 * in that file. Change the product and the law fails, by design.
 */
export const EXCLUSIONS_PATH = 'e2e/fixtures/world-menu-signed-out-exclusions.json';

/**
 * Worlds a signed-out visitor cannot reach, and the exact reason.
 *
 * Held in JSON rather than in this module because the Playwright specs read
 * the same list, and Playwright transpiles .ts to CommonJS: importing this
 * .mjs from a spec dies with "Cannot use 'import.meta' outside a module",
 * which Playwright then reports as "No tests found". A suite that passes by
 * running nothing is the same disease this file exists to cure, so the two
 * sides share data and never import each other.
 */
export function exclusions(root = ROOT) {
    return JSON.parse(readFileSync(join(root, EXCLUSIONS_PATH), 'utf8')).worlds;
}

/** The world's canonical page: the first route prefix it declares. */
export function canonicalPath(world) {
    const path = world?.routePrefixes?.[0];
    if (!path) throw new Error(`world ${world?.id} declares no routePrefixes; the visual spec has nowhere to go`);
    return path;
}

/** `/hub/my-venues` -> `pages/hub/my-venues.js`, or null when no file matches. */
export function pageFileFor(path, root = ROOT) {
    const clean = String(path).split('?')[0].replace(/\/$/, '');
    for (const ext of ['.js', '.jsx', '.ts', '.tsx']) {
        for (const rel of [`pages${clean}${ext}`, `pages${clean}/index${ext}`]) {
            if (existsSync(join(root, rel))) return rel;
        }
    }
    return null;
}

export function readRegistry(root = ROOT) {
    return JSON.parse(readFileSync(join(root, REGISTRY_PATH), 'utf8'));
}

/** Every world, its canonical path, and why the signed-out suite skips it (or null). */
export function surveyWorlds(root = ROOT) {
    return readRegistry(root).worlds.map((world) => ({
        id: world.id,
        label: world.label,
        path: canonicalPath(world),
        skip: exclusions(root)[world.id]?.why ?? null,
    }));
}

export function reachableWorlds(root = ROOT) {
    return surveyWorlds(root).filter((w) => w.skip === null);
}

/** Evidence entries whose literal is no longer in the file it names. */
export function staleExclusions(root = ROOT) {
    const stale = [];
    for (const [id, rule] of Object.entries(exclusions(root))) {
        for (const ev of rule.evidence) {
            const full = join(root, ev.file);
            if (!existsSync(full)) { stale.push({ id, ...ev, gone: 'the file' }); continue; }
            if (!readFileSync(full, 'utf8').includes(ev.contains)) stale.push({ id, ...ev, gone: 'the line' });
        }
    }
    return stale;
}

function main() {
    const rows = surveyWorlds();
    console.log('');
    console.log('  WORLDS THE SIGNED-OUT FOOTER E2E VISITS');
    console.log('');
    for (const r of rows) {
        console.log(`  ${r.skip ? 'skip' : ' ok '}  ${r.id.padEnd(20)} ${r.path.padEnd(28)} ${r.skip || ''}`);
    }
    console.log('');
    console.log(`  ${rows.filter((r) => !r.skip).length} of ${rows.length} worlds are covered.`);
    const stale = staleExclusions();
    if (stale.length) {
        for (const s of stale) {
            console.log(`::error::the reason "${s.id}" is skipped no longer holds: ${s.gone} "${s.contains}" is not in ${s.file}. Re-check whether it can be covered again.`);
        }
        return 1;
    }
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
    process.exit(main());
}
