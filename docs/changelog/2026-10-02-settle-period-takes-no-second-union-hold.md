# 2026-10-02 - settle-period takes no second union hold

Chip-drift launch plan, phase 1 (no silent money failures).

`pages/api/club-arena/settle-period.js` `close` debited `union_rake_hold`
(default 10%) of the period's rake from a union club's treasury
(`fn_debit_treasury`) and credited the union's `rake_wallet`
(`fn_union_credit_wallet`, `settlement_hold`), as two separate RPCs.

- **It charged the club for rake it never held.** A union club's rake goes to
  the union wallet in the hand that raked it: in the hour to 16:40 UTC today,
  every `chip_ledger` `rake` leg (3,630 from `table_stack`, 465 from
  `prize_liability`, 10,367.87) went to `union_wallet`. The club's share comes
  back through the weekly union rakeback close
  (`fn_union_close_post_rake_debit`). A second hold here would have made the
  union paid twice for one hand.
- **It failed silently.** Since Club Arena migration `20261002140203`,
  `fn_debit_treasury` refuses an undeclared caller by name. The route logged the
  refusal with `console.warn`, skipped the credit and still answered
  `success: true` with a `unionHold` it never took.
- **It never ran.** No `union_wallet_transactions` row has ever carried
  `settlement_hold`; nothing in either repo calls `close` except the inert
  `settlement-history.js` `auto_close` path.

The leg is removed, not guarded: `unionHold` is reported as 0 with
`unionRake: 'collected_per_hand_by_the_union'` for a union club, and the
`union_to_club` invoice it wrote with it is gone. Commission and the union
player P&L paths are unchanged. `scripts/check-swallowed-money-errors.mjs`
counts two fewer swallowed money errors (70 -> 68).
