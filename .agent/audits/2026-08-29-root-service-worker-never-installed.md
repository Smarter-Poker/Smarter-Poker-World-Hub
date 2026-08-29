# 2026-08-29 — Web push was dead origin-wide, because one precache URL 404'd

## Report

Dan, from an iPhone: **"ENABLE NOTIFICATIONS ISN'T WORKING, YOU GET THIS POP UP
WHEN YOU ENABLE THEM."** The screenshot is Club Arena's `FirstRunPushPrompt`
showing:

> The notification service worker did not start. Reload and try again.

That string has exactly one source: `src/lib/pushClient.ts` in the club-arena
repo, `getPushRegistration()`, thrown when there is no ROOT-scope registration
with an active worker.

## What was actually happening

Measured against production, `https://smarter.poker`, 2026-08-29:

```
navigator.serviceWorker.register('/sw.js')   -> resolves, scope "/", installing
   ~170ms later                              -> state "redundant"
navigator.serviceWorker.getRegistration('/') -> undefined
```

So the registration was not merely inactive, it was being **discarded**, on
every attempt, on every device. `getRegistration('/')` returning nothing is the
exact condition `getPushRegistration()` refuses on, and its error message was
telling the literal truth.

Probing all 827 entries of the precache manifest parsed out of the deployed
`/sw.js`, requested the way workbox requests them (`?__WB_REVISION__=<rev>`),
found exactly one bad URL:

```
/_next/dynamic-css-manifest.json  ->  404
```

Next emits `dynamic-css-manifest.json` as a **build artifact** and does not
serve it under `/_next/`. `@ducanh2912/next-pwa` put it in the precache
manifest anyway. Workbox precaches the manifest atomically, so a single 404
rejects `install`, and a worker that cannot install goes redundant.

## Why nobody noticed, for how long

`/sw.js` is the only worker on this origin with a `push` listener
(`worker/index.js`, `sp-push-v3`). Club Arena's own `sw-bus.js` deliberately
has none — see the header of `pushClient.ts`. So while this was broken:

- **no user of smarter.poker, hub or Club Arena, could enrol for web push**;
- anyone already enrolled kept working only for as long as their existing
  subscription and worker survived;
- nothing reported it. `register()` **resolves**. The page renders normally.
  The only surface that notices is a person tapping "Enable Notifications", and
  the message they get reads like a transient local glitch — "Reload and try
  again" — so it invites a retry rather than a bug report.

This is the second time push has been silently zero on this platform. On
2026-08-27, 2,432 seat offers in seven days were skipped for `no_subscription`
against 2 subscribed accounts; that was diagnosed as Club Arena never having a
prompt, and the prompt was built. The prompt then could not have worked either,
because the worker it enrols against was already failing to install.

## Fix

`next.config.js`, `workboxOptions.manifestTransforms` — drop any entry whose
basename is `dynamic-css-manifest.json`.

`manifestTransforms` rather than `exclude`, deliberately: next-pwa spreads a
caller's `exclude` in place of its own defaults (woff2 / `.map` /
`manifest*.js`), so supplying `exclude` here would have quietly removed three
working exclusions. `manifestTransforms` is additive. Ours runs **before**
next-pwa's own transform, while urls may still be raw asset names, so the
regex is anchored on the basename and matches either form.

## Guard

`scripts/ci/check-sw-precache.mjs` fetches the deployed `/sw.js`, parses the
manifest, and probes every entry. It fails loudly listing anything that is not
2xx.

It runs as a step in `.github/workflows/publish-watchdog.yml` — the existing,
allowlisted, every-30-minutes watchdog — because it asks the same question that
workflow already asks ("is what production serves actually usable"), and
section 11 of CLAUDE.md bans net-new GitHub `schedule:` triggers. `if: always()`
so it still runs when the SHA comparison alarms; a stale deploy and a broken
worker are independent failures.

It has to run against a deployment rather than a checkout: next-pwa is
configured `disable: !process.env.VERCEL`, so no service worker exists locally
and there is nothing for a pre-merge check to read.

## Still open

Nothing here changes the fact that a **single** 404 anywhere in an 827-entry
manifest takes push down for everyone, silently. The guard makes that visible
within 30 minutes instead of never. Making it non-fatal would mean not
precaching at all, which is a separate decision about offline behaviour and is
Dan's to make, not an agent's.
