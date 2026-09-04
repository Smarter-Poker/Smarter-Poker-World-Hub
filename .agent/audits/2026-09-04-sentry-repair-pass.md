# Sentry repair pass, World Hub

Full sweep 2026-09-04. 30 integration points found: 12 working, 6 partial,
4 broken, 8 inert. This commit closes the security finding and the four broken
ones. Full inventory and remaining work are in the buildout plan.

## Security: a credential was committed

`scripts/sentry-resolve-all.js:45-46` contained a plaintext password for
support@smarter.poker. The script was a local Playwright automation driving the
Sentry web UI; not scheduled, not in CI, not in package.json. Deleted, along with
`scripts/sentry-resolve.js` which had the same shape.

**The password must still be rotated.** Deletion does not remove it from git
history. Also worth checking whether this repo has ever been public or shared.

## The window.Sentry bug: four integrations, one cause

`GlobalErrorCatcher.jsx:82,118`, `_app.js` reportWebVitals, and
`useYouTubeErrorManager.js:63` were all written against `window.Sentry`. The npm
SDK does not create that global; only the CDN loader script does. So all of them
have been silently no-op since they were written.

The most serious is GlobalErrorCatcher: it is the `window.onerror` and
`unhandledrejection` net, i.e. everything React error boundaries cannot see.
That entire class has been reaching nothing.

`sentry.client.config.js` now assigns `window.Sentry` inside the DSN guard.
`useYouTubeErrorManager` additionally read `window.__SENTRY__` first, which is
the SDK's internal version carrier and has no `captureMessage`, so its primary
branch could never fire either; it reads the real global now.

## Filters that deleted real errors

Read together with `next.config.js:1100-1114`, which bypasses `withSentryConfig`
for a Vercel 8GB OOM and therefore uploads no source maps, this was the worst
thing in the repo:

- production stack traces arrive minified;
- minified React bundles fail as `"D is not defined"`, `"setEntries is not
  defined"`, and so on;
- `beforeSend` then dropped **any** message containing `is not defined`.

The pipeline manufactured exactly the error shape it then deleted. That test is
removed. The anchored `/^ReferenceError: \w+ is not defined$/` and the specific
stale-chunk symbols remain in `ignoreErrors`, which is the right place for them.

Also narrowed the bare `msg.includes('aborted')` clause, which swallowed any
message containing the word.

## Release identity

No `release` was set in any of the three configs, and no `SENTRY_RELEASE` exists
anywhere. Every event landed unattributed: no regression window on an issue, no
way to tie an error to a deploy. All three now set it from the Vercel commit sha.

## Not done here

Source-map upload is still off and should stay off until the OOM is addressed
some other way; the `release` field above is the cheap half of that benefit.
Middleware is still unwrapped. Three crons build events and never `flush()`.
`clawbot/sentry-triage` points at an org and project that do not exist and is
not scheduled. No cron check-in monitors exist anywhere. Those are separate
changes.
