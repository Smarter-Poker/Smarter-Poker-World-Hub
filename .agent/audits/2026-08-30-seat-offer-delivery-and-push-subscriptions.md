# Seat-offer delivery, and one live push endpoint per device

2026-08-30. The World Hub half of the follow-ups to Dan's two reports of
2026-08-29. The Club Arena half (entry-hold persistence, the reserved-seat
footer, and `fn_offer_open_seat`) is PR #1851 in that repo.

Dan's report was _"the seat open push notification should only occur if you are
on a list waiting for a seat, not randomly."_ He **was** on that list — the row
was four minutes old when the offer fired — so the targeting was correct. What
made it read as random was everything after the targeting.

---

## 1. One banner per table, not one per notification id

`fn_mirror_notification_to_push_outbox` tagged rows `<type>:<notification id>`.
That is right for most types and wrong for a seat offer: every offer at the same
table got a different tag, so a second one landed **beside** the first instead
of replacing it. The operating system uses the tag to decide, so identical text
under different tags is guaranteed to pile up — the same mechanism behind the
duplicate banner in Dan's screenshot, where two writers produced two tags.

Seat events now group by `data->>'table_id'`
(`20260830030000_seat_offers_collapse_by_table.sql`). One live banner per table,
always describing that table's current state. The fallback still ends at
`NEW.id`, so an offer with no `table_id` keeps its own tag rather than colliding
with every other table-less offer under one key.

The rewrite is a `CREATE OR REPLACE` of the function every push on the platform
passes through, so the post-apply block asserts that all three pre-existing
guards survived (`_push` opt-out, per-user pending cap, replayed-row age) and
that the trigger is still attached. A version of this that silently did nothing
would stop every push on the platform without anything going red.

## 2. The push now expires with the offer

`sendWebPush` defaults to a 24-hour TTL. Right for almost everything, exactly
wrong for an offer that dies in three minutes: a phone that reconnected twenty
minutes later got _"A Seat Just Opened. Tap To Claim It."_ for a seat long since
given away, and tapping landed on a full table. Nothing downstream can un-send a
push — the TTL is the only lever.

`EVENT_TTL_SECONDS` in push-dispatch gives `waitlist_seat_open` 3m30s (the offer
window plus a small grace so a device reconnecting at the boundary still gets
something it can act on). `sendWebPush` already accepted `opts.ttl`; it was
never passed one.

## 3. The dead banner is closed

The TTL stops late **delivery**. It does nothing about a banner already on
screen when the offer lapsed. `sweepExpiredNotifications()` in the service
worker closes any notification whose `data.expiresAt` has passed.

Deliberately **not** a timer. A service worker is killed whenever the browser
feels like it, so `setTimeout(close, threeMinutes)` is a promise the runtime has
no obligation to keep — and the one case that matters (phone in a pocket, worker
long since evicted) is exactly when it will not fire. The sweep runs at the two
moments the worker is provably alive and already holding the notification list:
when another push arrives, and when the user taps one. Both are local reads.

It also cannot break what it is attached to: a thrown `getNotifications()` would
mean the push that triggered the sweep is never shown, which is strictly worse
than the stale banner it cleans up. Hence the `.catch()` and the per-notification
`try`.

## 4. Losing your place is no longer silent

`fn_offer_open_seat` (club-arena) and `fn_sweep_stale_waitlists` (here) both
write a `waitlist_offer_expired` notification to the player whose offer lapsed.
Previously your place in line evaporated after three minutes and nothing
anywhere said so.

- It is a **bell item, not a buzz**: both writers set `data->>'_push' = 'skip'`,
  the documented signal that makes the mirror trigger skip the row. This must
  not become the next round of unwanted pushes.
- It routes to `/waitlist`, **never** to the table it lost. The seat is gone —
  that is what the notification says — so sending the tap to the table lands the
  player on a full felt with nothing to do, which reads as the app being broken
  rather than as "you missed it".
- It maps to the **same consent key** as the offer (`seat_open`). Someone who
  switched "Seat Available" off does not want to hear about seats, and being
  told about one they did not get is still hearing about seats. The mapping also
  keeps it out of `eventToTypeKey`'s null path, which the gate reads as
  "unknown, allow it" — the failure documented at length in
  `seat-open-is-gated-correctly.test.mjs`.

## 5. The TTLs now reach a table nothing is happening at

Applying the TTLs inside the offer path is deliberate — it is the only path that
turns a queue row into an interrupt, so a row cannot outlive its expiry by the
width of a scheduler window. But it only runs **when a seat opens at that
table**. On a table nobody leaves, nothing runs:

- the lobby's "Waiting N" counts rows held by people who left days ago, and
  players choose a game off that number;
