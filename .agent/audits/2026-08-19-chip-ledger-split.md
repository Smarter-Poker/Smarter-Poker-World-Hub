# Chip ledger split — findings, decision, and the one open question

Date: 2026-08-19
Status: **measured and monitored; migration NOT performed (needs Dan's call on one point)**

---

## The finding

Chips are written to two different places depending on which code path moves
them. Verified by reading the function bodies in production, not inferred:

| Path | Function | Ledger written |
|---|---|---|
| Table buy-in | `atomic_table_buyin` | `wallets.balance` — **global** |
| Table withdraw | `atomic_table_withdraw` | `wallets.balance` — **global** |
| Cashier "Send" | `atomic_chip_transfer` | `wallets.balance` — **global** |
| Buy chips with diamonds | `fn_purchase_club_chips` | `club_members.chip_balance` — **per club** |
| Request cashout | `fn_request_cashout` | `club_members.chip_balance` — **per club** |

`wallets` is unique on `(user_id, wallet_type)` and has **no club column**, so
`wallet_type='PLAYER'` is necessarily one balance shared across every club a
user belongs to.

The loop is therefore broken in both directions:

- chips **bought** with diamonds land in `club_members` and **cannot be used to
  buy into a table** (the table reads `wallets`)
- chips **won** at a table land in `wallets` and **cannot be cashed out** (the
  cashout reads `club_members`)

This contradicts the stated product model — chips are per club and are not
interchangeable; only diamonds are global.

## Measured impact (production, 2026-08-19)

    users_total             578
    bought_but_cannot_play    3
    won_but_cannot_cashout    0
    total_club_chips     84,113,273
    total_global_chips  732,147,803
    ledger_gap          648,034,530

Reproduce with `SELECT * FROM public.fn_chip_ledger_split_report();`
(service_role only).

Two things follow from those numbers:

1. **This is not currently stranding users at scale.** 575 of 578 users hold a
   non-zero balance on both sides, so in practice most people can both play and
   cash out. Only 3 users are actually stuck, and nobody has won chips they
   cannot withdraw.
2. **The gap is large and one-directional.** The global ledger holds ~8.7x the
   per-club ledger, which is consistent with play (buy-in/withdraw/transfer)
   having been the dominant flow for a long time.

## Decision

**Target architecture: `club_members.chip_balance` is the chip ledger.
`wallets` holds diamonds only.**

Rationale:

- it is the only one of the two with a club dimension, and per-club isolation
  is a product requirement, not an implementation detail. `wallets` cannot
  express it without a schema change that would leave two ledgers anyway
- the money-in and money-out paths (purchase, cashout) already use it
- `fn_purchase_club_chips` already exists and writes it correctly

## Why the migration was NOT performed here

Moving `atomic_table_buyin` / `atomic_table_withdraw` / `atomic_chip_transfer`
onto `club_members.chip_balance` is a single atomic change — doing any one of
them alone makes things strictly worse (e.g. switching only Send would credit
recipients a balance they cannot buy in with). That change:

- rewrites the money functions the **live Hetzner poker engine** calls
  mid-hand, so it needs a maintenance window and engine coordination, not a
  Wednesday-evening push
- requires reconciling the existing 732M global balance, and **there is no
  derivable answer for how one global balance splits across a user's clubs.**
  Two users with the same 500k global balance may have earned it entirely in
  different clubs. Any automatic rule invents money in one club and destroys it
  in another

That second point is the blocker, and it is a business decision rather than an
engineering one.

## The one open question for Dan

For each user's existing global `wallets.balance`, what should happen?

- **A. Attribute it all to one club** — e.g. the user's last-active club.
  Simple, but wrong for anyone who plays in both.
- **B. Split it pro-rata** across the user's clubs by an observable signal
  (hands played per club, or existing `club_members.chip_balance` ratio).
  Defensible, still an estimate.
- **C. Leave it and zero it** — treat the per-club balances as already correct
  and retire the global figure. Cleanest ledger, but writes off 648M of
  balance users can currently see.

Once that is chosen, the migration is a single reviewed change with a rollback:
switch the three functions, reconcile balances under the chosen rule, and add
the reconciliation as a hard invariant so the two can never drift again.

## What WAS done

- `fn_chip_ledger_split_report()` added (read-only, service_role) so the
  divergence is measurable on demand instead of only via manual audit.
- The client surfaces that were reading the *wrong* ledger for their purpose
  were corrected separately: the cashout modal now validates against the
  per-club balance the server actually checks, and chip purchases now send
  `clubId` so they credit the club rather than the global wallet.
