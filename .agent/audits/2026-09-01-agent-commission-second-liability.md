# The Second Liability: settle-period Computed Commission A Second Time

**2026-09-01. Phase 7 of 7 of the agent credit and promotion lifecycle.**
Club Arena side: `supabase/migrations/20260901133348_the_agents_books_tell_the_truth.sql`.

## What was here

Five World Hub endpoints read or wrote two tables that have held **zero rows
since the day they were created**: `commission_records` and
`commission_history`. Club Arena drops both in the migration above, along with
`agents.pending_commission`.

| Endpoint | What it did | What it does now |
| --- | --- | --- |
| `settle-period` (`close`) | Computed each agent's commission from `agents.weekly_rake_generated`, walked the upline for the delta, inserted `commission_records` + `commission_history` as `pending`, and generated `club_to_agent` invoices | Closes the period, takes the union hold, and reports what the ledger says was actually **paid** in the window. It no longer computes a liability |
| `settle-period` (`pay`, `pay_all`) | Marked those rows paid and moved chips from the club treasury | **410 Gone**, naming `fn_agent_claim_commission` |
| `settle-period` (`status`) | Listed `pending` commission_records for the period | Reports unclaimed commission per agent, from `agent_commissions` |
| `settlement-history` (`list`, `batch_preview`) | Read `commission_history` per period | `fn_club_commission_accrued(club, since, until)` per period; the preview lists what is unclaimed per agent |
| `agent-analytics` (`leaderboard`, `pulse`, `score`) | `commission_history` for the leaderboard; `sum_agent_commissions` for the rest | `agent_commissions` throughout, via a local `sumAgentCommissions` helper |
| `agent-dashboard` | `commission_history`, last 20 rows | `agent_commissions`, keyed by the agent's auth user id |
| `delete-club` | Cascaded through both tables | Both names removed; a club that still owes unclaimed commission is now **refused** deletion |

## The one that mattered

`credit_agent_commission_from_rake` writes **both** an `agent_commissions` row
**and** `agents.weekly_rake_generated`, in the same call, as each hand settles.
`settle-period`'s `close` then computed commission a **second time** from
`weekly_rake_generated` and wrote it into `commission_records` as `pending`,
payable by staff through `pay_all`.

One piece of rake, two payable debts: one the agent claims (Club Arena phase 6,
`fn_agent_claim_commission`), one staff pays from here. A club would have paid
its agents twice for the same hands.

**It never fired.** Both tables were empty on the day they were dropped, because
every historical `close` either 401'd (the cron's auth path, fixed 2026-07-19)
or stalled - two periods sit in `processing` from 2026-08-20, and every
`settlement_periods` row reads `total_commissions_paid = 0.00`. That is the only
reason this is a removal and not an incident report.

## Two dead RPCs the World Hub was still calling

- `sum_agent_commissions` - read `commission_history` and answered
  `{total: 0, paid: 0}` to everything. Club Arena's **phase 6 dropped it on
  2026-08-31**, so `agent-analytics`'s `pulse` and `score` actions have been
  calling a function that does not exist. `supabase-js` returns an error rather
  than throwing, and both callers read `commsData?.total || 0`, so the failure
  rendered as a zero either way.
- `get_daily_commission_summary` - asked `commission_history` for a column
  called `amount`, which that table does not have, so the `trends` sparkline
  42703'd rather than returning zero. Repointed at `agent_commissions` in the
  Club Arena migration; the World Hub call is unchanged.

## Order of operations

This PR merges and deploys **before** the Club Arena migration is applied. Until
it does, the World Hub still writes to tables the migration drops.

## Not changed

`settlement_periods`, the union hold, the player P&L square-up and the invoice
machinery are untouched. Only the agent-commission half of the settlement is
removed, because a second computation of a debt the ledger already carries is
the thing that was wrong.
