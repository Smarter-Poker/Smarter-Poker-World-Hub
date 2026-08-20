# ECO verification pass — is the calculation right, and is it wired up?

Date: 2026-08-20
Follows: `2026-08-20-eco-formula-correction.md`
Question asked: confirm the ECO calculation is correct and that there are no
bugs, gaps, stubs, regressions, errors or wiring issues.

Answer: **the calculation is correct and proven.** The verification found
**two wiring gaps**, both now fixed
(`20260822211000_eco_ledger_rls_and_weekly_recording.sql`), and **one open
decision** that only Dan can make.

---

## 1. The calculation — proven, not asserted

Rate confirmed by Dan: *"if they earn 50k rake, they only receive 45,000 of
the rake, so they pay -1,000 eco."* So `rake_earned` is the club's 90% share.

A synthetic union with two clubs was built inside a transaction, run through
the real `fn_union_eco_adjustment`, and rolled back. Nothing was left behind
(verified: 0 probe clubs, 0 probe unions, `union_eco_ledger` still 0 rows).

| | CLUB ONE | CLUB TWO |
|---|---|---|
| cash game loss (players won) | 35,000.00 | 50,000.00 |
| cash rake | 40,000.00 | 20,000.00 |
| tournament / spin rake | 10,000.00 | 15,000.00 |
| **total rake** | **50,000.00** | **35,000.00** |
| club commission rate | 0.90 (explicit) | 0.90 (from NULL, defaulted) |
| **rake earned** | **45,000.00** | **31,500.00** |
| **eco_base** | **+10,000.00** | **-18,500.00** |
| **ECO** | **-1,000.00 (pays)** | **+1,850.00 (rebated)** |

CLUB ONE is Dan's worked example at the confirmed 90%: **-1,000.00, exact.**

The same probe simultaneously proved five other things:

- **Tournament results are excluded.** CLUB ONE's player was also down 4,000
  in an MTT. All-games `players_won` came back 31,000; ECO used the cash-only
  35,000. The tournament result never touched the base.
- **Tournament rake is included, by named payer.** The 10,000 MTT entry fee
  carried `metadata.user_id` and landed on the payer's club.
- **Spin rake is included, by equal split.** The 15,000 spin fee named no
  payer; it was split across the three entrants and, all three being CLUB TWO
  members, all 15,000 landed there.
- **`club_cash_profit` is the default.** The probe union set `eco_rate` and
  `eco_enabled` but deliberately set no `eco_base_mode`, and the function
  still resolved to `club_cash_profit`.
- **A missing `club_commission_rate` defaults to 0.90** rather than to zero or
  NULL, which would have silently wiped the rake term.

## 2. Live-data integrity checks (Midway Union, current week)

| check | result |
|---|---|
| rake rows that are both tournament AND on a union cash table (double-count risk) | **0** |
| tournament/spin rake routed to the union | 13,091.70 |
| tournament/spin rake actually attributed to a club | **13,091.70 — exact, nothing dropped or invented** |
| tournament rake rows naming a payer who is in no union club | 0 |
| spin rows where entrants are not union members (partial attribution) | 0 — all spins had 3/3 union entrants |
| refund rows (negative rake) | 1, correctly netted rather than dropped |
| `eco_base = rake_earned - cash_players_won` on every club row | holds |
| `total_rake_generated = cash_rake + tournament_rake` on every club row | holds |
| `eco_amount = -eco_rate x eco_base` on every club row | holds |

All four base modes compute, and an unknown mode is rejected loudly rather
than silently defaulting:

```
winnings_only        -> Club JAQK  17,796.97 | SHARK CLUB  552,294.24
winnings_plus_rake   -> Club JAQK  14,803.84 | SHARK CLUB  458,281.48
net_invoice_position -> Club JAQK  12,110.03 | SHARK CLUB  373,669.99
club_cash_profit     -> Club JAQK -20,627.98 | SHARK CLUB -640,105.11
bogus_mode           -> REJECTED: unknown eco_base_mode: bogus_mode
```

Note the sign flip. Under the three legacy modes the union would have been
*paying rebates* to two clubs that both had a profitable week. That is the
defect the correction fixes, in one line of evidence.

## 3. Gaps found and fixed

