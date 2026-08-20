# ECO formula correction — union weekly settlements

Date: 2026-08-20
Scope: Supabase only (Postgres functions + `union_eco_ledger`). No app code, no
API route, no Club Arena UI reads ECO today — verified by grep across both repos.
Applied to production via Supabase MCP as `eco_club_cash_profit_formula` and
`settlement_snapshot_carries_cash_seated_stack`.

## The rule, from Dan

> "the way its truly calculated is cash game loses, minus rake earned equals
> eco. no tournament rake or spins are including in the eco numbers. So if a
> club loses 35k but rakes 50k they are plus 15k and need to pay -1500 in eco.
> But if a club loses 50k and only rakes 35k they get 1500+ eco."

Two follow-up clarifications, which override the looser reading of the first
sentence:

> "the tournament rake adds to your 'total rake' — it just doesn't include
> tournament wins in the eco."

> "clubs only earn 90% of what they generate for cash games, tournaments and
> spins" — and, on the 50k in the worked example, "it would be 90% of 50k."

## What is now implemented

```
rake_earned      = club_commission_rate (0.90) x TOTAL rake generated
                   (cash hands + MTT + SNG + Spin buy-in fees)
cash_players_won = chips the club's players netted on CASH tables only
                   (positive = players won = the club LOST that much)
eco_base         = rake_earned - cash_players_won        (the club's week)
eco_amount       = -eco_rate (0.10) x eco_base
```

`eco_base > 0` (profitable week) gives a negative `eco_amount`: the club pays
the union. `eco_base < 0` gives a positive `eco_amount`: the union rebates the
club. `eco_base_mode = 'club_cash_profit'`, now the default, pinned explicitly
on Midway Union along with `eco_rate = 0.10`.

**Note the arithmetic drift from Dan's own worked example.** With the 90%
clarification applied, "loses 35k, rakes 50k" is `45,000 - 35,000 = +10,000`
profit and the club pays **1,000**, not the 1,500 in the original message. The
1,500 figure only holds if `rake earned` means 100% of rake generated. The 90%
reading was chosen because Dan selected it explicitly when asked directly. If
that is wrong, the single change is dropping `club_commission_rate` out of
`rake_earned` in `fn_union_eco_adjustment`.

## Three defects this fixed

1. **The sign of the player result was backwards.** All three previous base
   modes (`net_invoice_position` — the default, `winnings_plus_rake`,
   `winnings_only`) derive from `settle_net = players_won + rake`, i.e. they
   ADD the players' winnings to the base. Dan's model SUBTRACTS them: a club
   whose players win is a club that lost that money. The two disagree by twice
   the player result, the largest term in the calculation.

2. **Tournament and spin RESULTS were in the base.** `fn_union_pnl_all_clubs`
   counts wallet categories `tournament_buyin` / `prize` / `bounty` and adds
   the equity of still-running tournaments to the seated stack. New
   `fn_union_pnl_cash_by_club` is the same function with those terms removed;
   ECO reads it instead.

3. **Tournament and spin RAKE were structurally invisible.**
   `fn_union_rake_paid_live` joins `rake_records` to `tables` on `r.table_id`,
   but `record_tournament_buyin_rake` writes its rows with `table_id IS NULL`
   (a buy-in fee is not attached to a table). Every MTT / SNG / Spin fee was
   therefore missing from the union rake figure — **12,842.30 chips in the
   current week alone**. New `fn_union_tournament_rake_by_club` recovers them:
   `metadata->>'user_id'` names the payer on registration / rebuy / refund
   rows, and spin-settlement rows (which name no payer) are split equally
   across that spin's entrants, which is exact because every spin entrant posts
   the same buy-in. Rows are scoped to fees that were routed to this union.

## Cash-only stack baseline

ECO marks open chips to market, same as the settlement, so it needs the CASH
seated stack at the opening of the week. The only per-club opening figure that
exists is `union_pnl_settlements.club_results`, which recorded `seated_end` =
cash seated + running-tournament equity. On the live week that contamination
was 8,438.15 chips for SHARK CLUB (123,998.93 vs 115,560.78 cash).

