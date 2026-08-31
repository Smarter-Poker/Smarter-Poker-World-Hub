# Personal Assistant Phase 3 Of 8: Unified Leak-To-Training Loop

## Outcome

Leak Finder now carries one truthful remediation path from a detected solver
signal into the matching corrective review and the exact Training Library game.
The review result returns to Leak Finder as a visible receipt, while empirical
leak resolution remains owned by fresh Club Arena evidence.

## Defects Closed

- The previous `Train With Focused Drills` action sent `focus` and `category`
  query values to the Training Center, but the Training Center consumed neither
  value. The action opened an unfiltered lobby while claiming a focused handoff.
- Sandbox already emitted `autoLaunch`, but the Training Center did not consume
  that value either.
- A completed corrective drill could be closed or restarted while the verified
  schedule write was still pending, hiding a failed or delayed completion.
- Leak Finder refreshed its schedule after completion but did not keep a visible
  completion receipt on the parent page.
- Historical solver game identifiers can use either hyphens or underscores.
  A raw identifier could therefore miss a real Training Library game or produce
  a dead route.

## Implementation

- Added `leakToTrainingGame`, a source-gated resolver that accepts storage
  aliases but returns only a canonical game identifier present in the supplied
  Training Library catalog.
- Wired Training Center `autoLaunch`, `focus`, and `category` query handling.
  Exact games open the existing session setup. Historical values that no longer
  map to a game become an honest visible library search.
- Added a Corrective Review action to every real Leak Finder detail sheet.
  Signed solver-eligible runs continue to use the existing private answer and
  attempt ledgers; other signals keep their existing non-authoritative practice
  behavior.
- Added an explicit Exact Training Game badge and exact-game action only when the
  canonical resolver proves the game exists.
- Added an `onReviewComplete` receipt contract to Quick Spot Drill and a parent
  Leak Finder receipt containing score, next interval, verification state, and
  remediation mastery state.
- Disabled Done and Drill Again while the review schedule write is pending.
- Added a 15-second completion deadline and temporarily removed every sheet
  dismissal path while the write is pending, then restored retry and close on
  a bounded failure.
- Preserved the evidence boundary: corrective mastery never marks an empirical
  leak resolved. Fresh Club Arena evidence must still confirm recovery.

## Verification

- `npm run test:leak-engine`: 110 passed.
- Phase 3, Phase 5, completion, and adversarial analysis contracts: 54 passed.
- Full optimized Next.js webpack build: passed, 403 static pages generated.
- Complete Personal Assistant Playwright matrix at four workers: 23 passed and
  2 desktop-inapplicable mobile checks skipped.
- Focused exact-game browser journey passed in desktop Chromium and Pixel-class
  mobile Chrome.
- Personal Assistant copy policy confirmed title capitalization and zero banned
  long bars on every owned route.
- `git diff --check`: passed.

## Release Evidence

Pending pull request, normal autopilot merge, production revision verification,
and authenticated live exact-game handoff checks.
