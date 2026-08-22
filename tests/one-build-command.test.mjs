/**
 * There is one way to build this application, and CI uses it.
 *
 * WHAT WENT WRONG
 *
 * .github/workflows/e2e-tests.yml built the app with a bare
 * `npx next build --webpack`. package.json's build script does two more things:
 *
 *   node scripts/patch-next.js            repairs a WebpackError constructor
 *                                         bug inside node_modules/next
 *   NODE_OPTIONS=--max-old-space-size=7168
 *
 * Without the heap headroom the build died with "Reached heap limit -
 * JavaScript heap out of memory". Not intermittently: 14 of the last 14 runs of
 * that workflow failed, across every branch in flight, including branches whose
 * entire diff was documentation.
 *
 * The cost was not the build. It was that "E2E Tests (Playwright): failure"
 * became the normal state of every pull request, so the one job that actually
 * drives a browser against the app stopped telling anyone anything - and would
 * have gone on saying exactly the same thing on the day a real regression
 * landed. A check that is red for everyone is not a check.
 *
 * WHAT THIS PINS
 *
 * Not the memory figure, and not the patch step - those live in package.json
 * where they belong, and this test would have to be edited every time they were
 * tuned. It pins the thing that actually failed: that no workflow builds the
 * app by some other route, where the two can silently disagree again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const WORKFLOWS = path.join(REPO, '.github/workflows');

function workflowFiles() {
    return fs
        .readdirSync(WORKFLOWS)
        .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map((f) => path.join(WORKFLOWS, f));
}

/** Lines that are actually run, not commented out. */
function runnableLines(source) {
    return source
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}

test('no workflow builds the app except through npm run build', () => {
    const offenders = [];
    for (const file of workflowFiles()) {
        const rel = path.relative(REPO, file);
        for (const line of runnableLines(fs.readFileSync(file, 'utf8'))) {
            // `npm run build`, with or without pass-through args, is the one
            // sanctioned form. Anything else that reaches `next build` is not.
            if (/\bnpm run build\b/.test(line)) continue;
            if (/\bnext build\b/.test(line)) offenders.push(`${rel}: ${line}`);
        }
    }

    assert.deepEqual(
        offenders,
        [],
        'A workflow builds the app without going through `npm run build`, so it does not get\n' +
            'scripts/patch-next.js or the NODE_OPTIONS heap headroom. That is exactly how the E2E\n' +
            'job spent hours failing on every branch with a heap OOM:\n  ' +
            offenders.join('\n  ')
    );
});

test('the build script still carries what a bare next build would miss', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    const build = pkg.scripts?.build ?? '';

    assert.match(
        build,
        /max-old-space-size/,
        'package.json build no longer sets a heap size — the E2E build OOMs without it, and the test above now points every workflow at this script'
    );
    assert.match(
        build,
        /patch-next/,
        'package.json build no longer runs scripts/patch-next.js, which repairs a real bug inside node_modules/next'
    );
});

test('the E2E workflow builds and then actually serves the build', () => {
    const e2e = fs.readFileSync(path.join(WORKFLOWS, 'e2e-tests.yml'), 'utf8');
    assert.match(e2e, /npm run build/, 'the E2E workflow no longer builds through npm run build');
    // The build is only worth anything here because a server is started against
    // it; without that every page.goto() in the suite fails.
    assert.match(e2e, /Start Next.js server/, 'the E2E workflow no longer starts a server for Playwright to hit');
    assert.match(e2e, /playwright test/, 'the E2E workflow no longer runs Playwright');
});

/**
 * The other half of the same problem: a REQUIRED gate that fails for reasons
 * unrelated to the change under test.
 *
 * scripts/check-economy-invariants.mjs already carried two write-ups of this,
 * hours apart on 2026-08-22, both statement timeouts. The third came the same
 * day and had a cause that repeats on a schedule: every DDL migration applied
 * to production makes PostgREST rebuild its schema cache, and until it
 * finishes every request answers HTTP 503 PGRST002. On a schema of 831 tables
 * and 2,024 functions that window outlasted the old 18-second retry budget.
 *
 * This pins the budget, not the mechanism - the mechanism is well commented in
 * the script. A gate that blocks every merge in the repository should spend a
 * couple of minutes being sure before it calls the database dead.
 */
test('the economy gate waits long enough for a schema cache reload', () => {
    const src = fs.readFileSync(path.join(REPO, 'scripts/check-economy-invariants.mjs'), 'utf8');

    const attempts = Number(src.match(/TRANSIENT_ATTEMPTS\s*=\s*(\d+)/)?.[1]);
    const step = Number(src.match(/TRANSIENT_STEP_MS\s*=\s*(\d+)/)?.[1]);
    const cap = Number(src.match(/TRANSIENT_MAX_WAIT_MS\s*=\s*(\d+)/)?.[1]);

    assert.ok(
        Number.isFinite(attempts) && Number.isFinite(step) && Number.isFinite(cap),
        'the retry budget constants are gone - if the backoff was rewritten, update this test with it'
    );

    let total = 0;
    for (let i = 1; i < attempts; i++) total += Math.min(i * step, cap);

    assert.ok(
        total >= 60_000,
        `the transient retry budget is ${total / 1000}s. A PostgREST schema cache reload after a ` +
            `migration takes longer than that on this schema, and this gate blocks every merge in ` +
            `the repository while it is red.`
    );

    // A failing assertion must still never be retried; that is the signal.
    assert.match(
        src,
        /A FALSE ASSERTION IS NEVER RETRIED/,
        'the retry helper no longer states that assertions are not retried - retrying one would hide it'
    );
});
