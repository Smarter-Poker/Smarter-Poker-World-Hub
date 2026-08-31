# `distribute-chips` removed: an unused route on the wrong account

**2026-08-31.** Part of the Club Arena "one money path" work (phase 3 of 7).
Companion to the Club Arena change that rewires the last live caller.

## Why it is gone

`POST /api/club-arena/distribute-chips` had an agent branch that called
`transfer_chips_agent_to_player`, which debits `club_members.chip_balance` — the
agent's own **player** wallet. Dan's rule, 2026-08-25 and repeated 2026-08-31,
is that chips move from the main bank to the **agent wallet** and out from
there. So the route moved the wrong account.

It was also **never used**:

- Its only client was `AgentService.distributeFromTreasury` in Club Arena, and
  **nothing calls that method** — it is dead client code, removed in the
  companion PR.
- Nothing else in this repo, the workers repo or the commander repo references
  the endpoint. The only other mentions were a rate-limit entry and a comment in
  `distribute-promo.js`.
- **It has never successfully run.** It writes an audit row on every success
  (`chip_distribution`, `promo_distribution`) and a `fraud_attempt_distribute`
  row on a rejected spoof. Queried against production on 2026-08-31:

  ```
  audit_trail / action_audit_logs, those three actions ......... 0 rows
  chip_transactions 'agent_to_player_transfer' ................. 0 rows
  ```

A route with no caller, no traffic and a wrong-account RPC behind it is not a
feature; it is a loaded gun. Removed rather than rewired.

## What did NOT change

- **Promo distribution is untouched.** `distribute-promo.js` is a separate live
  route on `transfer_promo_agent_to_player`, reached from Club Arena's
  `AgentPromoPanel` and `CashierPage`. Only the chips route is gone.
- The `distribute_chips` Postgres RPC (the owner/admin treasury branch) is left
  in place. It was reachable only through this route, so it is now callerless,
  but it is a correct club-scoped function and dropping it is a separate,
  deliberate decision.

## The real path

Club Arena's cashier surfaces already move chips the way Dan described:
`fn_club_bank_send` for the four bank roles and `fn_agent_wallet_send` for the
three agent roles. Both enforce their own authorization, take a uuid `op_id`,
write one `chip_transactions` row and open a ten minute clawback window.
