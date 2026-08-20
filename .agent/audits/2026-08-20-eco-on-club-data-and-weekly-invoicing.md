# ECO switched on, Club Data screen, weekly union invoicing

Date: 2026-08-20
Follows: `2026-08-20-eco-formula-correction.md`, `2026-08-20-eco-verification-pass.md`

Three things shipped together: ECO is live, club owners have a real-time data
screen, and the union now issues and delivers a weekly square-up statement.

---

## 1. ECO is on

`eco_enabled = true` on Midway Union, `eco_rate = 0.10`,
`eco_base_mode = club_cash_profit`.

**A new setting came with it: `eco_include_horses`, defaulting to true.**
ECO had always used the same population as the settlement so the two could
never disagree. That is currently the whole story: Midway has 578 attributed
members and **four of them are real people**. Real players generated 27.58 in
cash rake this week and are down 628.80; horses account for the other ~950,000
of rake and ~5.5M of club winnings. So the first live invoices are enormous and
describe house-vs-house play.

Flipping the population is now one line, no migration:

```sql
UPDATE unions SET settings = settings || '{"eco_include_horses":false}'
 WHERE id = 'fade0000-0000-0000-0000-000000000001';
```

`fn_union_eco_adjustment` returns `include_horses` and `union_eco_ledger`
stores it, so a recorded figure always says which population produced it.

## 2. Club Data screen

Route: `data` and `clubs/:clubId/dashboard` now render the new
`ClubDataPage`. The older multi-tab dashboard is still reachable at
`clubs/:clubId/dashboard-full` — nothing was deleted.

Layout follows the reference screenshot: date range with previous/next arrows,
1 / 7 / 14 day presets, four summary tiles (Games, Total Winnings, MTT
Winnings, Fee), search, game-type filters (All, Hold'em, Omaha, Mixed, MTT,
SNG), stakes filters (Micro, Small, Mid, High), and one row per game with
time, creator, variant badge, rake percent, blinds and fee. Plus a statement
card at the top showing the club's latest weekly square-up. CSV export.

Refreshes on a 60s interval and whenever the tab regains focus.

**Why a rollup sits behind it.** Rake attribution means expanding
`rake_records.player_contributions` into one row per player per hand. The union
books 58,508 raked hands a day and 638,361 over a fourteen-day window. That
expansion was measured live and **does not complete inside the statement
timeout**, so the screen could never have been built on a live query. New table
`club_table_daily` holds `(club_id, table_id, stat_date)` with rake, hands,
players, buyins, cashouts and net. Backfilled 14 days; maintained by
`fn_club_table_daily_catchup(2)`, hung off the hourly pg_cron job that already
exists (`club-rake-rollup-catchup` at :25) because CLAUDE.md section 11 forbids
adding a new scheduled trigger.

Reconciles against the authoritative union figure for the live week:
942,388.72 rollup vs 942,543.69 from `fn_union_rake_paid_readonly`, the
difference being rake booked in the seconds between the two reads.

Tournaments and spins are computed live — that volume is ~13k rake rows a week
against 638k for cash, so it is cheap.

### One bug found and fixed during the build

The first cut of `ca_club_data_snapshot` attributed tournament and spin rows to
the whole **union** rather than the club being viewed, so Club JAQK's screen
showed SHARK CLUB's tournament fees and winnings too — `mtt_winnings` read
+135,588.09 against a real figure of +3,917.61. Cash rows were always correct;
they come from `club_table_daily`, which is keyed by member club. After the
fix JAQK's 345.76 plus SHARK's 12,959.82 equals the union's 13,305.58 exactly.

### Access

`ca_can_view_club_finances` — club owner, admin or super_agent, or a platform
admin. Deliberately stricter than the existing `ca_can_view_club`, which lets
any member in; this returns club money.

## 3. Weekly invoicing

`fn_union_club_invoice` had computed the whole statement since 2026-08-20 and
**had no caller anywhere** — no API route, no UI, no function, no cron. It was
a calculation with no delivery.

Now:

- `fn_union_issue_weekly_invoices` persists one `settlement_invoices` row per
  club (`invoice_type = 'union_weekly_squareup'`, new `due_at` column, due
  three days after period end) and inserts notifications for the club owner and
  every club admin. A trigger already mirrors notifications into `push_outbox`,
  which the push-dispatch cron drains every minute, so in-app and push delivery
  needed no new infrastructure.
- Idempotent: one invoice per club per period, enforced by a unique index and
  an upsert. Re-running Monday never bills a club twice.
- Wired as **round 4** of `fn_union_settlement_cascade`, the weekly close
  pg_cron already runs Mondays 00:10 UTC. ECO is recorded first, then the
  invoice is issued, so the ledger row and the billed figure come from the same
  computation of the same closed week.
- `pages/api/club-arena/union-invoice.js` adds the email leg (Resend) plus
  `preview` / `issue` / `send` actions, a `dryRun` escape hatch, and either
  CRON_SECRET or union-owner auth. Scheduled Mondays 13:00 UTC in
  `scripts/openclaw-cron-dispatcher.py`.
- `ca_club_union_invoices` is the club-side read, feeding the statement card.

**What the invoice bills.** From `fn_union_club_invoice`'s own semantics:
`settled_in_chips` (player P&L + rakeback) already moved automatically during
the week and is shown for transparency; `outstanding` (ECO + presettlements) is
the number that has to be squared up, and that is what the invoice bills.
Positive means the union owes the club.

Tested against the closed week 2026-08-10 to 2026-08-17 in a rolled-back
transaction: 2 invoices, 2 notifications, JAQK owes 7,531.11, SHARK owes
220,615.68.

## 4. Verification

- Club Arena `tsc --noEmit`: clean, exit 0, zero errors repo-wide.
- Club Arena `vite build`: succeeds, `ClubDataPage` chunk emitted.
- Filters exercised against live data (1-day Omaha, 7-day MTT, 14-day all).
- Tournament fee attribution reconciles to the cent against
  `fn_union_tournament_rake_by_club`.
- ECO formula assertions re-run after the horse toggle: still exact.

## 5. Open

1. **`eco_include_horses` is true.** Until real clubs are on, invoices are
   dominated by horse play. One settings update flips it.
2. **The dispatcher change needs deploying.** `bash scripts/deploy-openclaw.sh`
   pushes `openclaw-cron-dispatcher.py` to Hetzner. Until that runs, the email
   leg does not fire on a schedule — the invoice is still issued and delivered
   in-app and via push from Postgres, so a club never loses its statement,
   only the email.
3. **`rakeback_due` still pays on cash rake only** (carried from the earlier
   audit). By Dan's rule clubs earn 90% of cash, tournament and spin rake. The
   total is available as `fn_union_eco_adjustment.total_rake_generated`. Still
   a money change, still waiting.
4. **`RESEND_API_KEY` / `UNION_INVOICE_FROM`.** The route returns 503 with the
   invoices still issued if the key is absent, rather than failing the run.
