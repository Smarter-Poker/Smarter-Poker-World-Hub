# Two push service workers: why collapsing them is a migration, not a fix

**2026-09-07.** Recorded after fixing the duplicate-notification symptom twice
from two different angles. The root cause is that this origin runs two
push-capable service workers. Collapsing them to one is the right end state and
is deliberately NOT being done in the same pass, for reasons below.

## What is actually on the origin

| Registration | Registered by | Push handler | Title Case |
| --- | --- | --- | --- |
| `/sw.js` | `src/components/ui/ServiceWorkerUpdater.jsx:142` (next-pwa) | `worker/index.js` | yes |
| `/push/sw.js` | `src/lib/push-client.js:254` | `public/push/sw.js` | yes, since today |
| `/OneSignalSDKWorker.js` | nothing — **tombstone** | unregisters itself | n/a |

The third is not a problem and must not be deleted: it exists so browsers that
still hold the 2026-08-19 OneSignal worker fetch it on their update check and
unregister themselves. Its own header says *"Do not delete this file until the
OneSignal worker population has aged out."* That is the shape of a correct
service-worker retirement, and it is the shape the consolidation below needs.

## Why two exist

`public/push/sw.js` was forked out of `worker/index.js` on **2026-08-25** to
escape a next-pwa precache hang. That fork is the cause of every push defect
found today:

- **The duplicate banner.** Two registrations means two `pushManager`
  endpoints, two `push_subscriptions` rows, and `push-dispatch` fans one outbox
  row out to both. Dan received the Estate Digest and the engine-break alert
  twice on one phone.
- **The mangled SHA.** Only one worker applied Dan's Title Case rule, so the
  two copies did not even match — which is what proved there were two
  registrations rather than a double send.
- **The invisible duplicate.** Every dedupe in the codebase keys on
  `device_id`, which is minted into `localStorage`; an installed PWA and a
  browser tab do not share that storage, so one phone minted two ids and the
  `UNIQUE (user_id, device_id)` index could not see the pair.

## What has been fixed (and why the symptom is closed)

1. `/api/push/rotate` now retires device-wide, as `/api/push/subscribe` has
   since 2026-08-30. Closes the enrol-path leak.
2. `push-health`'s zombie sweep now reads evidence from every active row rather
   than only rows older than the grace window — the filter was doing two jobs
   and hid the confirming siblings, so the sweep concluded Dan had no working
   device and retired nothing. Proof is now per DEVICE GROUP
   (user, push host, user agent), not per user.
3. The Title Case block is byte-identical in both workers and pinned that way.
4. Production repaired: the two unconfirmed rows retired (migration
   `20260907171555`).

**A device that holds two subscriptions is now reconciled within a day by
`push-health`, and cannot be created by the rotate path at all.** The bleeding
has stopped.

## Why collapsing to one worker is not this pass's work

Removing a service worker registration is not a code change, it is a
**population migration**, and getting it wrong takes web push down for the
whole origin. This codebase has that scar: `worker/index.js` records that a
worker which cannot install *"takes web push down for the entire origin,
silently"*, which is what 2026-08-29 was spent recovering from.

The sequence a correct consolidation needs:

1. Decide which worker survives. `/push/sw.js` is the better candidate — it was
   forked precisely because next-pwa's worker had a precache hang, and that
   hang has not been shown to be fixed.
2. Teach the surviving worker everything the other does (app-update prompts and
   precache currently live in `ServiceWorkerUpdater.jsx` + next-pwa).
3. Ship a **tombstone** at the retiring worker's URL, exactly like
   `OneSignalSDKWorker.js`, so installed copies unregister themselves on their
   next update check rather than lingering.
4. Wait for the population to age out — weeks, not hours — watching
   `push_subscriptions` for rows whose `device_id` lineage traces to the
   retired scope.
5. Only then delete anything.

Steps 3-4 are the whole risk, and they cannot be compressed. Doing steps 1-2 in
the same change as everything else shipped today would put an untested
single-worker push path in front of every user on the same deploy that fixed
the duplicate — with no way to tell, if banners stopped, which change did it.

## Recommendation

Do it, as its own change, with nothing else in the pull request. Until then the
duplicate is closed at three layers (enrol, self-heal, and a daily sweep) and
the two workers render identically, so the user-visible defect is gone even
though its cause is still standing.
