# Club Arena release-manifest and production-provenance integrity

## TL;DR

The Club Arena Phase 5 hotfix was correctly merged and synchronized into World Hub, but production twice returned a four-hour-old `build-info.json`. The first observation looked like an edge-cache failure. The second reproduced on a cache miss and exposed the actual release regression: a dirty feature-branch Vercel CLI deployment had been targeted directly at production after newer protected-main deployments. The release manifest now carries defensive no-store directives, the repository's contradictory local deploy commands are removed, and CHECK 18 recognizes the exact CLI flag sequences and extensionless Makefile paths that previously escaped it.

## Context

Club Arena publishes through `public/hub/club-arena/`. The build workflow writes `build-info.json` with the exact Club Arena source SHA and World Hub sync metadata. Release verification depends on that file being a trustworthy statement of the bundle being served.

On 2026-08-29, World Hub commit `d19f72a8e2c84152e139118d8a6ef7932aab4f1e` contained:

- Club Arena SHA `f5f209a4e84f499f3b1cb6ddb38a479fcd8f849f`
- build workflow run `33273751710`
- build timestamp `2026-08-29T20:35:34Z`

The World Hub publish watchdog was green and a new Vercel deployment was current. Despite that, both `smarter.poker` and `hub-vanguard.vercel.app` temporarily returned the older manifest from World Hub commit `b8680d1fb2`:

- Club Arena SHA `5e8dd978b2e38ca2b4e48df360fb3f5f4be4bfca`
- build workflow run `33263568602`
- build timestamp `2026-08-29T16:44:16Z`

The first response reported `x-vercel-cache: HIT` and an increasing `age`, while its `Last-Modified` timestamp reflected the new deployment. Later, after the manifest had recovered to the correct SHA, production regressed to the same old body with `x-vercel-cache: MISS` and `age: 0`. That second observation disproved edge storage as the complete root cause.

## Root cause

Two independent weaknesses were present.

First, `vercel.json` applied the blanket `/hub/**` policy to `build-info.json`:

```text
Cache-Control: no-cache, must-revalidate
```

`no-cache` permits storage; it only requires revalidation before reuse. That made the non-content-addressed release identity document a poor browser/shared-cache attestation boundary. Live Vercel responses can still report an internal static-asset `HIT` and `Age` even with all three no-store directives, so cache metadata alone is not accepted as release provenance.

Second, Vercel deployment `dpl_2TtEF5omWctnnsv7B7Mcgy15GkNN` was promoted directly to the `production` target from:

- Git SHA `59ea1b5ce21c9ff059c23cfcc922216c8a7708ef`
- Git ref `codex/revert-clubbuttons-world-hub`
- `gitDirty: 1`
- manifest SHA `5e8dd978b2e38ca2b4e48df360fb3f5f4be4bfca`

That deployment became the `smarter.poker` alias after protected-main deployments that already contained the Phase 5 hotfix. It was not created by the canonical main-branch Git integration. This is the failure class the repository rules and CHECK 18 claim to forbid.

CHECK 18 nevertheless passed because its regular expressions recognized `vercel --prod` and `npx vercel --prod`, but not the repository's tracked command:

```text
npx -y vercel --force --prod
```

The optional `-y` and intervening `--force` flags left the direct-production path invisible to the guard. `package.json` still advertised it as `deploy:force`, `scripts/force-redeploy.sh` still executed it, and `scripts/check-deploy-status.js` still instructed operators to use it, contradicting the binding one-path deployment rule.

A second executable path was hidden in the root `Makefile`: `make deploy` and its one-letter `make p` alias ran a production CLI deployment, while `make deploy-preview` invoked the CLI's implicit preview deployment. CHECK 18 did not scan extensionless `Makefile` files, so all three targets were invisible even though they created the duplicate and out-of-order deployments the guard was written to prevent.

## Resolution

An exact-path rule for `/hub/club-arena/build-info.json` now appears after the blanket `/hub` rule and sends:

```text
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
CDN-Cache-Control: no-store
Vercel-CDN-Cache-Control: no-store
Pragma: no-cache
Expires: 0
```

This preserves the aggressive immutable policy for content-hashed scripts, styles, fonts, and artwork. Only the small deployment identity document is made non-storeable.

`tests/no-stray-club-arena-build.test.mjs`, already imported by the build's guard suite, now asserts that the exact rule exists after the blanket rule and retains all three no-store directives.

The production-provenance correction removes `scripts/force-redeploy.sh`, the `deploy:force` package command, and all three Makefile deployment targets. It replaces the deploy monitor's instruction with the protected-main fix-forward workflow and expands CHECK 18 to scan `Makefile`, catch production flags even when other CLI flags appear before them, and catch a bare Vercel CLI invocation that implicitly deploys. CHECK 18 self-tests the historically relevant production and implicit-deploy command shapes on every run.

## Forward checks

For every Club Arena release:

1. Compare `public/hub/club-arena/build-info.json` on World Hub `main` with the public response body.
2. Query the active Vercel deployment and require `target: production`, `meta.githubCommitRef: main`, `meta.gitDirty` absent or false, and a SHA contained by current `main`.
3. Confirm the public manifest body matches the manifest tracked by that active production deployment.
4. Confirm the response includes the defensive `Cache-Control: no-store` directive. Do not use Vercel's internal `Age` or `HIT` alone to infer cross-deployment staleness.
5. Keep hashed Club Arena assets immutable; do not broaden this no-store policy beyond the release manifest.
6. Keep direct production deployment commands absent. A failed deployment is fixed forward through a protected PR and published by the canonical Git integration.
