# 2026-09-08 - /privacy is a page, and the app-link files are served from the environment

World Hub side of the Club Arena app's store readiness, phase 6 (the Club
Arena changelogs `2026-09-07-capacitor-shell.md` through
`2026-09-08-native-assets-and-ota.md` carry the rest).

## /privacy

Audit tier 1: "a reachable privacy policy URL". `/privacy` was a permanent
redirect to `/terms`, and the policy there sits behind a client-side tab
(`useState`), so a store crawler saw a 308 and the Terms tab. `pages/privacy.js`
renders the same `PrivacySection` the terms page renders (now a named export
of `pages/terms.js`, with its `styles`), with no client state; the redirect is
gone and `/legal/privacy` now points at `/privacy`. The section gained "8. The
Club Arena App" - purchases through the stores via RevenueCat, push tokens,
Sentry without email, PostHog only after in-app consent, the date-of-birth
check, account deletion, and Dan's one sentence about chips - which is what
Apple's Privacy Nutrition Labels and Play's Data Safety form are answered from.

## Universal links and App Links

`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
are rewritten to `pages/api/app-links/{aasa,assetlinks}.js`, which build the
documents from `APPLE_TEAM_ID` and `ANDROID_RELEASE_CERT_SHA256` at request
time (`src/lib/app-links.js`). Both are 404 until those exist - the OS treats
that as "no app links here", which is today's behaviour - and go live the
moment the values are set on Vercel, with no deploy. No placeholder app id is
ever published. The values are Dan's (Club Arena CLAUDE.md 10.84); the
shapes are in `.env.example`.

`__tests__/privacy-page-and-app-links.test.mjs` pins all of it.
