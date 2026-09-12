# A skip is not a failed send, and the audience was vanishing underneath it (2026-09-12)

## What was investigated

155 tournament-reminder rows appeared in `push_outbox` in eight hours, every
one `status='skipped'`. The question was whether push was broken.

## What was found

**Push is not broken. Two separate things were.**

### 1. The enqueue had no reachability predicate (fixed in the Club Arena repo)

`public.prepare_tournament_reminders(integer)` wrote one `push_outbox` row per
registrant per tournament starting inside fifteen minutes, without asking
whether the recipient had a device. Seven days to 2026-09-12 05:00Z:

| | |
|---|---|
| tournament-reminder rows | 15,900 |
| share of ALL `push_outbox` volume | 94.9% (15,900 of 16,751) |
| distinct recipients | 935 |
| with an active push subscription | 0 |
| that had EVER held a `push_subscriptions` row when the row was written | 0 |
| delivered | 0 |

`pages/api/cron/push-dispatch.js:414-417` marks such a row
`skipped` / `no_subscription`, and `src/lib/push/push-deliver.js` does the same
inline. **Both are correct and neither was changed.** The fix is one predicate
in the enqueue, and it lives in the Club Arena repo because the enqueue is a
Postgres function: branch `fix/a-reminder-needs-a-device`, law
`tests/a-reminder-needs-a-device.law.test.ts`. The predicate is REACHABILITY
and never `is_horse` - every one of the 935 was a horse, which makes the
species filter the obvious shortcut and the exact trap CLAUDE.md 10.5 exists
to refuse.

### 2. Push health could not tell "unreachable" from "failed", and could not see its audience leaving

This repo's half, and what this PR changes.

**Unreachable counted as failure.** `classifyReason()` had always called
`no_subscription` `not_enrolled` for the skip breakdown, but the delivery
funnel computed `deliveryRate = sent / queued` over the raw queue. With 94.9%
of the queue addressed to nobody, the dashboard read a near-0% send rate while
every send to a real device succeeded. The funnel now reports `unreachable` and
`addressable` and rates over `addressable`; `/api/cron/push-health` reports the
same three numbers.

**The audience was disappearing silently.** Underneath those skips:

| | |
|---|---|
| active subscriptions | 4, across 2 users (`danimal5022`, `kingfish`, both human) |
| subscription rows ever written | 58 |
| already retired | 54 (`expired_410` and friends) |
| enrolled in the last 7 days | 10, of which 3 are still active |
| sent, last 7 days / the 7 before | 94 / 458 (20.5%) |

Daily sends: 248 (08-31), 78, 49, 44, 23, 17, 24, 16, 15, 10, 8, 4 (09-11),
1 (09-12 to 05:00Z).

None of push-health's four checks could see that. Each asks about an individual
(a zombie endpoint, an admin with no device) or about an absolute (has the count
reached zero). A fleet decaying by an order of magnitude in a fortnight, with
every remaining send succeeding, was invisible until the day it hit zero - and
the alarm that fires on that day is too late to be a warning.

CHECK 5 now asks both halves: are the devices going, and are the sends going.

## Thresholds, and where they come from (CLAUDE.md 10.84)

Derived from the numbers above, with the derivation written above the constants
in `pages/api/cron/push-health.js`:

| constant | value | why |
|---|---|---|
| `SEND_COLLAPSE_RATIO` | 0.35 | the observed collapse is 0.205; 0.35 catches it with room and is not reached by ordinary week-to-week movement |
| `SEND_COLLAPSE_FLOOR` | 50 | the prior window must have carried real traffic. The week of 08-22..08-28 sent 9 in total; without the floor a genuinely quiet fortnight pages every day |
| `AUDIENCE_SHRINK_CEILING` | 5 | the pool has sat between 2 and 6 devices for three weeks, so a lost device above this is churn |
| `AUDIENCE_SHRINK_RATIO` | 2/3 | 6 -> 4 is exactly 2/3 and fires; 6 -> 5 is a wobble and does not |

`__tests__/a-skip-is-not-a-failed-send.law.test.mjs` evaluates the SHIPPED
constants against the measured numbers, so loosening one until the alarm stops
firing fails the law rather than passing quietly. Verified: setting
`SEND_COLLAPSE_RATIO` to 0.1 reds it with
`would NOT have fired on the measured collapse (94 against 458)`.

## What was ruled out, with data, and should not be re-chased

- **Duplicates.** There are none. Every `(event, tournament, recipient)` group
  holds exactly one row; the `:45`/`:58` clustering is the recurring hourly
  tournament schedule. `tournament_reminder_receipts` plus the BEFORE INSERT
  claim suppressed 10,707 duplicate claims and admitted 328 in twelve hours.
- **Transport / VAPID mismatch.**
- **Quiet hours and per-type preferences.**
- **The zombie sweep.** Its 54 deactivations are spread over three weeks with
  per-device reasons written by the dispatcher on genuine 410 Gone. There is no
  mass-nuke event.

## Not fixed here

The enqueue itself (Club Arena repo, see above) and the migration-version drift
around `20260908003810` (recorded in that repo's changelog for this work).

## How CI runs the new law

`build-safety-gate.yml` CHECK 8 invokes an explicit file list and adding to it
needs a `workflow`-scoped token the automation PAT does not have, so the law is
imported from `__tests__/cashier-push-types.test.mjs`, which CI already runs -
the same device `_test-guards-exist.test.mjs` documents. 11 cases run from that
file now instead of 4.
