/**
 * The retired 500x Spin tier - no source may ask the database for it.
 *
 * WHY THIS GUARD EXISTS
 *
 * The 500x tier was retired on 2026-08-21. Migration 20260821g rebuilt
 * public.v_spin_tier_availability without `can_draw_500x`, and a bundle that
 * was still deployed kept selecting it. PostgREST does not drop an unknown
 * column from a select - it refuses the WHOLE request with 42703. So the
 * badge on the Spin lobby card went dark for every club at once, and the
 * failure looked nothing like its cause.
 *
 * The three sibling columns on public.v_spin_reserve_health - top_jackpot,
 * need_for_500x, can_draw_500x - outlived the tier for exactly one reason:
 * pages/api/cron/spin-sweep.js still named can_draw_500x in its select, and
 * dropping a column a deployed reader asks for repeats the incident above,
 * this time blinding the operator dashboard that watches every reserve pool.
 *
 * The reader was removed first and published; the columns follow. This test
 * is what stops a future select from putting them back and re-creating the
 * coupling, whether the columns still exist or not.
 *
 * WHAT IS AND IS NOT A VIOLATION
 *
 * Naming these columns in prose is fine and often necessary - this file does
 * it a dozen times, and so does the comment in spin-sweep.js explaining the
 * removal. What is forbidden is a PostgREST `.select(...)` argument that
 * contains one. The scan therefore reads select strings, not whole files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');

/** Columns that no longer exist, or are about to stop existing. */
const RETIRED = ['can_draw_500x', 'need_for_500x', 'top_jackpot'];

/** Directories holding hand-written source. Built output is excluded on
 *  purpose: `public/hub/club-arena/` and the stray root `assets/` are Vite
 *  artifacts, and a sourcemap that merely quotes a comment is not a query. */
const SOURCE_DIRS = ['pages', 'src', 'scripts', 'lib', 'tests', '__tests__'];
const SOURCE_EXT = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

function walk(dir, out = []) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const e of entries) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (SOURCE_EXT.has(path.extname(e.name))) out.push(full);
    }
    return out;
}

/**
 * Every argument passed to a `.select('...')` call in the file.
 *
 * Deliberately literal: it matches `.select(` followed by a quoted string,
 * which is the only form PostgREST column lists take in this codebase. A
 * select built from a variable would slip past - that is a known limit, and
 * the reason the assertion below is a floor rather than a proof.
 */
function selectArguments(source) {
    const args = [];
    const re = /\.select\(\s*(['"`])([\s\S]*?)\1/g;
    let m;
    while ((m = re.exec(source)) !== null) args.push(m[2]);
    return args;
}

const FILES = SOURCE_DIRS.flatMap((d) => walk(path.join(REPO, d)));

test('no source selects a retired 500x column', () => {
    assert.ok(FILES.length > 100, `source scan found only ${FILES.length} files - the walk is broken`);

    const offenders = [];
    for (const file of FILES) {
        const source = fs.readFileSync(file, 'utf8');
        // Cheap reject before the regex runs over thousands of files.
        if (!RETIRED.some((c) => source.includes(c))) continue;
        for (const arg of selectArguments(source)) {
            for (const col of RETIRED) {
                if (arg.includes(col)) {
                    offenders.push(`${path.relative(REPO, file)} selects ${col}`);
                }
            }
        }
    }

    assert.deepEqual(
        offenders,
        [],
        `The 500x tier is retired and these columns are being dropped from ` +
            `v_spin_reserve_health. A select naming one answers 42703 for the ` +
            `entire request, not just that column:\n  ${offenders.join('\n  ')}`
    );
});

test('spin-sweep still reads the health view, and reads the parts it acts on', () => {
    const file = path.join(REPO, 'pages/api/cron/spin-sweep.js');
    assert.ok(
        fs.existsSync(file),
        'pages/api/cron/spin-sweep.js is missing - the reserve backstop was deleted'
    );
    const source = fs.readFileSync(file, 'utf8');

    assert.match(
        source,
        /\.from\(\s*'v_spin_reserve_health'\s*\)/,
        'spin-sweep no longer reads v_spin_reserve_health - the operator dashboard is the only place a thin pool is ever reported'
    );

    // Removing can_draw_500x must not have taken the alert inputs with it.
    // Each of these is filtered on further down and named in an alert.
    const args = selectArguments(source);
    for (const col of ['is_thin', 'shortfall_events', 'unbooked_24h', 'null_multiplier_24h', 'club_name']) {
        assert.ok(
            args.some((a) => a.includes(col)),
            `spin-sweep stopped selecting ${col}, which it filters on - the alert would silently never fire`
        );
    }
});
