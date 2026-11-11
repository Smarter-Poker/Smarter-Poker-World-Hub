# Alert 376825: production build OOM-killed on the 8 GB Vercel machine

**Alert:** `operational_alert_events` row 376825, `VercelDeploymentFailed` (critical), source `workers.deploy-error-poll`, received 2026-11-11T21:26:00Z.

**Deployment:** `dpl_CvwKska6XPK6DAeqyQxwwy74msDd`, commit `2665f9a` (#2809), build `bld_5vh2vlywb`.

## What the build log shows

- The machine line reads `Build machine configuration: 4 cores, 8 GB (Standard Build Machine)`.
- The build compiled in 99 s and generated static pages 871/871. Then:
  `Error: [BUILD_UTILS_SPAWN_137] Command "npm run build:vercel" exited with 137`.
- Vercel's build system report says `At least one "Out of Memory" ("OOM") event was detected during the build.`
- The kill came 38 s after `871/871`. The next build of the same code (`717f51c`, `dpl_9pMnQAxTzFmxH17WsYupm3sUPgQJ`) ran on the same Standard 8 GB machine and was READY. That build spent 41 s in the same window before `Finalizing page optimization`.
- Production was never down. `139662e` and `717f51c` (both containing #2809) went READY at 21:24Z and 21:30Z.
- The earlier ERROR deployments on hub-vanguard had different causes, so this is the first OOM recorded:
  - 2026-11-01 `1b6a1ff` and `ab71b77`: `TypeError ... startsWith` on `/hub/tournaments/this-weekend`.
  - 2026-10-17 `27da635`: the marketplace contract (row 255715, World Hub #2800).

## Root cause

`package.json` started next with a fixed `NODE_OPTIONS='--max-old-space-size=7168'`. That figure was chosen for the Enhanced 8-core / 16 GB machine (`next.config.js`, measurement of 2026-09-08). The project now builds on the Standard 4-core / 8 GB machine.

V8 grows its heap to whatever cap it is given, so a 7 GB cap inside 8 GB lets the process tree approach the container limit. Measured below at the old cap, the tree peaked at 7056 MB, less than 1 GB from the kill. #2809 crossed it.

## Measurements

Measured on main `717f51c` with Next 16.3.3, on a 4-core / 16 GB cloud container. The command was `next build --webpack`. `measure.sh` sampled the peak resident memory of the process tree every 0.5 s. Raw output is in `local-build-measurements.txt`.

| heap cap | result | compile | peak main RSS | peak tree RSS |
|---|---|---|---|---|
| 7168 MB (old fixed cap) | pass | 2.0 min | 6345 MB | 7056 MB |
| 6144 MB | pass | 2.1 min | 6027 MB | 6834 MB |
| 4096 MB (8 GB machine, new) | pass | 2.0 min | 5099 MB | 5786 MB |
| 3072 MB (new floor) | pass | 2.2 min | 4527 MB | 5211 MB |

The `reserve 2048` printed in the raw log for the forced runs is the value from an earlier draft. Each forced run used `BUILD_HEAP_MB`, which bypasses the reserve, so the measurements are unaffected.

What the measurements show:

- The live heap fits under 3 GB.
- Outside the heap, the main process carries 1.0 to 1.4 GB and the workers about 0.7 GB more.
- A 2 GB reserve, the first draft, gained only 220 MB of margin. Hence `RESERVE_MB = 4096`.

Limitation: the local runs had no Supabase environment, so data fetches during static generation failed fast. The Vercel build fetches real data. Its static generation ran in 3 to 9 s against 17 s here, so the difference does not inflate the local numbers. The first Vercel build after merge prints the `[fit-build-heap]` line, which records the machine and cap it actually used.

## Fix and hardening

1. **Root cause.** `scripts/fit-build-heap.mjs` replaces the hard-coded cap.
   - It reads the cgroup limit through `process.constrainedMemory()`, falling back to `os.totalmem()`.
   - The cap is `min(7168, memory - 4096)`, with a floor of 3072.
   - Resulting caps: 8 GB machine gets 4096; 16 GB and above keep 7168.
   - `BUILD_HEAP_MB` overrides it.
   - Both `build` and `build:vercel` use it.
2. **Regression test.** `__tests__/the-build-heap-fits-the-machine.law.test.mjs` fails on the pre-fix `package.json` (1 of 8 fails) and passes after.
3. **Invariant.** The build cannot start next with a cap above `memory - RESERVE_MB` unless that would go below the measured floor. The test checks this for every machine size up to 128 GB.
4. **Detection.** This alert already arrived through the existing route: `workers.deploy-error-poll` writes `VercelDeploymentFailed` to `operational_alert_events` with `target_task_id`. Every build log now carries the `[fit-build-heap]` line.
5. **CI gate.** The required job Pre-Deploy Safety Checks gets a new step, "The Build Heap Fits The Machine". It runs the law and `tests/one-build-command.test.mjs` on every PR.

## Close condition

Row 376825 closes as `verified_fixed` when all of the following hold:

- This PR is merged.
- A Vercel production build of a commit containing it is READY on a Standard 8 GB machine.
- That build's log shows `[fit-build-heap] machine memory ~8192 MB -> --max-old-space-size=4096`.
