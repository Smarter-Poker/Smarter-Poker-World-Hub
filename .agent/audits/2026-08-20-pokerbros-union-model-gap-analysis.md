# PokerBros union model — research, gap analysis, and what was built

**Date:** 2026-08-20 · **Author:** Cowork agent · **Scope:** how real PokerBros /
PPPoker unions run their money, measured against what smarter.poker has built.

Sources are listed at the bottom. The most valuable one by far is a real
union's published operating charter (Primetime Union), which states the actual
numbers — fees, deposits, stop-loss, settlement deadlines, late fees.

---

## 1. How the real model works

### 1.1 The four-layer hierarchy

| Layer | Controls | Earns | Accountability |
|---|---|---|---|
| **Union owner / head** | Shared player pool, rules, stakes, promos | A slice of total union rake (8–10%) | Sets policy, can expel a club |
| **Super-agent** | Several agents + their chip allocations | Rakeback override on downstream volume | Vouches for agents |
| **Agent** | A roster of players and their credit | Rakeback share + spread on credit | Knows players personally; first to see odd money flow |
| **Player** | Their own seat | Winnings minus rake | Generates the rake everyone above lives on |

**The core invariant: money flows UP as rake and settlement; chips and credit
flow DOWN.** Every layer takes a cut and carries accountability for the layer
below it. A club sits inside a union; players sit under agents; agents sit
under super-agents.

### 1.2 Rake and the union fee

- Rake is typically **5%, capped at 3BB**, dropping to a **2BB cap at NL200+**.
- The union takes a cut of rake — **"up to 10%"** generally, **8% mandatory** in
  the Primetime charter. **This matches Dan's 10% spec exactly.**
- Primetime additionally levies a **"Tax/Rebate" of −10% of the club's winnings
  AND rake from cash tables, −4% from MTTs**. So some unions tax *winnings* too,
  not just rake. Dan's spec is rake + tournament fees only, which is simpler and
  is what we implement.
- Shared costs (accounting, table managers, diamonds, MTT overlays) are split
  **pro-rata by each club's share of total union rake**: "if your club rakes
  $1,000 and the union rakes $100,000, you pay 1% of those fees."

### 1.3 Rakeback

- Agents return **10–50%** of rake to players (up to ~70% for high-volume
  grinders/affiliates), as a **private deal between agent and player** — not a
  platform feature.
- Paid weekly or monthly, tracked by the agent.
- Each layer keeps an override on the layer below: the agent passes most
  rakeback to players and keeps a thin margin on volume; the super-agent earns
  on the combined volume of all their agents.

### 1.4 Settlement — the choke point

- **Weekly cycle. Statement issued Monday.**
- **Losing clubs must pay by end of Wednesday; winning clubs are paid by end of
  Wednesday.**
- **3% late fee** if a negative balance is not settled by Wednesday; the club is
  suspended until it pays.
- **Presettlement:** money sent mid-week. It is *deducted from the outstanding
  balance* in Monday's statement, and raises the stop-loss limit **1:1**.
- **Security deposit:** **$5,000 minimum**, held by the union, **returned only
  when the club leaves**. It explicitly *cannot* be used to settle a running
  negative balance (only on exit).
- **Stop loss:** limit **equals the security deposit**, **resets every Monday
  00:00 union time**. Crossing it **auto-suspends the club** until it settles.
  Presettling raises the limit for the current week.
- **Permitted stakes are tiered by deposit size** — e.g. <$5k → under 2/4;
  $5k–6.9k → up to 3/6; $10k+ → 25/50.
- Settlement between agents and players happens **off-platform** (cash,
  transfer, running credit). This is why integrity is a *money* problem: a
  winning bot must convert chips to cash through an agent who will be asked,
  every cycle, why that account keeps winning.

### 1.5 Risk and integrity rules

- **"Crushing club" rule:** a club that consistently finishes with a positive
  win ratio is asked to "balance out"; max acceptable ratio **1:1**. Refusal →
  removal or **increased union fees / win tax**.
