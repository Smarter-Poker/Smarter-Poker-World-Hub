# A New Worker Never Reloads The Page You Are On

**Dan, 2026-11-10:** "YOU NEED TO FIX WHAT EVER IS CAUSING A PAGE TO AUTO
REFRESH WHEN ITS CLICKED AND LOADED... A FEW SECONDS LATER IT INSTANTLY
'RELOADS' AGAIN ON ITS OWN. THIS HAPPENS 100% OF THE TIME INSIDE OF MESSENGER,
AND ALOT OF TIMES FOR THE OTHER PAGES."

## What was doing it

`src/components/ui/ServiceWorkerUpdater.jsx`, on purpose, in one line:
`controllerchange` -> `window.location.reload()`.

Read live from a Messenger tab in Dan's own browser, the component's own
diagnostic log (`sessionStorage.sp_sw_decisions`) held ten consecutive
`controllerchange` -> `reload` pairs, and the last pair sat 1 ms before the
surviving document's `performance.timeOrigin` with
`performance.getEntriesByType('navigation')[0].type === 'reload'` - the page
had reloaded itself into existence. `chunk_reload_count` was `null` for the
whole session, so `ChunkLoadRecovery` never fired once: every reload came from
the updater.

The chain, end to end:

- `worker/index.js` calls `skipWaiting()` on install and `clients.claim()` on
  activate, so a newly installed worker takes control of every open document
  immediately and `controllerchange` fires on all of them.
- The updater calls `registration.update()` on every page load, on every
  `visibilitychange`, and every 15 minutes while the page is visible. The World
  Hub deploys many times a day, so a newly installed worker claimed the page
  constantly - and Messenger is the page Dan keeps focused, which is why it was
  every time there and only often elsewhere.
- The handler then read a controller replacement as proof that "the HTML and
  chunks this page is running came from the OLD worker" and reloaded to escape
  them.

## Why that premise was false

It was true when it was written, and the fix that invalidated it landed
elsewhere. `next.config.js` `runtimeCaching` now serves same-origin `document`
requests, `/_next/static/chunks/pages/*.js` and `/_next/data/*` with
**NetworkOnly** (Dan-fix/mobile-white-screen), precisely so cached HTML can
never reference page chunks a deploy has replaced. Framework and vendor chunks
are CacheFirst but content-hashed, so changed content means a changed name.

So every document this app serves came straight off the network and is already
the build production is serving. A worker claiming it does not make it stale,
and it was not stale to begin with. The reload could not fetch a newer build
than the one already running. All it could do was discard a rendered page a few
seconds after the player asked for it.

The stale-app-shell problem the reload was written for ("LITERALLY NOTHING
CHANGED", 2026-08-25) is fixed at the caching layer, where it belongs.

## The fix

The reload is removed. Promotion stays: a waiting worker that never activates
is its own bug - it is what broke push registration, because
`navigator.serviceWorker.ready` waits for a worker to CONTROL the page, and it
is what left retired release caches in place. The new worker still skips
waiting, retires its old caches, claims the page and serves the **next**
navigation. Nothing has to be thrown away for that to happen.

Four guards existed only to decide WHEN that reload was safe: a live Training
gameplay route, an active server-issued Trivia run, a ringing or connected call
(`window.__spCallActive` / `sp-call-idle`), and unsent typed text. Each was a
correct answer to "do not reload NOW". With no reload at all, every one is
satisfied absolutely instead of conditionally, so they are removed rather than
left as unreachable code for the next agent to rewire. `CallProvider` still
publishes call state and its idle boundary; the call UI depends on that
independently.

A reload fired on a healthy page is not a net, it is the defect. If a deploy
ever does leave a document asking for a chunk that is gone, that is a real
failure with a real signal, and `ChunkLoadRecovery` plus the error boundaries
already own it through the shared budget in `src/lib/chunkRecovery.js`.

## Pinned

Laws moved with the behaviour, in the same commit:

- `__tests__/sw-update.test.mjs` - "a worker update never reloads the page you
  are on" (no `location.reload()`, and no `location.href/assign/replace`
  either, since a navigation is a reload wearing a different name), plus
  "nothing is left behind to re-arm a reload", which fails if any of the
  removed symbols comes back. The promotion handshake, the active `update()`
  check and app-wide mounting stay pinned as before.
- `__tests__/messenger-calls-work.law.test.mjs` - the call and unsent-text laws
  now assert the stronger guarantee: the updater contains no reload, so it
  cannot interrupt a call or wipe a half-typed message under any timing.
- `e2e/trivia-pwa-rollback.spec.ts` no longer seeds the retired
  `sp_sw_reloaded_at` cooldown, and no longer describes a reload guard that
  does not exist.

The decision log (`sp_sw_decisions`) is kept. It is what identified this bug
from a live browser in one read, and it costs nothing.

**Do not add a reload back to this component.** If a page is genuinely serving
stale assets, fix the caching rule that let it, not the document the player is
reading.
