# Club Arena release-manifest cache integrity

## TL;DR

The Club Arena Phase 5 hotfix was correctly merged and synchronized into World Hub, but the canonical and project production domains temporarily returned a four-hour-old `build-info.json` body from Vercel's edge cache. The static bundle itself was current. An exact-path cache policy now makes the release manifest non-storeable at the browser, shared-CDN, and Vercel-CDN layers, and a shipped invariant prevents the route from falling back to the blanket `/hub` revalidation policy.

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

The response reported `x-vercel-cache: HIT` and an increasing `age`, while its `Last-Modified` timestamp reflected the new deployment. That combination made a green deployment appear to serve the wrong Club Arena release and made exact production attestation unreliable.

## Root cause

`vercel.json` applied the blanket `/hub/**` policy to `build-info.json`:

```text
Cache-Control: no-cache, must-revalidate
```

`no-cache` permits storage; it only requires revalidation before reuse. Vercel's edge retained a prior deployment's manifest response and returned it as a cache hit after the new World Hub deployment. The content-addressed Club Arena assets were not affected, but the non-content-addressed release manifest was.

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

## Forward checks

For every Club Arena release:

1. Compare `public/hub/club-arena/build-info.json` on World Hub `main` with the public response body.
2. Confirm repeated public requests do not return a prior deployment's body.
3. Confirm the response includes `Cache-Control: no-store` and does not accumulate an `Age` value.
4. Keep hashed Club Arena assets immutable; do not broaden this no-store policy beyond the release manifest.
