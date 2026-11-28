# 2026-11-28: Vercel production builds OOM (exit 137) - root cause and fix

## What happened

Every hub-vanguard production build from f2412480 (#3299, live session clock
and undo delete) was SIGKILLed on Vercel's "4 cores, 8 GB (Standard Build
Machine)" with `exit 137` and "At least one Out of Memory event was detected":
dpl_6zpuTd6CWjxVD21KJFu9UGZ7v1fg (f2412480), dpl_53mvHcekGNaENovP3JTEpxBhK9p9,
dpl_2UHozATkWMg4asLYKTEXUbCqcGrZ, dpl_5xQiJ76b7a5L3aJWwLJjaUcYDzWA,
dpl_C79Km9pTeoh42N5eQAc8W7w4BzA1, dpl_6BXWsHaousjZSKczewmx4i49W2sV. Each died
about 95 s into "Creating an optimized production build"; the last good build
(dpl_DU6BqGJmuFfhAqvNfMNUU5tvyFSE, 2aceb052) compiled in 103 s. #3335 reverted
#3299 and dpl_3m6K9uV32ZtFEBUewVhjGRqsYP5d (5c4112aa) built. Every one of those
builds restored the build cache of dpl_DU6Bq.

CI's Vercel Build Parity job passed on #3299: it runs the same command on a
16 GB runner and only knows pass or fail, never the peak.

## Measurement

`.github/workflows/build-memory-measure.yml` (workflow_dispatch, or a push to a
parked `bookmark/build-measure-*` branch; never a gate) runs
`npm run build:vercel` under `/usr/bin/time -v` and
`scripts/ci/measure-build-memory.py`, which sums RSS and PSS over every process
in the build's tree twice a second and tags each sample with the build phase.
GitHub's runner has 4 cores, so Next derives the same 3 workers as on Vercel.
"warm" first builds 2aceb052, then the target from that `.next/cache`, which is
what Vercel does with the previous production deployment's cache.

| build | tree RSS peak (MB) | phase of peak | main `next build` RSS | compile |
|---|---|---|---|---|
| 2aceb052 cold | 6,181 | collect page data | 5,768 | |
| 5c4112aa cold | 6,148 | collect page data | 5,749 | |
| 5c4112aa warm | **7,022** | collect page data | 6,677 | 60 s |
| main + #3299 cold | 6,166 | collect page data | 5,764 | |
| main + #3299 warm | **8,212** | collect page data | 7,376 | 67 s |
| + webpackBuildWorker, warm | **5,345** | compile (client worker) | 2,370 | 106 s |
| + webpackBuildWorker + webpackMemoryOptimizations, warm | 5,202 | compile | 2,521 | 162 s |
| + webpackBuildWorker + webpackMemoryOptimizations, cold | 5,483 | compile | 2,550 | 150 s |

Runs: 46143331500, 46143333065, 46143335719, 46143338316, 46143339922,
46143965436, 46143967566, 46143969563 (artifacts `build-memory-<sha>`).
`/usr/bin/time -v` max RSS (largest single process): 5,793 / 5,776 / 6,680 /
5,795 / 7,412 MB before, 5,096 MB with the worker.

The pattern is exact: warm builds that succeeded peaked at 7.0 GB, warm builds
with #3299 at 8.2 GB, which is over the 8 GB container before Vercel's own CLI
is counted.

## Root cause

Not #3299's code, and not a page or a test step: the pre-build tests peak at
~1.5 GB and are gone before compile. The main `next build` process held
5.7-7.4 GB RSS under a 4 GB heap cap, because it ran all three webpack
compilers itself. Next 16 compiles each compiler in a child process that exits
(`next/dist/build/webpack-build/index.js`, "destroy worker so it's not sticking
around using memory") only when `experimental.webpackBuildWorker` is true or
next.config.js has no custom `webpack()` (`next/dist/build/index.js`). Ours has
one (aliases and the deployment-keyed CSS loaders), so the worker was silently
off. Everything compilation allocated - plus the deserialised persistent cache
on a warm build - was still resident when "Collecting page data" forked three
more workers. That moment is the peak in every failing measurement.

Raising `--max-old-space-size` would have made this worse: the kill is the
container's, on the sum of processes, and a larger heap only lets V8 defer
collection longer.

## Fix

`experimental.webpackBuildWorker: true` in next.config.js. Main + #3299 warm:
8,212 -> 5,345 MB peak tree RSS (-35%), leaving ~2.6 GB of the 8 GB container.
Output is identical: same 1,094 static pages, same route list, same /horses
bundle numbers (initialJavaScriptBytes 65,101, totalInitialJavaScriptBytes
409,049). Cost: compile 67 s -> 106 s on a warm build.

`webpackMemoryOptimizations` was measured and not enabled: 143 MB more for
another 56 s of compile on every deployment.

Pinned by `__tests__/the-build-compiles-in-a-worker.law.test.mjs`.