`fn_union_settle_player_pnl` and `fn_union_pnl_bootstrap` now write an extra
`seated_end_cash` key into the snapshot. This is purely additive — `net`,
collections, payouts, invoices, the residual and the `settlement_periods`
update are unchanged, confirmed by a dry run returning the identical
`house_residual` of -4,736,509.58. `fn_union_eco_adjustment` prefers
`seated_end_cash`, falls back to `seated_end` for pre-existing snapshots, and
reports which it used via a new `baseline_cash_exact` column rather than
approximating silently. Midway currently has no baseline before the week start,
so `stack_delta` is 0 for every club and the current week is exact.

## Live figures, week of 2026-08-17 (ECO still disabled)

| club | cash_players_won | cash rake | tourney rake | total rake | rake_earned (90%) | eco_base | eco_amount |
|---|---|---|---|---|---|---|---|
| SHARK CLUB | -5,542,025.97 | 938,236.08 | 12,508.36 | 950,744.44 | 855,670.00 | 6,397,695.97 | -639,769.60 |
| Club JAQK | -177,871.81 | 29,871.53 | 333.94 | 30,205.47 | 27,184.92 | 205,056.73 | -20,505.67 |

Both clubs' players lost heavily, so both clubs are up on the week and both
pay. `union_net_eco` = +660,275.27 to the union. ECO is not zero-sum by design
(the house/horse residual is the counterparty), and this is reported rather
than hidden.

Two things about these numbers worth Dan's eye: they are dominated by horse
play, because ECO uses `p_include_horses => true` to stay consistent with the
settlement, and the magnitudes are a consequence of a -4.7M weekly house
residual in the current traffic mix, not of the ECO change.

## Verification

Post-apply assertions ran inside the migration and passed:

- for every club row, `rake_earned = round(club_commission_rate x total_rake_generated, 2)`,
  `eco_base = round(rake_earned - cash_players_won, 2)`,
  `eco_amount = round(-eco_rate x eco_base, 2)`,
  and `total_rake_generated = round(cash_rake + tournament_rake, 2)`
- `SUM(tournament_rake) > 0`, i.e. the previously invisible fees are now visible
- both of Dan's worked examples reproduce through the same expression the
  function uses (at 90%: -1,000.00 and +1,850.00)

Also checked by hand after apply: `fn_union_club_invoice` still returns, with
its ECO line at 0 (`eco_enabled = false`) and `player_pnl_net`,
`rakeback_due`, `settled_in_chips` unchanged; `fn_union_eco_record` writes all
terms to `union_eco_ledger` (test rows deleted afterwards, table left empty).

## Blast radius

None today. `eco_enabled` is false for every union, so `fn_union_club_invoice`
zeroes the ECO line. `players_won` and `rake_generated` keep their previous
all-games / cash-rake meanings on the adjustment function precisely so the
invoice identity `player_pnl_net = players_won + rake_generated = settle_net`
still holds. The three legacy base modes remain selectable so recorded ledger
rows stay explicable.

## Open items for Dan

1. **Switch ECO on?** `eco_enabled` is still false on Midway Union. Turning it
   on is a one-line settings update; it was deliberately not done in a
   migration because it changes what clubs owe.
2. **`rakeback_due` still pays on cash rake only.** `fn_union_club_invoice`
   reads `eco.rake_generated`. By Dan's rule — clubs earn 90% of what they
   generate for cash, tournaments and spins — it should pay 90% of
   `total_rake_generated`, which is now available on the same function. This is
   a settlement-money change (~12.8k chips/week at current volume) and was not
   folded in unilaterally.
3. **Horses in the ECO population.** ECO includes horses to stay consistent
   with the settlement. If clubs should not be taxed on horse results, the
   `p_include_horses` argument in `fn_union_eco_adjustment` is the one switch.