- **Cheating** (bots, collusion, jackpot hunting, EV-chop hunting): funds and
  earnings seized, plus a fine equal to the damage caused.
- **Security checks run until Wednesday of the *following* week** — the union
  reserves the right to fine until then. Clubs are advised not to pay agents or
  players before that window closes.
- **No poaching** other clubs' players ($500 fine).
- **Union heads cover** EV chop, jackpot, freerolls, freebuys, spin-ups.

---

## 2. Gap analysis vs what we have

### 2.1 What we already have, and have *better* than the manual model

| Capability | Status |
|---|---|
| Union → clubs → agents → sub-agents → players hierarchy | `unions`, `union_clubs`, `agents` (with `parent_agent_id`, `commission_rate`, `player_rakeback_rate`, `credit_limit`/`credit_used`), `sub_agents`, `club_agents`, `player_agent_assignments` |
| Union fee on rake | 90/10 close, contribution-weighted per club — **automated**, where real unions do it in spreadsheets |
| Player win/loss settlement between clubs | `fn_union_settle_player_pnl` — zero-sum, guarded, idempotent, atomic chip movement |
| Player rakeback tiers | `rakeback_periods` (5/10/15/20/30% by volume), `rakeback_period_payouts` |
| Agent commissions | `agent_commissions`, `commission_records`, `commission_history` |
| BBJ | `bbj_pools`, `bbj_contributions`, conservation baseline + checks |
| Wallets | `union_wallets` (chip/rake/bbj/promo/insurance) with a double-entry ledger |
| Integrity | governance + conservation invariants every 30 min, anti-cheat events, chip-dump detection |

**We are ahead of the manual model on automation and auditability.** Real unions
settle in spreadsheets and Telegram; our settlement is atomic and asserted.

### 2.2 The gaps — what we were missing entirely

