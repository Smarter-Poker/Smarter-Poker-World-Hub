# The VIP stipend slot was pointed at the implementation that ignores payment

**2026-09-01.** Dan asked why the September VIP stipend was not paid, noting
that `vip_subscriptions` is empty while `profiles.is_vip` is 704, and asked
which implementation the monthly slot should point at.

The short answer: **zero was the correct September payment**, the job that
produced it is fine, and the bug is a second job that would have paid 50,000
diamonds to accounts that never paid a cent.

## Two implementations, and the wrong one was wired

**`pages/api/cron/vip-stipend.js`** is the documented control. It pays only
accounts holding a `vip_subscriptions` row with a non-null
`stripe_subscription_id` and a live Stripe status. Its own header explains why
`profiles.is_vip` cannot be trusted as proof of payment: the 30-day signup
trial writes `vip_tier = 'monthly'` with no payment, `/api/sms/verify-otp`
grants a free VIP window for verifying a phone, and before the v2 migration
users could self-set `is_vip` through PostgREST.

It ran on 2026-09-01 at 09:00:41 UTC via the `vercel.json` cron, status
success, and paid nobody. `vip_subscriptions` has never held a row and no
diamond has ever been spent on VIP, so nothing was owed.

**`/cron/vip-diamond-stipend`** is the other one. Its monolith source was
deleted from this repo on 2026-04-25 in `chore(2B.3): delete 38 dead-code
monolith handlers`, but the workers copy on Hetzner stayed live and the Open
Claw dispatcher still scheduled it monthly and still mapped it into
`WORKERS_PREFERRED`. Recovered from git, its predicate is:

```js
.eq('is_vip', true).gt('vip_expires_at', now).limit(100)
```

No payment check of any kind, and a silent `.limit(100)`.

## What that predicate actually selects

| cohort | count | paid? |
|---|---|---|
| horses with `vip_tier='lifetime'` | 1,000 | never |
| humans with granted `vip_tier='lifetime'` | 162 | never |
| humans with unexpired `monthly` (trial / phone grant) | 12 | never |

704 of these had an unexpired `vip_expires_at` and were therefore eligible;
`.limit(100)` capped the run at 100 x 500 = **50,000 diamonds ($500) per
month**, to a population where **nobody has ever paid**.

The 1,000 horses hold lifetime VIP because
`supabase/migrations/archive/20260311_horses_lifetime_vip.sql` granted it so
the fleet would have VIP features. `vip_tier` is a feature-entitlement flag,
not a purchase record.

**It had already paid 12 times**, 6,000 diamonds, all at 00:05 UTC on the 1st
with the deleted handler's `VIP Monthly Stipend` description and its
`add_diamonds_to_balance` RPC. Every payee has zero rows in
`vip_subscriptions`. Recorded, not reversed: those balances have since expired
and the recovery is worth less than the support cost.

## Why September specifically was silent

Not the stipend's fault. The dispatcher was dead across the firing instant:

```
last dispatcher activity before Sep 1 00:05  ->  2026-08-31 11:31 UTC
first dispatcher activity after              ->  2026-09-01 17:01 UTC
```

Every job vanished in that window, not just this one: `hard-stop` runs 60x an
hour and logged nothing. The same happened in July (dead 2026-06-14 ->
2026-07-18). That is the whole "paid in June and August, silent in July and
September" pattern. `misfire_grace_time` is 300s, so a missed monthly instant
is simply lost until the next month.

## The fix

`scripts/openclaw-cron-dispatcher.py`:

- the monthly slot now fires **`/api/cron/vip-stipend`**, the control;
- it runs **daily at 09:00 UTC**, not monthly. The handler is idempotent per
  user per calendar month, so repeats return `duplicate` and cost nothing,
  a dispatcher outage no longer skips anyone for a month, and someone who
  subscribes on the 2nd is paid on the 2nd;
- the `/api/cron/vip-diamond-stipend` entry in `WORKERS_PREFERRED` is removed,
  so a future re-add of that path cannot silently route back to the
  is_vip-based worker route.

The `vercel.json` monthly entry for `/api/cron/vip-stipend` is deliberately
**kept**. Two independent schedulers against an idempotent endpoint is the
redundancy whose absence caused this, and shrinking the vercel crons array is
permitted while growing it is not.

## Why no new guard was added

`check-cron-fleet-alive.mjs` already alarms on dispatcher silence past 25
minutes, GitHub-side so it does not share a failure domain with the fleet. It
was written on 2026-08-31, the same day as the outage above. Adding a third
overlapping guard is what CLAUDE.md 10.8 forbids. The monthly-miss class is
removed structurally rather than watched.

`check-cron-liveness.mjs` could never have caught this on its own: a monthly
job has zero runs in its 7-day window, which it downgrades to WARN, and when
the job did fire the workers route returned 200 while paying the wrong people.
Liveness measures whether a job runs, not whether it is the right job.

## Still open, for Dan

Lifetime VIP has **no purchase anchor**. Paying a lifetime member on their
purchase anniversary, as Dan asked for, needs a `vip_subscriptions` row with
`plan = 'lifetime'` written by a real purchase path; `profiles.vip_tier`
cannot distinguish granted from bought. Until that exists, lifetime members
are correctly paid nothing.

The predicate must stay **"did this account pay for VIP"** and must never
become **"is this account a horse"**. Today both questions give the same
answer for every account on the platform, so section 10.5 is satisfied by
construction: a horse that buys VIP from the club wallet is owed the stipend
on exactly the same terms as a human, with no species branch anywhere.
