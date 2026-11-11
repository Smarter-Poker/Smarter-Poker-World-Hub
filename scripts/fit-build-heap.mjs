#!/usr/bin/env node
/**
 * Runs `next build` with a V8 heap cap that fits the machine it is running on.
 *
 *   node scripts/fit-build-heap.mjs next build --webpack
 *
 * WHY THIS EXISTS (operational alert 376825, 2026-11-11)
 *
 * Production deployment dpl_CvwKska6XPK6DAeqyQxwwy74msDd (commit 2665f9a, #2809)
 * was SIGKILLed by the kernel: `npm run build:vercel exited with 137`, and
 * Vercel's build report said "At least one Out of Memory (OOM) event was
 * detected". The machine line of that build reads
 *
 *   Build machine configuration: 4 cores, 8 GB (Standard Build Machine)
 *
 * and package.json started next with a fixed
 * NODE_OPTIONS='--max-old-space-size=7168'. That number was chosen when this
 * project built on an Enhanced 8-core / 16 GB machine (next.config.js, the
 * 2026-09-08 measurement). On an 8 GB container a 7 GB old-space limit is
 * not a limit at all: V8 sizes its collection schedule against 7 GB, so the
 * heap is allowed to grow into the memory every other part of the process
 * (code space, Buffers, webpack's native allocations, the static workers that
 * inherit NODE_OPTIONS) also needs, and the container is killed before V8
 * ever runs the full collection that would have kept it inside the box.
 * The kill landed in the post-export window, 38 s after
 * "Generating static pages (871/871)" - the same window the next, successful
 * build of the same code (717f51c, dpl_9pMnQAxTzFmxH17WsYupm3sUPgQJ, same
 * Standard 8 GB machine) spent 41 s in before "Finalizing page optimization".
 * The build was running at the edge on every deploy; #2809 was the one that
 * went over.
 *
 * WHAT IT DOES
 *
 * Reads the memory the process is actually allowed (the cgroup limit through
 * process.constrainedMemory(), else os.totalmem()), keeps RESERVE_MB of it for
 * everything that is not the V8 old space, and gives next the rest, never more
 * than the HEAP_CEILING_MB the 16 GB machines were already using. On 16 GB and
 * above nothing changes; on the 8 GB Standard machine the cap becomes 4096 MB,
 * so V8 collects before the kernel kills.
 *
 * MEASURED 2026-11-11 (main 717f51c, Next 16.3.3, 4 cores, `next build
 * --webpack`, peak resident memory of the whole process tree sampled every
 * 0.5 s; docs/production-alerts/evidence/376825-build-heap-fits-the-machine):
 *
 *   heap cap   result   compile   peak main RSS   peak tree RSS
 *   7168 MB    pass     2.0 min   6345 MB         7056 MB   <- old fixed cap
 *   6144 MB    pass     2.1 min   6027 MB         6834 MB
 *   4096 MB    pass     2.0 min   5099 MB         5786 MB   <- 8 GB machine now
 *   3072 MB    pass     2.2 min   4527 MB         5211 MB   <- HEAP_FLOOR_MB
 *
 * The live heap fits well under 3 GB; V8 simply grows to whatever cap it is
 * given. Outside the heap the main process carries 1.0-1.4 GB and the static
 * workers about 0.7 GB more, which is why RESERVE_MB is 4096 and not 2048:
 * with the 7168 cap the tree reached 7056 MB, within 1 GB of an 8 GB kill.
 *
 * BUILD_HEAP_MB overrides the computed value, like BUILD_CPUS in next.config.js.
 * Every run prints one `[fit-build-heap]` line, so a Vercel build log always
 * says which machine it saw and which cap it chose.
 */
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The largest cap any machine gets: the value the 16 GB builds have used since 2026-09. */
export const HEAP_CEILING_MB = 7168;
/** Memory left outside the V8 old space for code, Buffers, native webpack work and workers. */
export const RESERVE_MB = 4096;
/** Never go below this: the smallest cap measured to build this app (3072 MB, 2.2 min). */
export const HEAP_FLOOR_MB = 3072;

const MB = 1024 * 1024;

/**
 * The memory this process may use, in MB. A container reports the host's RAM
 * through os.totalmem(); the cgroup limit is the number the kernel enforces.
 */
export function machineMemoryMb({
    constrained = typeof process.constrainedMemory === 'function' ? process.constrainedMemory() : 0,
    total = os.totalmem(),
} = {}) {
    const totalMb = Math.floor(Number(total) / MB);
    const limitMb = Math.floor(Number(constrained) / MB);
    if (Number.isFinite(limitMb) && limitMb > 0 && (!Number.isFinite(totalMb) || totalMb <= 0 || limitMb < totalMb)) {
        return limitMb;
    }
    return totalMb;
}

/** The --max-old-space-size for a machine with `memoryMb` of memory. */
export function resolveBuildHeapMb(memoryMb, override = process.env.BUILD_HEAP_MB) {
    const forced = Number(override);
    if (override !== undefined && override !== '' && Number.isFinite(forced) && forced > 0) {
        return Math.floor(forced);
    }
    if (!Number.isFinite(memoryMb) || memoryMb <= 0) return HEAP_CEILING_MB; // unreadable: previous behaviour
    return Math.max(HEAP_FLOOR_MB, Math.min(HEAP_CEILING_MB, Math.floor(memoryMb) - RESERVE_MB));
}

/** NODE_OPTIONS with any inherited heap cap replaced by `heapMb`. */
export function withHeapCap(nodeOptions, heapMb) {
    const kept = String(nodeOptions || '')
        .split(/\s+/)
        .filter((flag) => flag && !/^--max-old-space-size(=|$)/.test(flag));
    return [...kept, `--max-old-space-size=${heapMb}`].join(' ');
}

function main(argv) {
    const [tool, ...rest] = argv;
    if (tool !== 'next') {
        console.error('[fit-build-heap] usage: node scripts/fit-build-heap.mjs next build [args]');
        process.exit(2);
    }
    const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const nextBin = path.join(repo, 'node_modules', 'next', 'dist', 'bin', 'next');
    const memoryMb = machineMemoryMb();
    const heapMb = resolveBuildHeapMb(memoryMb);
    const nodeOptions = withHeapCap(process.env.NODE_OPTIONS, heapMb);
    console.log(
        `[fit-build-heap] machine memory ${memoryMb} MB -> --max-old-space-size=${heapMb} ` +
            `(ceiling ${HEAP_CEILING_MB}, reserve ${RESERVE_MB}${process.env.BUILD_HEAP_MB ? ', BUILD_HEAP_MB override' : ''})`
    );
    const child = spawn(process.execPath, [nextBin, ...rest], {
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: nodeOptions },
    });
    child.on('exit', (code, signal) => {
        if (signal) {
            console.error(`[fit-build-heap] next ${rest.join(' ')} was killed by ${signal}`);
            process.exit(128 + (os.constants.signals[signal] || 0));
        }
        process.exit(code ?? 1);
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2));
}