| # | Missing primitive | Consequence | Status |
|---|---|---|---|
| 1 | **Security deposit** | Union carries every club's losses **unsecured** | **BUILT** |
| 2 | **Stop loss + weekly reset** | A club can run an **unbounded** debt between Mondays | **BUILT** (visible + alertable; enforcement is Dan's policy call) |
| 3 | **Presettlement** | No way to take mid-week money or extend headroom without free credit | **BUILT** |
| 4 | **Live exposure view** | Nobody could answer "how much are we carrying right now?" | **BUILT** |
| 5 | **Settlement due date + late fee** | `total_unpaid` sits forever with no aging or consequence | **NOT BUILT** — see below |
| 6 | **Crushing-club / win-ratio monitoring** | No signal that a club is beating the union persistently | **NOT BUILT** |
| 7 | **Shared-cost allocation pro-rata by rake share** | No mechanism to bill union running costs to clubs | **NOT BUILT** |
| 8 | **Stakes tiering by deposit** | `stakes_cap_bb` column exists; nothing enforces it | **PARTIAL** (column only) |

---

## 3. What was built this round

Migrations `20260820o`, `20260820p`, `20260820q`.

- **`union_club_terms`** — per-club `security_deposit`, `stop_loss_limit`
  (NULL = not enforced), `stakes_cap_bb`, `status`, suspension fields.
- **`union_presettlements`** — mid-week payments with method/reference/note and
  an `applied_settlement_id` so a weekly settlement can consume them.
- **`fn_union_week_start()`** — Monday 00:00 UTC, matching the weekly rakeback
  close and the Monday auto-settlement cron.
- **`fn_union_record_presettlement(...)`** — union owner / union admin /
  service role only.
- **`fn_union_club_exposure(union, [week_start])`** — the risk view:
  `running_net`, `presettled`, `exposure`, `security_deposit`,
  `stop_loss_limit`, `headroom`, `breached`, `terms_on_file`, `status`.
  Inherits the reconciliation report's authorization.
- **Two governance invariants**, folded into the existing sweep so the engine
  sentinel and Monday PHASE 8 pick them up with no code change:
  `union_club_no_terms` (warning) and `union_club_stop_loss_breached`
  (critical).

**Deliberately conservative:** nothing is auto-suspended. A club with no terms
row or a NULL limit is *not* enforced, only reported. Turning enforcement on is
a policy decision.

### First production run — the point of the exercise

Since the Monday week start, with **zero deposit and no stop loss on file**:

| Club | Running net (owed to union) |
|---|---|
| SHARK CLUB | **−4,573,065.89** |
| Club JAQK | **−146,315.66** |

That is ~4.7M chips of exposure the union was carrying completely unsecured,
and **nobody could see the number before this**.

### Verified in a rolled-back transaction

- Setting a 1,000,000 stop loss on SHARK (4.57M down) flipped
  `fn_union_governance_check()` from **zero criticals** to
  `union_club_stop_loss_breached`.
- A recorded 250,000 presettlement reduced measured exposure by **exactly
  250,000** (4,571,758.69 → 4,321,758.69) and appeared in `presettled`.

### A regression of mine, caught and fixed in the same pass

The `union_rake_rollup_unmaintained` invariant I added earlier today called
`fn_union_rake_day_is_fresh` 7× per union, each a `count(*)` over a full day of
`rake_records` — **12.4s for that clause, 57s for the whole governance sweep,
running every 30 minutes**. Exactly the unbounded recurring cost this session
has been removing, introduced by me. Replaced with a day-presence index lookup;
sweep back to **0.94s**. Staleness is still covered — the catch-up job
re-validates every cycle, and the reader recomputes stale days live, so a stale
cache can never produce a wrong number.

---

## 4. Recommended next steps (not built — Dan's call)

1. **Set real terms.** `union_club_terms` is empty, so both clubs currently show
   `no_terms`. Decide a deposit and stop-loss per club, then decide whether
   breach should auto-suspend.
2. **Settlement aging (gap 5).** Add `due_at` to `settlement_invoices`, an
   overdue invariant, and optionally a late fee. Cheap and closes the loop on
   `total_unpaid`.
3. **Crushing-club monitor (gap 6).** A rolling club win/loss ratio with a 1:1
   threshold, reusing the reconciliation math. Straightforward.
4. **Shared-cost allocation (gap 7).** Bill union running costs pro-rata by each
   club's share of union rake — the rollup already has exactly the per-club rake
   basis this needs.
5. **Enforce `stakes_cap_bb`** at table creation if stakes tiering is wanted.
6. **Agent-level weekly statement.** Real agents settle per player. We have the
   data (`player_agent_assignments`, per-user rake in the rollup) but no
   agent-facing statement equivalent to `fn_union_weekly_statement`.

---

## Sources

- [PokerBros Union Economics: Who Actually Takes a Cut](https://pokerbrosbot.com/union-economics/) — four-layer hierarchy, money-flow direction, rakeback overrides, settlement as choke point
- [Primetime Union — Community Rules](https://primetimeunion.com/community-rules/) — the operating charter: 8% union fee, win tax, $5k security deposit, stop loss, presettlement, Wednesday settlement deadline, 3% late fee, crushing-club rule, shared costs
- [PokerBros Unions Explained (BluffingMonkeys)](https://bluffingmonkeys.com/pokerbros-unions-guide/) — what unions are, standardisation, shared player pools
- [PokerBros Bot: Why It's Really a Money-Flow Question](https://pokerbrosbot.com/) — club/union/super-agent structure, off-platform settlement
- [A Comprehensive PokerBros Agent Guide (WorldPokerDeals)](https://worldpokerdeals.com/blog/pokerbros-agent-all-you-need-to-know) — agent role, chip handling, no formal relationship with the app
- [PokerBros Review (BeastsOfPoker)](https://beastsofpoker.com/pokerbros-review/) — 5% rake, 3BB cap, 2BB cap at NL200+, union takes up to 10%
- [Rake Structure on Poker Apps (ThePokerAgent)](https://thepokeragent.com/rake-structure-on-poker-apps/) — rakeback ranges by union and deal
