# Five money routes could move chips during the freeze, and the check could not see them

**2026-09-04.** Found while fixing a CHECK 18 false positive. The false positive
was the small half.

## The check had never actually enforced anything

`MONEY_RE` listed PREFIXES - `fn_credit_`, `fn_transfer_`, `atomic_chip_` - so
every RPC spelled differently fell straight through as though the route touched
nothing. A sweep of every `.rpc()` in `pages/api/club-arena/` found **sixteen
money-shaped names the pattern missed**, including `fn_debit_chips`,
`fn_approve_cashout_atomic`, `mint_club_chips` and `fn_refund_shop_purchase`.

It surfaced by accident: `distribute-promo.js` and `promo-wallet.js` were being
counted as money routes **only because the words `chip_balance` and
`chip_treasury` appear in their comments**. Fixing that false positive removed
the accident and left them uncounted - which is what exposed the real hole.

Arming the wider pattern reported five routes with no freeze check at all.

## Why that matters

Every route under `pages/api/club-arena` runs with the **service key**, and the
service role is **exempt from the `zz_freeze_guard` triggers**. For these routes
there is no second line of defence: whatever they do during the `:55` break, the
database will let them. So a player watches a countdown that says nothing is
happening while their chips move.

CLAUDE.md 13 names the first case explicitly: *"NO BUY INS, NO CHIP MOVEMENTS."*

## What each route needed, decided one at a time

| route | verdict |
|---|---|
| `approve-cashout.js` | **refuses** - a person moving chips now. Both branches; the cancel branch was a second call my first patch missed |
| `cancel-my-cashout.js` | **refuses** |
| `refund-purchase.js` | **refuses** |
| `record-rake.js` | **exempt, declared** - books a hand that already finished |
| `buyin.js` | already correct: a retired 410 with no database client at all |

`record-rake` is the distinction that matters. The break parks tables at a hand
boundary, but a hand in flight when the countdown starts still finishes, and its
rake posts afterwards. Refusing that write would not prevent a chip movement -
the chips already moved at the table. It would only lose the rake, and the VIP
points, agent commissions and BBJ contribution hanging off it. Horses are
players (10.5), so on a horse-heavy table that is most of the hands in the
window. That is the "engine-style recovery bookkeeping" exception the freeze
rule names, and it is now written down where a reviewer sees it.

`buyin.js` deserves a note: it already carried a `freeze-exempt:` marker whose
text says CHECK 18 was misreading its retirement notice, and that deleting the
signposts to quiet the check would make the notice less useful. A previous agent
hit the exact false positive and worked around it correctly instead of deleting
the explanation.

## One helper, because "fails closed" is worth getting right once

`src/lib/club-arena/platformFreeze.js` asks `fn_platform_frozen()` and answers
503. It **fails closed**: if the freeze cannot be read, the request is refused.

The usual instinct - fail open so a blip does not break the feature - is wrong
here precisely *because* there is no trigger backstop for the service key.
Failing open moves chips during a freeze, which is the thing being prevented.
Failing closed delays a cashout by at most five minutes, and every caller is
retryable. A player asked to try again after the break is not harmed; a ledger
written during a freeze everyone was told was total is much worse.

## Hardening, and a bug the mutation test caught in my own work

CHECK 18 now recognises three sanctioned answers - `fn_platform_frozen`,
`refuseWhileFrozen`, and a written `freeze-exempt:` - and reads them from
different places:

- **a call must be in CODE**
- **a declaration may be a comment**, because that is what the script's own
  instructions tell you to write

Reading both from the raw file looked harmless and was not. `record-rake`'s
exemption paragraph *explains the difference* between itself and the routes that
use `refuseWhileFrozen()`, so merely naming the helper in prose made the file
look guarded - and deleting its actual marker changed nothing. A mutation test
caught it: the check would have gone on passing a route whose exemption had been
removed.

Every guarantee is mutation-verified: removing a route's guard fails, removing
the exemption marker fails, a comment that merely names an RPC is ignored, and
the same name in real code is caught.
