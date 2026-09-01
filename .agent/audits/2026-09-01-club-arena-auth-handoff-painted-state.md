# Club Arena Auth Handoff Painted-State Audit

## Summary

The production Club Arena entry correctly redirected a signed-out browser to
`/auth/login?redirect=%2Fhub%2Fclub-arena%2F`, but the login artwork always
displayed “You Are Already Signed In,” “Continue To Hub,” and “Switch Account.”
Those controls were baked into one JPG. The real transparent button overlays
only mount after `getAuthUser()` confirms a session, so signed-out visitors saw
an account state and two controls that did not exist.

## Root Cause

`public/images/dynamic-login-bg.jpg` is a flat composition containing both the
ordinary sign-in surface and the conditional signed-in card. React correctly
gated the live button overlays with `existingUser`, but it could not gate pixels
inside the background image.

## Resolution

`pages/auth/login.js` now renders a real, non-interactive Secure Sign In panel
over the conditional artwork while `existingUser` is empty. The cover is
present during the initial auth read and throughout a signed-out session. It is
removed only after a live session is confirmed, at which point the existing
Continue To Hub and Switch Account controls remain wired exactly as before.

The redirect handoff itself remains server-session driven:
`getRedirectUrl()` accepts only internal paths, and an existing session reached
through Club Arena still calls `navigateWithFreshAuth()` for the original
`/hub/club-arena/` destination.

No account, profile, player, membership, club bank, horse, or chip data was
read or changed by this fix.
