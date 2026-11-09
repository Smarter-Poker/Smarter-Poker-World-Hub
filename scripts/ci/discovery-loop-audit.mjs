/*
 * FIND TESTS THAT COULD PASS BY READING NOTHING (2026-11-09).
 *
 * A test that discovers its subjects from the filesystem and then asserts
 * inside a loop over them reports success when the discovery returns nothing.
 * The files move, the loop runs zero times, every assertion is skipped, and
 * the suite goes green over an empty room.
 *
 * Shared by the law test and runnable on its own to see the list.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const TEST_DIR = '__tests__';
const DISCOVERY = /\b(?:readdirSync|globSync)\s*\(/;

/** Names bound to a filesystem discovery, with the loop that consumes them. */
export function unguardedDiscoveryLoops(dir = TEST_DIR) {
    const findings = [];
    for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
        const source = readFileSync(join(dir, file), 'utf8');
        if (!DISCOVERY.test(source)) continue;
        const bound = [...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*([^;]*?(?:readdirSync|globSync)[^;]*);/gs)];
        for (const [, name] of bound) {
            const consumed = new RegExp(`for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+${name}\\b`).test(source)
                || new RegExp(`${name}\\s*\\.\\s*(?:forEach|map)\\s*\\(`).test(source);
            if (!consumed) continue;
            // Any assertion that mentions the collection's length counts as a
            // guard: `assert.ok(x.length > 0)`, `assert.equal(x.length, 21)`.
            // A Set has .size, an array has .length; either counts as a guard.
            const guarded = new RegExp(`assert[^\\n]*\\b${name}\\s*\\.\\s*(?:length|size)`).test(source);
            if (!guarded) findings.push({ file, name });
        }
    }
    return findings;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    const findings = unguardedDiscoveryLoops();
    for (const { file, name } of findings) console.log(`${file}  ->  ${name}`);
    console.log(`---- ${findings.length} unguarded discovery loops`);
}
