# 2026-08-19 — Union: audit round 3

Round 3 checked publication first, then swept the read paths and the
observability gap.

## Publication check

All green this time, but only because round 2 caught the workers deploy gap:

| Layer | Revision | How verified |
|---|---|---|
| Workers (Hetzner) | `7960b4f` | container label + `/health` |
| World Hub (Vercel) | prod includes `f8122877` | `/api/health` SHA ancestry |
| Club Arena | `c2dcdba`, `972b80f` | on `origin/main`, picked up by the sync build |

## Findings

| # | Severity | Finding |
|---|---|---|
| 1 | **CRITICAL** | `tables` SELECT RLS was `USING (true)`. Private club games were world-readable — a real exposure, not a display bug. |
| 2 | **CRITICAL** | `SettlementHistoryPage` had no `invoice_type` filter while its mapper assumed every row was a union rake-hold invoice. A `union_club_pnl` row rendered to a club owner as **"Rake: X / Fee: −X / Net: 0"** — "the union took 100% of your rake" — and corrupted all three summary tiles and the chart scale. |
| 3 | **CRITICAL** | `TournamentLobbyPage` listed by `.in('club_id', <every club in the union>)`, exposing sibling clubs' private tournaments; and `/tournaments` mounts it with **no clubId**, which emptied the filter list and skipped scoping entirely — a platform-wide listing. |
| 4 | **HIGH** | `SearchPage` searched all tables by name with no filters — private, soft-deleted, closed, and tournament sub-tables all returned as joinable cash games. |
| 5 | **HIGH** | `ClubHomePage` realtime INSERT handlers admitted rows the fetch excludes; the tournament UPDATE handler kept CANCELLED/COMPLETED rows on screen as clickable cards, re-opening the silent-join bug live. |
| 6 | **HIGH** | `TournamentService` still required `.eq('is_xmtt', true)` on the union branch, hiding every union-owned non-XMTT tournament. ClubHomePage was fixed the same day; the service was missed, so the two lobbies disagreed. |
| 7 | **HIGH** | `SettlementService.getPeriodHistory` was globally unscoped and rendered under one club's heading. |
| 8 | **MED** | `UnionDashboardPage` period list was unscoped, on a comment that wrongly claimed `settlement_periods` has no `club_id`; its Club column always read "Unknown". |
| 9 | **GAP** | The weekly union settlement had **no user-visible surface at all**. |

## Shipped

- **DB**: `tables` SELECT policy now respects `is_private`; `union_pnl_settlements`
  readable by union owners/admins.
- **club-arena** `c2dcdba`: findings 2–7.
- **club-arena** `972b80f`: finding 9 — a "Weekly Player P&L Settlement" panel on the
  union dashboard, plus finding 8.

## Verified-not-broken

- `settlement_invoices` / `settlement_periods` RLS **is** properly scoped
  (`settlement_invoices_club_admin_select`, `settlement_read`,
  `union_overseer_read`). The unscoped client queries were correctness bugs,
  not breaches — stated precisely rather than alarmingly.
- The CI phantom-column manifest already contains `tournaments.is_private` on
  `main`; an earlier report of staleness came from a dirty working tree.

## Still open (deliberate)

- `settle-period.js` swallows non-P&L failures (agent commissions, union hold,
  ledger writes) behind `console.warn`. Only the P&L leg was made loud. Its own
  pass — it touches money paths not yet audited end to end.
- `chip_transactions` cash-outs carry no `table_id`, so a private-game cash-out
  can fall into union P&L scope. Zero private games exist today.
- The real-player-vs-house residual remains a business decision for Dan (see
  round 2). The guard blocks payment until it is settled.
