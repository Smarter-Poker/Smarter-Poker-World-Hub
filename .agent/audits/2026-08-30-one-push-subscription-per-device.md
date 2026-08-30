# 2026-08-30 — Double notifications: two clients disagreed about what a device is

## Report

Dan, from an iPhone: **"I'M GETTING DOUBLE NOTIFICATIONS FOR THE SAME OPEN
SEAT, AND A PUSH ALERT ABOUT 3 ZOMBIE SUBSCRIPTIONS."**

On 2026-08-29 this was diagnosed as fan-out across stale subscriptions and
"fixed" by retiring three zombie rows. That was symptom-level. The rows came
back within a day, which is how the real cause surfaced.

## What was actually happening

`/api/cron/push-dispatch` selects **every** `is_active` row for the recipient
and sends to each:

```js
.from('push_subscriptions').select('id, endpoint, p256dh, auth')
.eq('user_id', row.recipient_user_id).eq('is_active', true);
```

So a device holding two live rows shows every banner twice. The platform has a
mechanism to prevent exactly that, and it was half-wired.

`push_subscriptions.device_id` is the only stable identifier for a physical
device — the endpoint is not, because the browser mints a fresh one on a
service-worker reinstall, a storage purge, a PWA re-add, or a
failed-then-retried subscribe. Two things depend on `device_id`, and **both are
scoped to it being non-null**:

```sql
push_subscriptions_one_active_per_device_uidx
  ON (user_id, device_id) WHERE is_active AND device_id IS NOT NULL
```

and the same-device retire in `/api/push/subscribe`, `.eq('device_id', id)`.

A row with `device_id = NULL` is therefore **exempt from the constraint and
invisible to the sweep**. Two code paths were producing precisely those rows:

1. **Club Arena's `pushClient.ts` never sent `deviceId`.** The World Hub client
   did. So every row Club Arena ever wrote was exempt — and Club Arena is the
   app on the phone, which is why the complaint came from there.

2. **`/api/push/rotate` dropped `device_id`.** It selected
   `id, user_id, auth, device_label` and never read `device_id`, then carefully
   carried `device_label` forward with a comment explaining why losing it hurt.
   The field that actually prevents duplicate banners was dropped one line
   away. That route's whole purpose is keeping a device reachable across an
   endpoint change, and it fires on OS update, storage purge and long idle — so
   it re-created the duplicate every time the platform healed itself.

## The evidence that settled it

Measured mid-session, 2026-08-30. An iPad enrolled **once** and produced two
active rows 62 seconds apart:

| created | device_id | written by |
| --- | --- | --- |
| 16:41:32 | present | World Hub client |
| 16:42:34 | NULL | Club Arena client |

The second could not supersede the first, because superseding is keyed on the
field it did not send. Same pattern on the iPhone and the Mac: 6 active rows
for 3 physical devices.

## Fix

- **Club-Arena#1891** — `pushClient.ts` sends `deviceId`, read from
  `smarter-poker-push-device-id`. **Deliberately the hub's key**: both apps are
  served from smarter.poker and share one localStorage, so they must agree on
  one id per browser or a phone that enabled push in both becomes two devices
  and the duplicate returns by a new route.
- **World-Hub#1008** — `rotate.js` selects and carries `device_id`. The retire
  of the superseded row **moves before the upsert**: once the replacement row
  carries a `device_id`, inserting it while the old row is still active
  violates the partial unique index. Because the retire now runs first, a
  failed upsert would leave the device with no live subscription, so the old
  row is reactivated on that path — a silent unsubscribe is worse than the
  duplicate being fixed.
- **`20260830_retire_superseded_push_rows_per_device.sql`** — corrects the rows
  already there. 6 active → 3, one per device. Every retired row had
  `last_used_at IS NULL`: not one had ever been successfully delivered to.

## Why the guard did not catch it

`push_subscriptions_one_active_per_device_uidx` is doing its job. Its predicate
`device_id IS NOT NULL` is not a bug either — a partial index is the only way
to allow legacy rows to exist at all. The gap is that **nothing asserted the
clients actually populate the column the index depends on**, so the index
silently protected an empty set.

Both fixes ship with tests that fail against the unfixed code:
`tests/one-live-subscription-per-device.law.test.ts` (4, Club Arena) and
`__tests__/rotation-keeps-device-identity.test.mjs` (6, World Hub, wired into
`prebuild` and CHECK 8).

## Still open

- The three surviving rows currently have `device_id = NULL`, because the rows
  that survived were the Club-Arena-written ones. They acquire an id on each
  device's next app load, when `PushSubscriptionSync` re-runs `enablePush()`.
  Until then those devices are still outside the index — the cleanup holds
  because nothing is creating new rows for them, not because the constraint is
  enforcing it.
- Nothing yet alarms on "an account holds more than one live row for one
  device". The migration asserts it once, at apply time. A recurring check
  belongs with the push-health cron.
- `__tests__/club-arena-can-subscribe-to-push.test.ts` in the Club Arena repo
  carries a comment asserting that upserting on `(user_id, endpoint)` keeps one
  subscription per device. That reasoning is what allowed this bug: the
  endpoint is not stable, so the upsert key does not identify a device. The new
  law test beside it states the correct rule; the stale comment was left in
  place rather than rewritten in an unrelated file.
