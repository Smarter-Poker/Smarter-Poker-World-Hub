# Gifting economy, round 2: the ENTRANCE

Date: 2026-08-15
Author: Cowork agent
Trigger (Dan, correcting round 1): "WELL HOLD ON... USERS CAN EARN DIAMONDS
WITHOUT EVER PURCHASING THEM... SO YOU CAN'T BLOCK THEM. THERE HAS TO BE A
HAPPY MIDDLE TO BOTH WHILE PROTECTING US FROM FARMING AND DUMPING."

Round 1 (`3c60de8324`) uncapped the RECEIVE side. It left the entrance
hostile to exactly the users who earn their way in. Dan was right. This is
the fix.

Shipped: `fab7977b81` + migration `live_gift_pair_concentration_support`.
Production /api/health served `0fb68fb6` at 2026-08-15T16:41:49Z; `gift.js`
was read back at that SHA to confirm all four changes are live.

## The old design was wrong in BOTH directions at once

**Too tight for honest users.** Unpaid accounts under 30 days old were 403'd
from gifting entirely — a user who had legitimately earned diamonds in-app
could not spend one of them for a month. And the free/earned allowance was
100 per 30 days. Measured against production:

| metric | value |
|---|---|
| users who earned anything in last 30d | 8 |
| of those, earning MORE than the 100 cap | **8 (100%)** |
| median earned, 30d | 387 |
| p90 earned, 30d | 1,706 |
| median lifetime earn | 400 |

The cap sat below what **every single real earner** actually earns.

**Too loose against the actual threat.** A farm does not care about a
per-account ceiling. Fifty sock accounts at 100 each is 5,000 funnelled at
one target, straight through the cap. A global per-sender number is simply
the wrong shape for the threat it was meant to stop.

Context for the numbers: live gifting is currently near-dormant — 13 gifts
ever, median 10 diamonds, largest 25, none in the last 90 days, 4 distinct
senders. The caps were not protecting against observed abuse; they were
preventing the loop from ever starting.

## Replaced with three controls that match the behaviour

**1. Age-tiered earned allowance — never zero.**

| account age | allowance |
|---|---|
| < 7 days | 100 per 7 days |
| 7–30 days | 300 per 30 days |
| 30–120 days | 600 per 30 days |
| 120+ days, unflagged | unlimited |

Sized ABOVE what real earners earn, so honest users are never throttled on
diamonds they worked for. A brand-new account can gift from day one (~10
gifts at the observed median size). Supply is already throttled upstream by
the reward system's own daily caps — the gifting layer does not need to
re-throttle it. The 30-day hard block now applies **only** to accounts a
human has already flagged (`is_farming_flagged`).

A short refilling window for the newest tier is deliberate: friendlier to a
real user than one long window, and no friendlier to a farm.

**2. Per-pair concentration cap — the anti-DUMPING control (new).**
750 diamonds from one sender to one recipient per 30 days, for non-graduated
senders. Volume is not a farming signal — **concentration is**. A real
supporter spreads gifts across the streams they watch; a dump points
everything at one account. This is the control that makes relaxing (1) safe.

Implemented as `sum_live_gift_pair()` + a composite index
`(sender_id, receiver_id, created_at DESC)`, computed in SQL rather than by
fetching rows into the API — a row-limited client-side sum would under-count
and fail OPEN on the exact funnel the check exists to catch. The function is
`SECURITY DEFINER` and revoked from `anon`/`authenticated` (it would
otherwise let any client enumerate gifting relationships).

**3. IP-aggregated 30-day budget — the anti-FARMING control (retained).**
`sum_anti_farming_ips` makes accounts sharing an IP share one budget, so
spinning up more accounts buys the farm nothing. Already existed; it is the
reason the per-account allowance can be generous.

Also raised purchased/won from 500 to **1500** per 30 days — money-backed or
competition-won diamonds are not the farming vector, and a tournament prize
can dwarf 500 (largest single earner on record: 50,185).

## The resulting shape

Entrance is graded by trust and by behaviour, never closed:
- Earn diamonds, gift them from day one, within a tier that exceeds normal
  earning.
- Buy diamonds and the tiering is bypassed immediately.
- Funnelling at one target is capped regardless of how many diamonds you
  hold; adding accounts on one IP adds no budget; a flagged account is still
  hard-blocked.
- Nothing caps what a broadcaster may RECEIVE (round 1).

## Unchanged

Per-gift 10,000 max; velocity detection for graduated accounts;
`is_farming_flagged`; KINGFISH bypass; the peer-to-peer transfer recipient
cap (different transaction type, classic mule vector, no purchase upside).

## Verification

`node --check` on gift.js; migration applied to production first with
self-aborting assertions (pair function returns 0 for an unrelated pair, is
NOT client-callable, index exists, and `economy_invariants` still reports
zero failures); byte-exact blob match on the Mac before push (`b13fdc8e`,
`b8ca05db`); deployed `gift.js` read back at the production SHA showing the
tier function, the 1500 purchased/won limit, the 750 pair cap, and the
new-user block now gated on `is_farming_flagged`.

## Tunable knobs, if the numbers turn out wrong in practice

`freeEarnedAllowance()` tiers, `PAIR_30DAY_CONCENTRATION_LIMIT` (750),
`PURCHASED_WON_30DAY_LIMIT` (1500), `RECEIVER_30DAY_REVIEW_THRESHOLD`
(250,000, log-only). All are single constants at the top of
`pages/api/live/gift.js`. Re-measure against the earn distribution before
changing any of them — that is what sized them.
