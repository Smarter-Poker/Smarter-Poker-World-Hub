# A dead push endpoint is retired on evidence, never on a guess

2026-08-30. Closes the one residual I left open when fixing the duplicate
seat-offer banner.

## What was left open

`push-health` has always **detected** subscriptions that were pushed to and
never confirmed a receipt, and has always only **alerted**. So a dead endpoint
stayed `is_active` forever and every send paid for it.

Measured 2026-08-29: the whole platform had 11 active `push_subscriptions`, all
on one account, **nine of them redundant** — three live Apple endpoints for one
iPhone and six FCM endpoints for one Mac Chrome. At 16:54:00 a single seat offer
updated `last_used_at` on two of that phone's three endpoints: one push,
delivered twice to one device.

The `20260830031000` backfill took that from 11 to 5 using a conservative rule
(same user, same user agent, keep the newest, only retire rows never delivered
to or strictly older than the keeper). The five survivors were exactly the ones
that rule deliberately spared — including two iPhone endpoints tied at the same
last delivery, so neither was provably dead.

I said at the time I would not guess between them. That was right, and it was
also not the end of the job.

## Why "no receipt" alone is not enough

A missing receipt can mean the device is gone, or that the beacon is blocked, or
that the phone simply has not been unlocked. Retiring on that signal alone would
silence a working device, and its owner would have no way to discover why —
strictly worse than the duplicate banner it set out to fix. That is why the
check only alerted, and alerting-only was the correct call in the absence of a
second signal.

## The second signal

If the **same user** has another active endpoint that **is** confirming inside
the same window, then delivery to that person demonstrably works — so a silent
endpoint beside a talking one is dead rather than merely quiet. That is
evidence, not a guess, and it is exactly the shape of the leftover pair.

`push-health` now retires those, and only those. Three conservative conditions,
each pinned by a test:

1. **A user with no confirming endpoint is never touched.** Nobody can be left
   unreachable by this code. The alert still fires for them, which is the
   correct outcome.
2. **The newest endpoint per user is never retired.** A device enrolled moments
   ago has not had time to confirm anything, so it looks exactly like a zombie
   and is not one.
3. **The update is scoped to `is_active = true`**, so a row another process has
   already retired is not counted twice.

The alert is untouched. Retiring a dead endpoint and telling somebody their
device has gone quiet are different jobs, and losing the second would be a
silent downgrade of the signal this check exists to raise. `zombiesRetired` is
reported alongside `zombies` so a runaway sweep is visible rather than inferred.

## One bug I introduced and caught before pushing

The first version of the catch block did `report.errors.push(...)`. This report
object has no `errors` array — it is
`{ zombies, staffUnreachable, configOk, dispatchOk }`. Inventing one inside a
catch is how a cleanup failure becomes a `TypeError` that takes down the health
check it is attached to. It now sets `report.zombieRetireError` instead, and a
test asserts `report.errors.push` appears nowhere in the file.

## Verification

`node --check` clean. `__tests__/zombie-endpoint-retirement.test.mjs` — 6 cases,
wired into the `prebuild` gate. Full `npm run prebuild`: 479 tests, 0 failures.
