/**
 * The production build's V8 heap cap fits the machine that runs it.
 *
 * Operational alert 376825 (2026-11-11, VercelDeploymentFailed): production
 * deployment dpl_CvwKska6XPK6DAeqyQxwwy74msDd for 2665f9a (#2809) was killed
 * with exit 137 and an "Out of Memory" build report on a
 * "4 cores, 8 GB (Standard Build Machine)". package.json started next with a
 * fixed --max-old-space-size=7168, a figure chosen for the 16 GB Enhanced
 * machine this project used to build on. A 7 GB old-space limit inside an
 * 8 GB container lets the heap grow into memory the rest of the process needs,
 * so the kernel kills the build before V8 collects. Full write-up:
 * scripts/fit-build-heap.mjs.
 *
 * This pins three things:
 *   1. No build script hard-codes a heap size again; both go through
 *      scripts/fit-build-heap.mjs (fails on the pre-fix package.json).
 *   2. The cap the wrapper computes always leaves RESERVE_MB of the machine
 *      free, and the 8 GB Standard machine gets 4096 MB, not 7168.
 *   3. Machines that were already safe (16 GB and up) keep the 7168 cap.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    HEAP_CEILING_MB,
    HEAP_FLOOR_MB,
    RESERVE_MB,
    machineMemoryMb,
    resolveBuildHeapMb,
    withHeapCap,
} from '../scripts/fit-build-heap.mjs';

const REPO = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const MB = 1024 * 1024;

test('no build script hard-codes a heap size; both fit it to the machine', () => {
    for (const name of ['build', 'build:vercel']) {
        const script = pkg.scripts?.[name] || '';
        assert.doesNotMatch(
            script,
            /max-old-space-size/,
            `package.json "${name}" hard-codes --max-old-space-size. A fixed 7168 MB cap is what ` +
                'let the 8 GB Vercel build machine OOM-kill production deploy dpl_CvwKska6XPK6DAeqyQxwwy74msDd. ' +
                'Start next through scripts/fit-build-heap.mjs instead.'
        );
        assert.match(
            script,
            /node scripts\/fit-build-heap\.mjs next build --webpack/,
            `package.json "${name}" no longer starts next through scripts/fit-build-heap.mjs`
        );
    }
});

test('the Vercel Standard build machine (8 GB) gets a cap that leaves room outside the heap', () => {
    assert.equal(resolveBuildHeapMb(8192, ''), 4096);
    assert.ok(resolveBuildHeapMb(8192, '') < 7168, 'the 8 GB machine is back on the cap that OOM-killed #2809');
});

test('machines that were already safe keep the previous cap', () => {
    assert.equal(HEAP_CEILING_MB, 7168);
    for (const mb of [11264, 16384, 32768, 65536]) {
        assert.equal(resolveBuildHeapMb(mb, ''), HEAP_CEILING_MB);
    }
    assert.equal(resolveBuildHeapMb(16384, ''), 7168);
});

test('for every machine that can hold the floor plus the reserve, the cap plus the reserve fits', () => {
    assert.ok(RESERVE_MB >= 4096, 'measured: the tree needs ~1.7 GB outside a full heap; 2048 left under 1 GB on 8 GB');
    for (let mb = HEAP_FLOOR_MB + RESERVE_MB; mb <= 131072; mb += 256) {
        const heap = resolveBuildHeapMb(mb, '');
        assert.ok(heap + RESERVE_MB <= mb, `${mb} MB machine got a ${heap} MB heap`);
        assert.ok(heap <= HEAP_CEILING_MB);
    }
});

test('BUILD_HEAP_MB overrides, and an unreadable machine keeps the old behaviour', () => {
    assert.equal(resolveBuildHeapMb(8192, '5000'), 5000);
    assert.equal(resolveBuildHeapMb(8192, 'nonsense'), 4096);
    assert.equal(resolveBuildHeapMb(4096, ''), HEAP_FLOOR_MB, 'a small machine never drops below the measured floor');
    assert.equal(resolveBuildHeapMb(NaN, ''), HEAP_CEILING_MB);
});

test('the container limit wins over the host RAM a container reports', () => {
    // A Vercel / Docker container sees the host's RAM through os.totalmem();
    // the kernel enforces the cgroup limit.
    assert.equal(machineMemoryMb({ constrained: 8192 * MB, total: 64 * 1024 * MB }), 8192);
    assert.equal(machineMemoryMb({ constrained: 0, total: 16384 * MB }), 16384);
    // "No constraint" can also be reported as a number larger than the host.
    assert.equal(machineMemoryMb({ constrained: 2 ** 62, total: 16384 * MB }), 16384);
});

test('an inherited heap cap is replaced, other node flags are kept', () => {
    assert.equal(
        withHeapCap('--max-old-space-size=7168 --enable-source-maps', 4096),
        '--enable-source-maps --max-old-space-size=4096'
    );
    assert.equal(withHeapCap(undefined, 4096), '--max-old-space-size=4096');
});

test('the wrapper reports its choice in the build log and passes a kill through as failure', () => {
    const src = fs.readFileSync(path.join(REPO, 'scripts/fit-build-heap.mjs'), 'utf8');
    assert.match(src, /\[fit-build-heap\] machine memory/, 'the build log must say which machine and cap it used');
    assert.match(src, /process\.exit\(128 \+/, 'a signal-killed next build must not exit 0');
});
