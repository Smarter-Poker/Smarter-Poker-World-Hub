# 2026-08-19 — Union P&L: audit round 2 (auditing the fixes)

Round 1 fixed a feature that never ran. Round 2 audited **those fixes** and
found four more defects — every one caught by *running* the code, not reading
it. Also: the worker fixes from round 1 were **committed but never published**.

## Publication gap (found first)

`smarter-poker-workers` only builds on `v*.*.*` tags or manual dispatch —
**a push to `main` does not deploy**. The Hetzner container was still running
`16d7e8c`, the commit *before* the rakeback and P&L fixes. So round 1's most
valuable fix was live in git and dead in production. Deployed via
`scripts/deploy-workers.sh --build-on-server`; container now reports the
correct revision and `/health` OK. **Any future worker change must be
deployed explicitly — pushing is not shipping for this repo.**

## Defects found in round 1's own fixes

| # | Severity | Defect |
|---|---|---|
| A | CRITICAL | `needs_review` permanently blocked retry — the idempotency index ignored status, so a guarded week could never be settled again, and the retry reported `{already_settled:true}` (success) while doing nothing. |
| B | HIGH | The first weekly run had no baseline: the bootstrap row is dated mid-period, but lookup required `period_start < p_start`. Forced `stack_delta = 0` → guard trip → then permanently stuck by (A). |
| C | MED | Seated stack was read at job time, not at `period_end` (10h of drift for a Mon 10:00 job on a Mon 00:00 boundary), and fixed windows left a gap between periods that lost flows entirely. |
| D | CRITICAL | **The settlement was measuring house AI, not players.** |

### D is the important one

Production reality: **1,148 of 1,156 union club members are horses**, and
**100% of the 11.7M chips seated on union tables are horse chips.** Horses are
seated by the engine (`atomic_table_buyin`, funded from the club treasury) and
never touch `wallet_transactions` — so their chips showed up in the
seated-stack delta with no matching debit and shattered the accounting
identity.

The dry run said it plainly: **imbalance 1,112,929**. The job would have moved
over a million chips between club treasuries and the union wallet on the basis
of house-AI noise. The zero-sum guard refused to move a single chip — which is
exactly why it was built.

Excluding `profiles.is_horse` from P&L, seated stacks and rake attribution
brought the same window to **imbalance −1,138**, a single real player's
session. ~1000x more accurate, and economically right: a horse is house AI
funded by the club itself, not a club↔union obligation.

## Shipped

- **DB**: retry-safe partial idempotency index; `fn_union_pnl_baseline`;
  `fn_union_settle_player_pnl_weekly` (self-chaining window, min-hours skip);
  `fn_union_settle_player_pnl` v3 (baseline + supersede); horses excluded from
  `fn_union_club_player_pnl`, `fn_union_rake_paid_by_club`,
  `fn_union_pnl_bootstrap`; baselines re-bootstrapped on the new basis.
- **workers** `7960b4f`: calls the self-chaining weekly RPC. **Deployed.**

## Open question for Dan (business, not engineering)

The residual −1,138 is a real player losing to **house horses**, not to
another club's player. Options: (a) treat real-player-vs-house as club-internal
and settle only real-vs-real (current effective behaviour — guard blocks the
residual), or (b) treat horses as belonging to their funding club, making the
system closed and zero-sum. This decides who gets charged, so it is Dan's call.
Until then the guard blocks payment, which is the safe failure mode.