- a lapsed offer is announced only when the next seat opens there, which on a
  quiet table may be never.

`fn_sweep_stale_waitlists` is the recurring half, called by
`pages/api/cron/waitlist-sweep.js` every 10 minutes from **Open Claw**
(CLAUDE.md §11 — the dispatcher, never `vercel.json`; the test asserts both). It
applies the **same two rules** rather than a second opinion about them, sharing
the notification text and the `_push` marker with the offer path, and takes no
arguments so it cannot drift by passing a different number. An RPC error is a
500, because a sweep that fails quietly is indistinguishable from a sweep with
nothing to do — and correcting something nobody is watching is the whole job.

## 6. One live push endpoint per device

Measured before writing anything: the entire platform had **11 active
`push_subscriptions` rows, all belonging to one account**, of which **nine were
redundant** — three live Apple endpoints for one iPhone and six FCM endpoints
for one Mac Chrome. On 2026-08-29 at 16:54:00 a single seat offer updated
`last_used_at` on two of that phone's three endpoints: one push, delivered twice
to one device.

`replacesEndpoint` already existed and works — while the **client** still
remembers what it is replacing. It does not after a service-worker reinstall,
cleared site data, or a PWA re-add: the browser mints a fresh endpoint, the old
row is left `is_active` with nothing referencing it, the push service never
410s it (it is a perfectly valid endpoint), and every send pays for it forever.

`device_id` is a random id the client mints once and keeps in `localStorage`.
It is **not** a fingerprint — no user agent, no screen size, nothing about the
machine — and clearing site data legitimately produces a new one, because that
browser genuinely cannot be reached at the old endpoint any more.

Why not `(user_id, user_agent)`: two identical iPhones on one account produce
byte-identical strings, and deduping on that would silently switch off one of
the person's real devices. The endpoint is not stable and the user agent is not
unique, so neither can be the key.

`subscribe.js` retires prior live rows for the same `device_id` **before** the
upsert — it has to, or the new partial unique index rejects the insert. An
unusable device id is ignored rather than rejected: a bad value must never cost
somebody their subscription.

### The one-time backfill, and what it deliberately did not do

Scoped hard, because deactivating a real device's endpoint makes a phone go
quiet with no way for the owner to tell why. Only rows with no `device_id`, only
where the same `(user_id, user_agent)` held more than one active row, keeping
the newest, and only retiring rows that had **never** been delivered to or were
strictly older than the keeper's last delivery.

That took 11 active rows to 5. The five that remain are exactly the ones the
rule spared: the two newest (never used) and three tied at the same last
delivery. Two of them are the iPhone endpoints that produced the double banner —
both were delivered to at 16:54:00.843, so neither is provably dead, and
guessing between them risks silencing the phone. The unified tag means they now
collapse into one banner regardless, and the `device_id` path retires them
properly on Dan's next re-subscribe.

The migration's post-apply block asserts that **no user was left with zero
active endpoints**. That is the assertion that matters; the rest is bookkeeping.

## 7. The horse seat-offer residue is gone

2,337 seat offers to 551 horses between 2026-08-23 and 2026-08-27, before the
human-only filter landed. They were 95% of everything `push_outbox` had ever
been asked to deliver, every one `skipped/no_subscription`, so any honest look
at delivery health had to mentally subtract them first — and `/admin/push-health`
does not.

Deleted, bounded by the fix date rather than by `is_horse` alone: a
horse-addressed offer **after** 2026-08-27 would mean the filter had regressed,
and the migration refuses to run if it finds one rather than erasing the
evidence. It also asserts afterwards that human seat offers still exist, so a
prune that took more than it was asked to cannot pass silently.

This is not a precedent for pruning horse data. Horses are players (CLAUDE.md
§10.5) and their hand histories, stats, VIP points, commissions and ledger rows
are real and stay. This was one notification type, in one closed date range,
created by a bug, that the recipient could not act on because it needs a phone.

`no_subscription` skips across the whole table went from 2,341 to 149.

---

## Verification

- Four migrations applied to production **before** this branch was pushed, each
  with post-apply assertions that abort on their own assumptions.
- `__tests__/seat-offer-delivery.test.mjs` — 14 new cases, added to the
  `prebuild` gate beside `seat-open-is-gated-correctly`.
- The existing push suites still pass unchanged (77 tests across
  `push-service-worker`, `push-hardening`, `push-dedicated-worker`,
  `seat-open-is-gated-correctly`, `notification-route`, `cashier-push-types`,
  `ios-push-enrollment`, `notification-copy`).
- Full `npm run prebuild`: 472 tests, 0 failures.
