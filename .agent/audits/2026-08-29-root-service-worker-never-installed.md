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

## Second pass, same day: the manifest itself was the problem

Fixing the 404 let the worker install. Measuring what it then did revealed the
rest, and Dan asked for all of it built:

**The install downloaded 34.7 MB of `public/` before anybody could subscribe.**
826 entries; 200 of them out of `public/`, weighing 34.7 MB — `icons/` 13.2 MB,
`usrobots/` (a marketing slideshow) 10.2 MB, and 8.0 MB of root files including
31 `*-review.html` dev pages, `OneSignalSDKWorker.js` for a vendor removed on
2026-08-19, and `message-icon.png` at 1 MB, referenced by nothing in the
codebase. A first-ever install measured **~55 seconds on a fast desktop
connection**, and for a Club Arena player that install is what happens when they
tap Enable Notifications, because that app never loads a hub page.

None of it bought anything: images and fonts are CacheFirst at runtime, and the
app cannot work offline regardless — it is a live poker client on a Supabase
realtime socket.

**Precaching page chunks silently defeated the NetworkOnly rule.**
`runtimeCaching` declares `/_next/static/chunks/pages/*.js` NetworkOnly — the
Dan-fix/mobile-white-screen mitigation from PR #503, which exists because a
stale page chunk after a deploy renders a blank page on signup and login. But
`precacheAndRoute` registers its route FIRST and workbox matches routes in
registration order, so those 295 chunks were served from the precache and the
NetworkOnly rule never got a look in. Dropping them from the precache is what
makes that fix real.

**`notification-icon.png` was 1024x1024 and 794 KB** — the icon every push
renders with, at a size it renders at 192px at most, sitting on the install
path that gates enrolment. Resized to 512x512 and quantised to 52 KB; RMSE
against the original at render size is 0.28%.

### What changed

`public/` is now **opt-in**: `publicExcludes: ['!**/*']` globs nothing in, and
`scripts/pwa/public-shell-precache.js` hands back the five files that are
genuinely shell (both manifests, `offline.html`, `notification-icon.png`,
`default-avatar.png`) as `additionalManifestEntries` with content-hash
revisions. A denylist of heavy folders would have been wrong within a month.

It has to be `additionalManifestEntries` and not a `manifestTransform`: workbox
pushes `additionalManifestEntriesTransform` **last**, after every user
transform, so entries added that way are invisible to filtering. That is why
the first cut of this change filtered the page chunks correctly and left all
199 public files in place — verified by building locally and reading the
generated `public/sw.js`, not by reasoning about it.

### Measured against a real local build (`next build --webpack`, VERCEL=1)

| | before | after |
| --- | ---: | ---: |
| precache entries | 826 | **337** |
| from `public/` | 200 | **6** |
| page JS chunks | 295 | **0** |
| total weight | ~47.9 MB | **10.96 MB** |

### Guards

- `scripts/ci/check-sw-precache.mjs` now also weighs the precache and fails
  over `PRECACHE_BUDGET_MB`, printing the heaviest entries. A 30 MB folder
  dropped into `public/` fails there instead of quietly adding a minute to
  every first enrolment.
- `__tests__/public-shell-precache.test.mjs` pins the allowlist, that every
  file on it exists, that a missing one is skipped rather than emitted, that
  revisions are content hashes, and that the icon stays small.

### Also fixed in the same pass

- **The ask was being spent on a question nobody could answer.** The first-run
  prompt fires once per account per browser, permanently, and it had been
  firing for ten days against a worker that could not install. Measured after
  the fix: **1 subscribed user out of 1,023 profiles**, 2,437 pushes skipped
  for `no_subscription` in seven days. The key is bumped to
  `sp_firstrun_notif_v2_` in BOTH apps — one re-offer, deliberately once — and
  `markDone()` no longer runs on a technical failure, so a transient error no
  longer burns the prompt of somebody who was in the middle of saying yes.
- **`ready` raised 30s → 90s** in both push clients, from the 55s measurement.
  At 30s the wait expired mid-install and told the user the worker "did not
  start" while it was starting fine.
- **Sentry was missing from `connect-src`.** The CSP is Report-Only, so the
  only symptom was a console line nobody reads. The comment above that block
  says the plan is to switch to enforcing — and the moment anybody does, every
  Sentry envelope is blocked and error reporting goes dark, at exactly the
  moment you have just changed a security header.

## Still open

- **`icons/` is 13.2 MB across 33 files** (~400 KB per icon, for icons). No
  longer on the install path, but still a page-weight problem worth its own
  pass.
- **OneSignal is still loading at runtime** ten days after removal —
  `public/OneSignalSDKWorker.js` is still shipped and the browser console shows
  a request to `api.onesignal.com/sync/...` on page load. Out of scope here;
  raised separately.
- A **single** 404 anywhere in the manifest still takes push down for everyone.
  337 entries is a much smaller blast radius than 826, and the guard now catches
  it within 30 minutes, but making it non-fatal means not precaching at all —
  a decision about offline behaviour that is Dan's, not an agent's.
