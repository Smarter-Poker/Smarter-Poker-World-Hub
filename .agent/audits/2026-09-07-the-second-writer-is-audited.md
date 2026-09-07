# The second writer is audited against the money-door register

2026-09-07. Club Arena chip-accounting programme, phase 7, roadmap 9.6. Full
account, measurements and the check itself:
`Smarter-Poker-Club-Arena/docs/changelog/2026-09-07-phase-7-the-player-and-the-second-writer.md`.

The database registers every money door (`ca_money_rpc_registry`). This repo's
`pages/api/club-arena/` routes call those doors by name over PostgREST, and
until today nothing compared the two. `fn_ca_second_writer_check` now answers
for every `.rpc()` call under that directory, and Club Arena's
`scripts/ci/audit-second-writer.mjs` runs it hourly against this repo's `main`
(checked out with the estate's App token) from `schema-manifest-refresh.yml`,
raising a named issue there on any disagreement.

## What the first comparison found in this repo, and what changed

- `union-wallet.js` `process_bbj_payout` called `fn_union_bbj_pool_payout`,
  closed in the register on 2026-09-04 and revoked from service_role: it
  inserted an idempotency claim, got "permission denied", deleted the claim,
  answered 500 - on every call since. It now refuses (410) before writing.
- `promo-wallet.js` `mint_promo` called `mint_club_promo`, also closed.
- `agent-credit.js` called `fn_atomic_increment_field` and
  `fn_add_prepaid_credit_atomic` with parameter NAMES no live signature has
  (PostgREST answers PGRST202 to a wrong name), so its JS-arithmetic fallback
  on `credit_limit`, mirrored by hand into `agents`, was the only path that
  ever ran. `player-retention.js` (`fn_credit_chips` with an extra `source`
  key) and `record-rake.js` (`increment_settlement_counters` with
  `p_rake, p_hands` against `p_club_id, p_period`) had the same shape.
- Those five routes - `agent-credit`, `player-retention`, `record-rake`,
  `promo-wallet`, `manage-agent` (direct `credit_limit` writes) - have NO
  caller: not in Club Arena, not in this repo's pages (only the rate-limiter
  table and two e2e scripts name them), not anywhere in the organisation
  (GitHub code search), and not in seven days of Vercel production logs.
  Club Arena adjusts agent credit through `fn_admin_update_agent` from the
  browser; the engine records rake itself. **Removed**, with their
  `RateLimiter.js` rows and their `check-frozen-aware-money-routes` baseline
  entries (that baseline is shrink-only).
- `create-club.js`, `join-club.js`, `manage-union.js` no longer name balance
  columns in provisioning inserts (`NOT NULL DEFAULT 0` on every one;
  `trg_membership_starts_with_zero_chips` enforces the zero regardless). A
  route never names a balance column, not even to write a zero.

Against this branch the check reports 64 routes, 66 calls, 62 checked, 4
unchecked (`house-ads.js`, variable payloads), 0 errors, 0 direct balance
writes. `check-frozen-aware-money-routes.mjs` (CHECK 18) still passes.

## Left for a decision

Thirteen more money routes here have no caller anywhere and agree with the
register: `transfer-chips`, `leave-club`, `rakeback`, `settle-period`,
`table-chips`, `clawback-chips`, `request-cashout`, `cancel-my-cashout`,
`distribute-promo`, `table-templates`, `join-club`, `delete-club`,
`create-club`. Each is a route a valid JWT can still POST to and no screen
exercises. The hourly check keeps them honest; whether they should exist is
Dan's call.
