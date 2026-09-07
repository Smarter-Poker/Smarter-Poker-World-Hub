# The duplicate came back, and the guard could not see it

2026-09-07, second pass. Written after re-verifying the morning's push fixes
against production rather than against the diff.

## What the morning fixed, and the half it could not reach

Dan received the Estate Digest and the engine-break alert twice on one screen.
The cause was two ACTIVE `push_subscriptions` rows for one physical device:
`push_subscriptions_one_active_per_device_uidx` is UNIQUE `(user_id,
device_id)`, `deviceId` is minted into localStorage, and an installed PWA and a
browser tab do not share that storage - so one device mints two ids, each
lineage retires only its own predecessors, and `push-dispatch` fans one outbox
row to both.

`deviceGroupKey()` and `selectRetirable()` were built to see across that pair,
keyed on `(user, push host, user_agent)` rather than on the mintable
`device_id`. They worked: two rows were retired and the active duplicate count
went to zero.

**`selectRetirable` draws only from `zombies`, and a zombie is a row that is
NOT confirming receipts.** So it can only ever resolve the shape "one
delivering, one silent". The shape "two delivering" is invisible to it, and
invisible permanently: neither row falls silent, so neither ever becomes a
candidate.

## It re-formed the same day

Measured at 20:30Z, Dan's account, both rows ACTIVE:

| device_id | host | user_agent | created | last_receipt_at |
| --- | --- | --- | --- | --- |
| `ec90f0f1` | fcm.googleapis.com | md5 `b8686dc0...` | 03:55 | 17:12:01 |
| `5e1652b1` | fcm.googleapis.com | md5 `b8686dc0...` | **19:42** | null |

Same user, same push host, byte-identical user agent. The second row was minted
at 19:42 - after the morning's fix merged. Nothing went wrong to produce it;
re-minting a `deviceId` is the ordinary behaviour of the storage it lives in.
The moment that row confirms its first receipt, both rows deliver and every
notification becomes two banners again, with no mechanism anywhere to end it.

## The fix, and why it needs no caution

`selectDuplicateConfirmers()` keeps one confirming row per device group: the
freshest `last_receipt_at` wins, ties break on id.

`selectRetirable` is deliberately timid because retiring a silent row might be
taking a working phone off notifications with no way for its owner to find out.
**That risk is absent here.** Every row this function considers has itself
confirmed a recent receipt, and the row kept is the group's most recent
confirmer, so the device provably still receives push after the retire. It
cannot empty a group, cannot cross a user or a device, and never selects a row
`selectRetirable` would.

It retires **nothing today**: `5e1652b1` has not confirmed yet. That measured
state is pinned as a test, so the wait is a decision rather than a coincidence.

Eleven assertions in `__tests__/one-device-one-banner.test.mjs`, registered in
`prebuild` - a guard executed by nothing is exactly what
`_test-guards-exist.test.mjs` exists to catch, and it caught one of mine
earlier the same day.

## The thing this pass got wrong first

The re-verification began as greps for the markers each fix had introduced.
Four of them gave confident wrong answers, in both directions, because this
repo's house style is a long comment naming the thing that was removed:

- `.lt('created_at', zombieCutoff)` in `push-health.js` matched the comment
  explaining its removal, not the query;
- `padding-top: env(safe-area-inset-top)` in `index.css` matched a comment
  saying the top inset is deliberately absent, plus an `@supports` condition;
- `scraperTriggerStatus` was reported missing from `venue-scraper/trigger.js`
  because the route imports `isTotalDispatchFailure` instead - the wiring was
  fine and the marker was wrong;
- and in the database, a duplicate count taken without `is_active is true`
  reported 5 duplicate device groups when the active count was 0.

Every one was resolved by reading the matched line instead of counting matches.
**Grep the code shape, not the name.** The duplicate above was found only
because the fourth check was opened up rather than believed.

## Two reds that are NOT code, recorded so nobody re-diagnoses them

- **`Venue Scraper Auto-Sync`** and **`Weekly HendonMob Auto-Sync`** both fail
  on `MANUS_API_KEY`. The venue route now answers `MANUS_API_KEY is malformed:
  expected a three-segment JWT`, which is the shape check from this morning
  doing its job: it names the variable and the place, never a value. Rotating
  it is Dan's, and only Dan's, under CLAUDE.md 10.84.
- **`Daily Poker Series Auto-Pilot`** has failed every run since 2026-08-26 -
  fourteen consecutive days, no green. It is not a regression from this work
  and it is not the exit gate. `create_session()` (line ~1325) raises
  `cannot start sync Playwright inside a running event loop` from its own
  guard, reached from `main()` after the circuit breaker trips on five
  consecutive `Context manager has been closed` fetches. The guard is correct -
  the sync Playwright API genuinely cannot start under a running loop - but the
  recovery path calls it from inside one, so a recoverable fetch failure ends
  the whole run. Fixing it means unwinding to the top-level synchronous frame
  before rebuilding the session; it cannot be moved to another thread, because
  sync Playwright objects are bound to the thread that created them. That is a
  structural change to a 3,601-line scraper that cannot be exercised without
  Playwright and live Cloudflare, and it was not attempted blind.
