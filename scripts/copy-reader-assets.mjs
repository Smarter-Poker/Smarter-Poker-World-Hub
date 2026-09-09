#!/usr/bin/env node
/**
 * BOTH READER ENGINES, IN ONE COMMAND, BECAUSE THE BUILD COMMAND HAS A LIMIT.
 *
 * vercel.json's `buildCommand` may be at most 256 characters. Chaining the
 * two copy scripts into it directly came to 280, and Vercel does not warn or
 * truncate: it refuses the whole deployment.
 *
 *   The `vercel.json` schema validation failed with the following message:
 *   `buildCommand` should NOT be longer than 256 characters
 *
 * Two production deploys errored that way on 2026-09-09 before anybody
 * noticed, because the limit is a Vercel-side schema rule and nothing in this
 * repo measured it. __tests__/vercel-json-is-deployable.law.test.mjs measures
 * it now, and this script is what keeps the command short.
 *
 * It runs both copies and fails if either does. Nothing else.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Every engine a reader fetches from our own origin rather than a CDN. */
export const COPY_SCRIPTS = [
    'scripts/copy-tesseract-assets.mjs',
    'scripts/copy-pdfjs-assets.mjs',
];

for (const script of COPY_SCRIPTS) {
    const run = spawnSync(process.execPath, [path.join(ROOT, script)], {
        stdio: 'inherit',
        cwd: ROOT,
    });
    if (run.status !== 0) {
        console.error(`[copy-reader-assets] ${script} failed with ${run.status}. A missing engine is a reader that never works.`);
        process.exit(run.status || 1);
    }
}
