# Phase 6: the ledger speaks to the player, and #1754 is re-landed (2026-09-20)

**THE DIAMOND ARENA IS DIAMONDS ONLY. NO CHIPS, EVER.** (Dan, 2026-09-13.)

## Re-land of #1754 (the earn pane knows what it cannot tell)

`Restore the complete September 13 World Hub application and pipeline`
(#1821) removed everything #1754 (merged 2026-09-14, `8080b2e25d`) had put
on main, and nothing re-landed it: `src/lib/rewards/loginStreak.mjs`,
`loginClaimedToday` / `nextLoginReward` in `/api/rewards/progress`, the
exact SQL headline (`fn_diamond_lifetime_totals`) and the wallet summary
(`fn_diamond_wallet_summary`, on_hand / sendable / collateral / in_arena) in
`/api/store/diamond-transactions`, the modal's Escape ordering (innermost
surface first) and the Send panel's Sendable hint and pre-flight check, the
test and the audit note. Cherry-picked onto current main; the modal's
TX_TYPES / `txConfigFor` conflicts resolved to main's newer label-only shape
(the commerce release had already re-derived that part), the training
inventory regenerated. `__tests__/the-earn-pane-knows-what-it-cannot-tell.test.mjs`
is green again (9 cases) and wired into `_test-guards-exist`.

## Phase 6

`diamond_transactions.description` is written for the player and the
operator at once and this modal printed it raw: "Challenge reward: sd_10",
the audit sentence behind 418 reconciliation credits, "PvP match abandoned -
10diamonds refund". Club Arena migration `20260920142916` gives the ledger
ONE player-facing line, `player_line`, a PostgREST computed column over
`fn_diamond_ledger_line` (dashes, glued units, emoji and uuids cleaned;
operator notes, machine tails, bare kinds and test rows take the kind's row
label). Measured over all 299 description shapes / 85,155 rows: zero lines
with a dash, an emoji, a uuid, a glued unit or an operator word.

- `/api/store/diamond-transactions` selects `*, player_line` (a computed
  column is not part of `*`).
- `DiamondWalletModal` prints `player_line` (falling back to the label),
  shows it as the expanded Details line, and searches by it; the identity
  split for transfers (`formatWalletDescriptionParts`) still applies to the
  line, which keeps the friend's name and drops the trailing `[uuid]`.
- `__tests__/the-ledger-speaks-to-the-player.law.test.mjs`, wired into
  `_test-guards-exist`.

Gates run locally: `node --experimental-vm-modules --test` over the wallet
suites (123 pass, 0 fail); training inventory regenerated.
