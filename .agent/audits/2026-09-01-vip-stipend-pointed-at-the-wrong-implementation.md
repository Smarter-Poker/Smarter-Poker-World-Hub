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

## Policy changed the same day: pay every VIP holder

Dan, after being shown the population and the cost: **"JUST PAY THEM ALL ON THE
1ST OF EVERY MONTH, THEIR 500 DIAMONDS"**.

So eligibility is no longer the Stripe subscription. `/api/cron/vip-stipend`
now selects `profiles.is_vip = true AND (vip_tier = 'lifetime' OR
vip_expires_at in the future)` - the same predicate `award_diamonds_v2`'s own
`vip_stipend` guard already enforced, so the RPC became a second lock on one
rule instead of a looser floor under a stricter one.

| cohort | count | paid |
|---|---|---|
| horses (lifetime VIP from `20260311_horses_lifetime_vip`) | 1,000 | yes |
| humans, granted lifetime | 21 | yes |
| humans, unexpired monthly | 12 | yes |
| **total** | **1,033** | **~516,500 diamonds/month** |

**Horses are paid, and that is the correct reading of section 10.5**, not a
concession to it. The rule this file argued for earlier - the question is *did
this account pay*, never *is this account a horse* - still holds; Dan simply
changed the answer to the first question by making the stipend an entitlement
benefit rather than a rebate on cash collected. There is deliberately no
`is_horse` branch in the handler, and adding one to trim the bill would be the
exact bug 10.5 forbids. To change the cost, change the catalog amount or the
entitlement rule, in the open.

At the store's 1 diamond = $0.01 that is ~$5,165/month of nominal issuance,
~$5,000 of it to the horse fleet. Diamonds are spendable on merchandise and
features, so for the ~33 human accounts it is real value; for horses it is
supply that inflates every diamond total. Dan was shown these numbers first.

**It runs daily, and still pays on the 1st.** Each account can receive exactly
one stipend per calendar month (`vip_stipend_<user>_<YYYY-MM>` plus the RPC's
month guard), so the daily cadence is purely a catch-up: on a normal month
everyone is paid on the 1st, and if the dispatcher is dead that day - as it was
on 2026-09-01 and 2026-07-01 - the month is not skipped. A monthly-only trigger
is what silently lost July and September.

## Still open, for Dan

`vip_subscriptions` remains empty and no diamond has ever been spent on VIP, so
there is still no purchase path in use. That no longer blocks the stipend, but
it does mean the VIP product currently collects nothing while issuing ~516,500
diamonds a month. Worth a separate decision about pricing or about capping the
fleet's share.

The 12 historic payments (6,000 diamonds, June and August) are recorded and not
reversed; those balances have since expired.
