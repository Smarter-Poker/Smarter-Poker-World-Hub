# Two Playwright failures that stopped the whole estate from merging

**2026-09-04.** `E2E Tests (Playwright)` had been red on `main` for exactly two
tests. Neither was flaky - both failed all three retries, in both projects - and
both were real product bugs.

The cost was out of all proportion to the bugs. A red suite makes every open
pull request `unstable`, and **GitHub refuses to enable auto-merge on an
unstable PR** even when every required check is green. So two small defects took
the merge pipeline down for the whole estate, and #1295 had to be squashed by
hand.

## 1. A close button that said 48 and rendered 32

`InteractiveTutorial`'s close button carried this, and had for a long time:

    // The parent spring enters at scale .95. Use 48px so the effective
    // hit area never drops below 44px while that animation settles.
    width: 48, height: 48,

It rendered at **32px**, and 31.84px mid-spring - precisely the failure that
comment was written to prevent.

`.sp-icon-btn` declares

    width:  var(--sp-btn-size, 32px) !important;

and **a stylesheet `!important` beats an inline style**. The inline `width: 48`
was discarded in silence. The author did the right thing, wrote down why, and
the cascade threw it away.

The fix is the variable rather than the property - `'--sp-btn-size': '48px'` -
which makes the `!important` rule itself compute 48. That is the extension point
the utility was written with. Confirmed in a real browser: with the inline width
alone the button measures 32px; with the custom property set it measures 48px.

## 2. A dialog that closed but left its deep link in the URL

`Bankroll Log deep links ... clean their URL` failed because cancelling the
sign-in gate hid the dialog and left `?view=log-session` behind, so a reload or
a shared link reopened it.

Two mechanisms owned history for that modal and were undoing each other.
`useModalHistory` pushes `{ spModal: true }` when the gate opens and calls
`history.back()` when it closes. Cancel also calls `clearLogSessionView`, which
does `router.replace` to strip the query. **`router.replace` is async**: the
hook's effect ran first, still saw its own marker on top, and popped back to the
entry the replace had just rewritten.

The hook already guards on `state.spModal`, so the page now clears that marker
**synchronously** before replacing - the hook declines to pop, and the replace
stands. Back still works and returns the visitor to the deep link they arrived
on, which is the honest destination.

## Hardening: CHECK 19

The discarded-inline-width trap is not confined to one component. Sweeping the
repo found **21 files** setting an inline width on `.sp-icon-btn` with no
`--sp-btn-size` - every one of those widths is being thrown away, and nobody can
see it in the source.

`scripts/ci/check-icon-button-sizing.mjs` reports them and fails when the count
**grows**. Baseline rather than zero, deliberately: most of the rest are
decorative buttons where 32px is a considered desktop choice, and resizing all
of them at once is a visual decision, not a lint. Verified against `main`: 21
before this change (fails), 20 after (passes), so the guard would have caught
this exact regression on the day it landed.
