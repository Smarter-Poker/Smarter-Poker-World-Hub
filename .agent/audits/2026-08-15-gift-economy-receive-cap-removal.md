# Gifting economy: stop capping what broadcasters can RECEIVE

Date: 2026-08-15
Author: Cowork agent
Trigger (Dan, delegating the decision): "IDK, YOU DECIDE, LOOK AT WHAT TIKTOK
DOES, AND DO SOMETHING SIMILAR... 1000 DIAMONDS EVERY 30 DAYS SEEMS VERY LOW,
WE WANT DIAMONDS FLYING AROUND AND BEING PURCHASED."

Shipped: `3c60de8324`. Production /api/health served `7bcedd27` (which
contains it) at 2026-08-15T16:29Z; the deployed `gift.js` was read back at
that SHA to confirm the new constant is live and the old block is gone.

## What the majors actually do

Researched 2026-08-15. The finding is consistent and unanimous:
**no major platform caps what a creator can RECEIVE.** They throttle the
ENTRANCE and the EXIT, never the middle.

| Platform | Sender-side limit | Receiver cap | Exit control |
|---|---|---|---|
| YouTube Super Chat | $500/day, $2,000/week; max $500 per message | none | 30% platform cut |
| TikTok LIVE | no published per-day cap; largest single gift ~34,999 coins | none published | 1 withdrawal/day, ~$1,000 max, $100 min; ~50% split |

The exit is the choke point because the abuse being defended against is
laundering: buy -> gift -> withdraw. Blocking the middle of that chain
punishes legitimate popularity without stopping the chain.

## Why ours was backwards

The old rule was a HARD BLOCK at 1,000 diamonds received per broadcaster per
30 days:

1. It fired on the **most popular broadcasters** — exactly the rooms where
   purchase intent peaks — and made their viewers' gifts **fail**.
2. A single gift may be up to 10,000. One whale gift was **10x the
   receiver's entire monthly allowance**. The two caps contradicted each
   other outright.
3. Senders graduate to unlimited at 120 days. Receivers **never graduated**.
4. Only the KINGFISH account was exempt, so it applied to every real creator.

## Why removing it is safe

**Smarter.poker has no diamond cash-out.** Diamonds are a closed loop. The
only cashout path in the codebase is `pages/api/club-arena/request-cashout.js`,
which operates on Club Arena `chip_balance` — a separate per-club chip
economy that never touches `diamonds` / `diamond_balance`. With no exit to
real money there is no laundering vector for a receive cap to close.

**Free-diamond farming is already throttled at the sender**, by source tier:
`FREE_EARNED_30DAY_LIMIT = 100` per 30 days for free/earned diamonds. The
receive cap was redundant with the control that actually works.

**Verified there is no DB-side mirror.** `fn_check_anti_farming_gift_cap` and
`fn_enforce_anti_farming_caps` contain no receiver logic, so the JS layer was
the only enforcer and removing it fully removes the block.

## Changes

- **Receive cap removed.** Replaced with `RECEIVER_30DAY_REVIEW_THRESHOLD =
  250000`, which is **log-only and never rejects**. The 30-day receive total
  is still computed and logged past that line, so implausible concentration
  stays visible for review and `is_farming_flagged` remains a human decision
  rather than a rule that silently kills revenue.
- **Fresh-paid senders no longer double-bound.** The 500-per-30-DAYS
  purchased/won source cap no longer stacks on top of the 500/24h cap during
  the 7-day post-purchase window. The stack made the daily allowance a lie:
  someone who bought 5,000 diamonds could gift 500 of them in their entire
  first week. The 24h cap is the intended chargeback-window control.

## Deliberately NOT changed

- **Peer-to-peer transfer recipient cap** (`store/diamond-transfer.js`,
  `RECIPIENT_DAILY_RECEIVE_LIMIT = 1000` on the `diamond_gift_received`
  transaction type — a different type from live gifting's
  `live_gift_received`, so the two are independent). Account-to-account
  transfer is the classic mule/farming vector and has **no purchase upside** —
  nobody buys diamonds to transfer to a friend at scale. TikTok and YouTube
  have no peer transfer at all, so keeping P2P tight while uncapping creator
  receipt is exactly the industry shape.
- New-user block (30 days, already bypassed by any completed purchase — so
  paying customers can gift immediately), source-tier caps, per-gift 10,000
  max, velocity detection, KINGFISH bypass.

## Net effect on the funnel

Entrance is still graded by trust: unpaid new accounts are blocked, a
purchase unlocks gifting immediately at 500/24h for 7 days, then unlimited;
unpaid accounts graduate at 120 days; free/earned diamonds stay capped at
100/30d so farming has no headroom. Nothing between a paying viewer and a
popular broadcaster is capped any more.

## Verification

`node --check` on gift.js; byte-exact blob match on the Mac before push
(`ed7b8416`); deployed `gift.js` read back at the production SHA showing
`RECEIVER_30DAY_REVIEW_THRESHOLD` present and no `broadcaster_receive_cap`
branch; economy invariants re-run against the live DB after the change —
12/12 passing, zero failing.

Note: Build Safety Gate runs were being continuously cancelled during this
window by the club-arena sync bot's push cadence (`cancel-in-progress: true`)
— six consecutive runs cancelled. That is a pre-existing CI condition, not a
result of this change; CHECK 10 was therefore verified directly against the
production database instead.