**GAP 1 — the ledger was unreadable and over-granted.**
`union_eco_ledger` had RLS enabled with **zero policies**, so every read by
`anon` or `authenticated` returned zero rows silently. A union owner could
never see the history the ledger exists to preserve. Meanwhile the raw table
grants were `anon=arwdxtm` and `authenticated=arwdxtm` — the only thing
between `anon` and INSERT/UPDATE/DELETE on a money ledger was the absence of a
permissive policy. Now: `authenticated=r` only, `anon` removed entirely, plus
the owner-or-union-admin read policy `union_pnl_settlements` already uses, and
a service-role policy for the writers.

**GAP 2 — nothing ever wrote the ledger.**
`fn_union_eco_record_current_week` had **no caller anywhere**: not in pg_cron
(33 jobs checked), not in the Open Claw dispatcher, not in any API route, not
in any other Postgres function. ECO would have been calculated on demand and
never recorded. The credit-risk sweep already carried an invariant
(`union_eco_not_recorded`) whose whole purpose is to complain about exactly
this, so switching ECO on would have produced a warning every week forever.

Recording is now a step of `fn_union_settlement_cascade` — the weekly close
pg_cron already runs as `union-weekly-rakeback-close` (Mondays 00:10 UTC).
Wiring it there rather than to `fn_union_eco_record_current_week` matters:
that function uses `fn_union_week_start()`, which at 00:10 Monday returns the
**new** week, so it would have recorded ten minutes of the wrong week. The
cascade already resolves the closed week (currently 2026-08-10 .. 2026-08-17).
The step is skipped unless the union has `eco_enabled`, is wrapped so it can
never abort the three money rounds, and returns its outcome in the cascade
JSON as `eco_recorded` instead of swallowing it.

## 4. Things checked and found sound

- **Authorization is real, not assumed.** `fn_union_eco_adjustment` inherits
  its access check by selecting from `fn_union_reconciliation_report`, and
  that function does carry an explicit owner / union-admin / club-officer
  check that raises for anyone else (added 2026-08-20 by
  `20260820l_authorize_union_reconciliation_report`). The helper functions
  `fn_union_pnl_cash_by_club` and `fn_union_tournament_rake_by_club` are
  revoked from `anon` and `authenticated` and reachable only through a
  definer function that has already run that check.
- **No regressions.** `fn_union_club_invoice` returns unchanged figures with
  the ECO line at 0 while disabled; `fn_union_settle_player_pnl` dry run
  returns the identical `house_residual`; `fn_union_credit_risk_check` and
  `fn_union_governance_check` both run clean apart from the pre-existing
  `union_club_no_terms` warning, which is unrelated to ECO.
- **No stray state.** `union_eco_ledger` is empty; the probe rolled back
  completely; Midway's settings read
  `eco_base_mode=club_cash_profit, eco_rate=0.10, eco_enabled=null`.
- **Supabase security advisors** flag `fn_union_eco_adjustment` only under
  lint `0029_authenticated_security_definer_function_executable`, which is the
  generic notice that a SECURITY DEFINER function is callable by signed-in
  users. That is intentional and guarded, as above. No RLS finding remains on
  `union_eco_ledger`.

## 5. Known behaviour worth naming (not bugs)

- **578 players belong to more than one Midway club.** Attribution uses
  `DISTINCT ON (user_id) ORDER BY joined_at ASC` — the earliest-joined club
  gets that player's cash results *and* their rake. That is the pre-existing
  platform rule, and ECO follows it exactly, so ECO can never disagree with
  the settlement. It is worth knowing that a multi-club player's whole
  contribution lands on one club.
- **Horses are included**, matching the settlement's `p_include_horses => true`.
  This is why the live figures are so large: the week carries a -4.7M house
  residual driven by horse play. If clubs should not be taxed on horse
  results, that is a one-argument change.

## 6. Still open — Dan's call

1. **ECO is still switched off** (`eco_enabled` unset on Midway). Everything
   above is proven and idle until it is turned on.
2. **Nothing surfaces ECO to a human.** `fn_union_club_invoice` has no caller
   in any API route or UI in either repo, so even with ECO on, no screen shows
   it. Recording now happens weekly; displaying it does not exist yet.
3. **Nothing charges ECO.** By design it is an invoice adjustment with no
   automatic chip movement. If it should actually move chips at settlement,
   that is a money decision, not a refactor.
4. **`rakeback_due` still pays on cash rake only** (carried over from the
   previous audit). By Dan's rule clubs earn 90% of cash, tournament and spin
   rake; the invoice currently credits only the cash part. The total is now
   available on `fn_union_eco_adjustment.total_rake_generated`, so the fix is
   small — but it changes what the union pays out, so it waits.
