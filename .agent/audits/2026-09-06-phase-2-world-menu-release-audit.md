# Phase 2 World Menu Release Audit

Date: 2026-09-06

Scope: The 14 World Hub hamburger menu families, their route ownership, responsive command drawers, Social Media visual identity, icon guardrails, release wiring, and production publication state.

## Release Lineage

- Phase 2 hardening merge `42cd05f1` is an ancestor of audited `origin/main` at `4ffb9e65`.
- The Phase 2 registry, drawer, fallback dock, visual tests, and browser fixtures have no intervening product diffs between those revisions.
- Production `/api/health` reported `status: ok`, database `ok`, and build SHA `4ffb9e65` before the corrective patch.

## Evidence Collected

- Registry audit: 14 distinct worlds, 14 unique presentation schemes, 16 required visual tokens per world, and exactly 6 primary commands per world.
- Route law audit: all 264 Hub page sources are covered by an approved shared header or the application-level command fallback.
- Static regression audit: 1,163 tests passed with zero failures, skips, or todos.
- Production Chromium audit: 40 of 40 menu cases passed across desktop and mobile.
- Production visual audit: 14 of 14 world screenshot contracts passed.
- Production WebKit audit: 14 of 14 mobile containment and reachability cases passed.
- Extended route audit: 202 physical page patterns were exercised at 375 by 812. Protected routes that completed an intentional Sign In redirect and an invalid sampled dynamic route that completed a 404 were classified as non-menu destinations.

## Defect Found

The application fallback dock excluded the complete Social Media family because its primary page owns an approved header. Three retained Social Media states do not satisfy that assumption:

- Friends omits its page header while signed out.
- Messenger omits its page header while signed out.
- Reels hides its approved header during immersive playback with `opacity: 0` and `pointer-events: none`.

The result was no usable hamburger on the first two states and an untappable hamburger beneath the Reels stage on the third.

## Corrective Design

- Retain the exact hamburger icon and approved artwork. No icon or image file changes are permitted or included.
- Remove the Social Media exclusion from the route fallback.
- Treat an approved trigger as usable only when it is connected, laid out, visible, opaque, and pointer enabled through its ancestor chain.
- Observe only the approved trigger ancestor chain for visibility changes, avoiding a page-wide attribute observer.
- Continue using the Social Media Facebook presentation contract for the fallback and drawer.
- Add signed-out Friends, signed-out Messenger, and immersive Reels browser coverage that verifies tap hit-testing, hamburger identity, Facebook styling, six primary commands, and the preserved Social composition.

## Release Gates

Final gate results and deployed SHA are recorded in the pull request and production verification after merge.
