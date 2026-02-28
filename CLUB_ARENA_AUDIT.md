# CLUB ARENA — Comprehensive Feature Audit

## Every Role × Every Feature × Every Layer

**Generated: Feb 28, 2026**
**Status Legend:**
- ✅ = Working end-to-end (DB + API + Frontend + Wired)
- 🔧 = Backend exists, frontend missing or not wired
- ⚠️ = Partial / Direct Supabase writes (needs API route)
- ❌ = Not built at any layer
- 📋 = DB table exists but unused

---

## 1. UNION OWNER

The union owner manages multiple clubs under one umbrella.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 1.1 | Create union | `unions` table ✅ | ❌ No API route | ❌ No UI | ❌ |
| 1.2 | View union dashboard (all clubs, totals) | `unions`, `union_clubs`, `clubs` ✅ | `union-dashboard.js` ✅ | ❌ No page exists | 🔧 |
| 1.3 | Add/remove clubs from union | `union_clubs` ✅ | ❌ No API route | ❌ No UI | ❌ |
| 1.4 | Add/remove union admins | `union_admins` ✅ | ❌ No API route | ❌ No UI | ❌ |
| 1.5 | Mint chips to club treasuries | `clubs.chip_treasury` ✅ | `mint-chips.js` ✅ | ❌ No UI | 🔧 |
| 1.6 | View all agents across clubs | `agents` ✅ | `union-dashboard.js` returns them ✅ | ❌ No UI | 🔧 |
| 1.7 | View settlement periods | `settlement_periods` ✅ | `settle-period.js` (status) ✅ | ❌ No UI | 🔧 |
| 1.8 | Union settings (name, description, code) | `unions` ✅ | ❌ No API route | ❌ No UI | ❌ |
| 1.9 | Union-level financial summary | `club_financial_summary` ✅ | ❌ Not queried | ❌ No UI | 📋 |
| 1.10 | Union diamond wallet | `club_diamond_wallets` ✅ | ❌ Not used | ❌ No UI | 📋 |

---

## 2. CLUB OWNER

The club owner has supreme authority within their club.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 2.1 | Create club | `clubs` + `club_members` ✅ | ❌ Direct Supabase in club-arena.js | `club-arena.js` modal ⚠️ | ⚠️ |
| 2.2 | Delete club | All tables ✅ | `delete-club.js` ✅ | `admin.js` Danger Zone ✅ | ✅ |
| 2.3 | Edit club settings (name, desc) | `clubs` ✅ | ❌ Direct Supabase in admin.js | `admin.js` Settings modal ⚠️ | ⚠️ |
| 2.4 | View club dashboard/reports | `clubs`, `club_members`, `tables` ✅ | Read-only (client) ✅ | `admin.js` Reports modal ✅ | ✅ |
| 2.5 | Manage members (roles, remove) | `club_members` ✅ | `manage-agent.js` (change_role, remove) ✅ | `admin.js` Members modal ✅ | ✅ |
| 2.6 | Promote member → Agent | `club_members` + `agents` ✅ | `manage-agent.js` (change_role, promote) ✅ | `admin.js` role dropdown ✅ | ✅ |
| 2.7 | Demote agent → Player | `club_members` + `agents` ✅ | `manage-agent.js` (change_role, demote) ✅ | `admin.js` role dropdown ✅ | ✅ |
| 2.8 | Assign players to agents | `club_members.agent_id` ✅ | `manage-agent.js` (reassign) ✅ | `admin.js` agent dropdown ✅ | ✅ |
| 2.9 | Distribute chips to any member | `club_members.chip_balance` ✅ | `distribute-chips.js` ✅ | `admin.js` Chip modal ✅ | ✅ |
| 2.10 | Mint chips to treasury | `clubs.chip_treasury` ✅ | `mint-chips.js` ✅ | ❌ No UI in admin.js | 🔧 |
| 2.11 | Manage agent credit lines | `agents.credit_limit` ✅ | `agent-credit.js` ✅ | ❌ No UI | 🔧 |
| 2.12 | Open/close settlement periods | `settlement_periods` ✅ | `settle-period.js` (open/close) ✅ | ❌ No UI | 🔧 |
| 2.13 | Pay commissions | `commission_records` ✅ | `settle-period.js` (pay/pay_all) ✅ | ❌ No UI | 🔧 |
| 2.14 | View all cashout requests | `cashout_requests` ✅ | ❌ No dedicated endpoint | ❌ No UI | ❌ |
| 2.15 | Approve/cancel any cashout | `cashout_requests` ✅ | `approve-cashout.js` ✅ | ❌ No UI | 🔧 |
| 2.16 | Create tables | `tables` ✅ | ❌ Direct Supabase in lobby.js | `lobby.js` create form ⚠️ | ⚠️ |
| 2.17 | Manage club announcements | `club_announcements` ✅ | ❌ No API route | ❌ No UI in admin | ❌ |
| 2.18 | Club marketplace / shop items | `club_shop_items` ✅ | ❌ No admin API | `marketplace.js` (buyer side only) ⚠️ | ⚠️ |
| 2.19 | View transaction history | `chip_transactions` ✅ | Read-only (client) ✅ | `cashier.js` shows own txns ✅ | ✅ (own only) |
| 2.20 | Suspend/reactivate agents | `agents.status` ✅ | `manage-agent.js` (suspend/reactivate) ✅ | ❌ No UI | 🔧 |
| 2.21 | Set commission rates per agent | `agents.commission_rate` ✅ | `manage-agent.js` (update) ✅ | ❌ No UI | 🔧 |

---

## 3. CLUB ADMIN

Same as owner except: cannot delete club, cannot change owner role, cannot remove other admins.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 3.1 | All owner features except delete/owner role | Same as above | Role checks in API ✅ | Same `admin.js` ✅ | Same as owner |
| 3.2 | Cannot promote to admin (owner only) | N/A | Enforced in `manage-agent.js` ✅ | Validated client-side ✅ | ✅ |

---

## 4. UNION ADMIN

Manages union-level operations delegated by union owner.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 4.1 | View union dashboard | `union_admins` ✅ | `union-dashboard.js` ✅ | ❌ No page | 🔧 |
| 4.2 | Mint chips across clubs | `union_admins.permissions` ✅ | `mint-chips.js` checks union_admins ✅ | ❌ No UI | 🔧 |
| 4.3 | Manage union settings | `unions` ✅ | ❌ No API | ❌ No UI | ❌ |

---

## 5. SUPER AGENT (parent_agent_id = NULL, has sub-agents)

Top-level agent who manages sub-agents and their downlines.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 5.1 | View agent dashboard | `agents`, `club_members` ✅ | `agent-dashboard.js` ✅ | ❌ No page exists | 🔧 |
| 5.2 | Distribute chips to own downline | `club_members.chip_balance` ✅ | `distribute-chips.js` ✅ | ❌ No agent-specific UI | 🔧 |
| 5.3 | View pending cashout requests | `cashout_requests` ✅ | `agent-dashboard.js` returns them ✅ | ❌ No UI | 🔧 |
| 5.4 | Approve/cancel cashouts from downline | `cashout_requests` ✅ | `approve-cashout.js` ✅ | ❌ No UI | 🔧 |
| 5.5 | Clawback within 10 minutes | `chip_transactions` ✅ | `clawback-chips.js` ✅ | ❌ No UI | 🔧 |
| 5.6 | View commission history | `commission_records`, `commission_history` ✅ | `agent-dashboard.js` returns them ✅ | ❌ No UI | 🔧 |
| 5.7 | Manage sub-agents | `agents.parent_agent_id` ✅ | ❌ No dedicated sub-agent management | ❌ No UI | ❌ |
| 5.8 | View sub-agent performance | `agents` ✅ | ❌ No aggregation endpoint | ❌ No UI | ❌ |
| 5.9 | Cascading commission from sub-agents | `commission_records` ✅ | `settle-period.js` (close) calculates ✅ | ❌ No UI to view | 🔧 |
| 5.10 | Agent credit management (prepaid/credit) | `agents.is_prepaid`, `credit_limit` ✅ | `agent-credit.js` ✅ | ❌ No UI | 🔧 |

---

## 6. AGENT (regular, under a super agent or standalone)

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 6.1 | View agent dashboard | `agents` ✅ | `agent-dashboard.js` ✅ | ❌ No page | 🔧 |
| 6.2 | Distribute chips to own players | `club_members` ✅ | `distribute-chips.js` ✅ | ❌ No agent-specific UI | 🔧 |
| 6.3 | Receive cashout requests (message + push) | `cashout_requests` ✅ | `request-cashout.js` sends ✅ | ❌ No approval UI | 🔧 |
| 6.4 | Approve/cancel cashout requests | `cashout_requests` ✅ | `approve-cashout.js` ✅ | ❌ No UI | 🔧 |
| 6.5 | Clawback chips (10 min window) | `chip_transactions` ✅ | `clawback-chips.js` ✅ | ❌ No UI | 🔧 |
| 6.6 | View own commission history | `commission_records` ✅ | `agent-dashboard.js` ✅ | ❌ No UI | 🔧 |
| 6.7 | View downline player activity | `club_members`, `chip_transactions` ✅ | `agent-dashboard.js` ✅ | ❌ No UI | 🔧 |
| 6.8 | Message players directly | `conversations`, `messages` ✅ | `messages.js` RPCs ✅ | `messages.js` ✅ | ✅ |

---

## 7. SUB-AGENT (has parent_agent_id set)

Same as agent, with commission flowing up to parent.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 7.1 | All agent features | Same as agent | Same | Same | Same |
| 7.2 | Commission split with parent | `agents.parent_agent_id` ✅ | `settle-period.js` handles splits ✅ | ❌ No UI | 🔧 |

---

## 8. PLAYER

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 8.1 | Join club by code | `club_members` ✅ | ❌ Direct Supabase in club-arena.js | `club-arena.js` modal ⚠️ | ⚠️ |
| 8.2 | Buy-in (diamonds → chips) | `profiles.diamonds`, `club_members.chip_balance` ✅ | `buyin.js` ✅ | `cashier.js` ✅ | ✅ |
| 8.3 | Request cashout (chips held in escrow) | `cashout_requests`, `club_members` ✅ | `request-cashout.js` ✅ | `cashier.js` ✅ | ✅ |
| 8.4 | View pending cashout status | `cashout_requests` ✅ | ❌ No player-facing endpoint | ❌ No status display | ❌ |
| 8.5 | View chip balance | `club_members.chip_balance` ✅ | Read-only (client) ✅ | `cashier.js` ✅ | ✅ |
| 8.6 | View transaction history | `chip_transactions` ✅ | Read-only (client) ✅ | `cashier.js` (last 20) ✅ | ✅ |
| 8.7 | Sit at table (lock chips) | `table_chip_locks` ✅ | `table-chips.js` (lock) ✅ | ❌ Not wired to LivePokerTable | 🔧 |
| 8.8 | Stand up (unlock chips) | `table_chip_locks` ✅ | `table-chips.js` (unlock) ✅ | ❌ Not wired to LivePokerTable | 🔧 |
| 8.9 | Rebuy at table | `table_chip_locks` ✅ | `table-chips.js` (rebuy) ✅ | ❌ Not wired | 🔧 |
| 8.10 | Play poker (engine) | `tables`, `table_seats` ✅ | Engine API routes ✅ | `table/[tableId].js` → LivePokerTable ✅ | ✅ (engine only, no chip bridge) |
| 8.11 | View hand history | `hand_history` ✅ | Read-only (client) ✅ | `hand-histories.js` ✅ | ✅ |
| 8.12 | View leaderboard | `club_arena_leaderboard` ✅ | Read-only (client) ✅ | `leaderboard.js` ✅ | ✅ |
| 8.13 | View personal stats | `club_arena_results` ✅ | Read-only (client) ✅ | `player-stats.js` ✅ | ✅ |
| 8.14 | View all club players | `club_members` ✅ | Read-only (client) ✅ | `players.js` ✅ | ✅ |
| 8.15 | Club marketplace (buy items) | `club_shop_items`, `club_shop_purchases` ✅ | ❌ Direct Supabase writes | `marketplace.js` ⚠️ | ⚠️ |
| 8.16 | Club messaging | `conversations`, `messages` ✅ | Messenger APIs ✅ | `messages.js` ✅ | ✅ |
| 8.17 | Receive cashout approval notification | N/A | `approve-cashout.js` sends message+push ✅ | Received in messenger ✅ | ✅ |
| 8.18 | View rakeback info | `rakeback_periods` ✅ | ❌ Not queried | ❌ No UI | 📋 |

---

## 9. POKER ENGINE INTEGRATION

The bridge between Club Arena's chip economy and the actual poker engine.

| # | Feature | DB | API | Frontend | Status |
|---|---------|-----|-----|----------|--------|
| 9.1 | Table connect (DB → engine) | `tables` ✅ | `club-connect.js` ✅ | `table/[tableId].js` calls it ✅ | ✅ |
| 9.2 | Chip locking on sit-down | `table_chip_locks` ✅ | `table-chips.js` (lock) ✅ | ❌ LivePokerTable doesn't call it | 🔧 |
| 9.3 | Chip unlocking on stand-up | `table_chip_locks` ✅ | `table-chips.js` (unlock) ✅ | ❌ LivePokerTable doesn't call it | 🔧 |
| 9.4 | Rake recording after each hand | `rake_records` ✅ | `record-rake.js` ✅ | ❌ Engine doesn't call it | 🔧 |
| 9.5 | Per-agent rake tracking | `agents.weekly_rake_generated` ✅ | `record-rake.js` does it ✅ | ❌ Engine doesn't call it | 🔧 |
| 9.6 | ClubLedger chip bridge | N/A | `ClubLedger.js` exists (556 lines) ✅ | ❌ Not integrated into GameController | 🔧 |
| 9.7 | Engine uses club chip balances (not fake stacks) | `club_members.chip_balance` ✅ | ❌ Engine uses in-memory stacks | ❌ Not bridged | ❌ |

---

## 10. UNUSED DATABASE TABLES

These tables exist in Supabase but nothing reads or writes to them:

| Table | Columns | Purpose | Why Unused |
|-------|---------|---------|------------|
| `chip_escrow` | 7 | Formal escrow tracking for cashouts | request-cashout uses club_members.chip_balance directly |
| `club_diamond_wallets` | 10 | Club-level diamond balance tracking | buyin.js uses profiles.diamonds directly |
| `club_financial_summary` | 12 | Periodic financial aggregates | No settlement UI populates this |
| `rakeback_periods` | 11 | Player rakeback tracking | No rakeback system implemented |
| `club_memberships` | 27 | Duplicate of club_members (identical schema) | Legacy table, should be dropped |
| `club_tables` | 13 | Separate from `tables` (110 cols) | Appears to be a simplified view, unused |
| `club_game_seats` | 9 | Seat reservations for live games | Only used by commander, not club arena |
| `club_live_games` | 13 | Live game tracking | Only used by commander/social pages |

---

## 11. REMAINING DIRECT SUPABASE WRITES (Security Gaps)

These frontend files still bypass the API layer:

| File | Operation | What It Does | Risk |
|------|-----------|-------------|------|
| `club-arena.js` | Create club | Inserts into `clubs` + `club_members` | No server validation |
| `club-arena.js` | Join club | Inserts into `club_members` | No server validation, no approval flow |
| `lobby.js` | Save description | Updates `clubs.description` | Minor (admin-only) |
| `lobby.js` | Create table | Inserts into `tables` | No server validation of settings |
| `admin.js` | Save settings | Updates `clubs.name/description` | Minor (admin-only) |
| `marketplace.js` | Purchase item | Updates `chip_balance`, inserts purchase + transaction | Non-atomic, no server validation |
| `messages.js` | Send message | Calls `fn_send_message` RPC | Acceptable (RPC has own auth) |
| `messages.js` | Create conversation | Calls `fn_get_or_create_conversation` RPC | Acceptable (RPC has own auth) |

---

## 12. CRITICAL MISSING FEATURES (Ordered by Impact)

### P0 — Showstoppers (Nothing works without these)

| # | Gap | What's Needed |
|---|-----|--------------|
| **P0-1** | **Engine ↔ Chip Bridge** | LivePokerTable sit_down must call `table-chips.js` (lock). stand_up must call unlock. Engine must deduct from locked chips, not fake stacks. Without this, poker games don't use real club chips. |
| **P0-2** | **Engine → Rake Recording** | After each hand, engine must call `record-rake.js` with pot size, rake amount, and player contributions. Without this, no rake tracking, no commissions, no settlement. |
| **P0-3** | **Agent Dashboard Page** | API exists (`agent-dashboard.js`) but zero frontend. Agents have no way to see their players, pending cashouts, commissions, or chip distribution controls. Need a full page at `/hub/club-arena/agent-dashboard`. |
| **P0-4** | **Cashout Approval UI** | `approve-cashout.js` API exists but agents have no UI to approve/cancel. Need cashout queue in agent dashboard with approve/cancel buttons. |

### P1 — Core Features (Platform is crippled without these)

| # | Gap | What's Needed |
|---|-----|--------------|
| **P1-1** | **Union Dashboard Page** | API exists (`union-dashboard.js`) but no frontend. Need `/hub/club-arena/union-dashboard`. |
| **P1-2** | **Settlement/Commission UI** | `settle-period.js` has open/close/pay but no frontend. Need settlement management in owner admin panel. |
| **P1-3** | **Create/Join Club via API** | `club-arena.js` does direct inserts. Need `create-club.js` and `join-club.js` API routes. |
| **P1-4** | **Create Table via API** | `lobby.js` does direct insert. Need `create-table.js` API route with settings validation. |
| **P1-5** | **Pending Cashout Display (Player)** | Players can request cashout but have no way to see pending/completed status. |
| **P1-6** | **Agent Chip Distribution UI** | Agents need their own chip distribution interface (separate from admin's). |
| **P1-7** | **Clawback UI (10-min timer)** | API exists but agents have no button to trigger clawback with countdown timer. |
| **P1-8** | **Mint Chips UI** | API exists but no UI for union owners or club owners to mint chips to treasury. |

### P2 — Important Features

| # | Gap | What's Needed |
|---|-----|--------------|
| **P2-1** | **Union Create/Manage** | No API or UI to create unions, add/remove clubs, manage union admins. |
| **P2-2** | **Agent Credit Management UI** | API exists but no UI for owners to issue credit lines or load prepaid agents. |
| **P2-3** | **Marketplace via API** | Direct Supabase writes for purchases. Need server-side atomic purchase endpoint. |
| **P2-4** | **Commission Rate Configuration UI** | API supports setting per-agent commission rates but no UI exists. |
| **P2-5** | **Sub-Agent Management** | No dedicated UI for super agents to view/manage their sub-agents. |
| **P2-6** | **Rakeback System** | Table exists (`rakeback_periods`) but nothing populates it. |
| **P2-7** | **Player Cashout History** | Players should see history of all their cashout requests + statuses. |
| **P2-8** | **Club Announcements** | Table exists (`club_announcements`) but no create/view UI in club arena. |
| **P2-9** | **Agent Suspend/Reactivate UI** | API supports it, no UI buttons in admin panel. |

---

## 13. SUMMARY SCORECARD

| Category | Total Features | ✅ Done | 🔧 Backend Only | ⚠️ Needs API | ❌ Not Built | 📋 DB Only |
|----------|---------------|---------|------------------|---------------|--------------|------------|
| Union Owner | 10 | 0 | 5 | 0 | 3 | 2 |
| Club Owner | 21 | 7 | 8 | 3 | 2 | 0 |
| Club Admin | 2 | 2 | 0 | 0 | 0 | 0 |
| Union Admin | 3 | 0 | 2 | 0 | 1 | 0 |
| Super Agent | 10 | 0 | 7 | 0 | 2 | 0 |
| Agent | 8 | 1 | 6 | 0 | 0 | 0 |
| Sub-Agent | 2 | 0 | 1 | 0 | 0 | 0 |
| Player | 18 | 10 | 3 | 2 | 1 | 1 |
| Engine Integration | 7 | 1 | 4 | 0 | 1 | 0 |
| **TOTAL** | **81** | **21 (26%)** | **36 (44%)** | **5 (6%)** | **10 (12%)** | **3 (4%)** |

### The Biggest Gap: 36 features have working backends but zero frontend.

The API layer is substantially built. The database schema is comprehensive. **The primary bottleneck is frontend pages and wiring.**

---

## 14. RECOMMENDED BUILD ORDER

### Sprint 1: Make Poker Actually Work With Real Chips
1. Wire LivePokerTable → `table-chips.js` (lock/unlock/rebuy)
2. Wire engine → `record-rake.js` after each hand
3. Integrate ClubLedger into GameController

### Sprint 2: Agent Dashboard (Unlocks Entire Agent Hierarchy)
4. Build `/hub/club-arena/agent-dashboard` page
5. Include: downline players, chip distribution, pending cashouts
6. Include: approve/cancel cashout buttons
7. Include: clawback button with 10-min countdown
8. Include: commission history view

### Sprint 3: Owner Admin Expansion
9. Add mint chips UI to admin panel
10. Add settlement period management (open/close/pay)
11. Add agent credit management UI
12. Add commission rate configuration
13. Add suspend/reactivate agent buttons

### Sprint 4: Create/Join/Table via API
14. Build `create-club.js` API route
15. Build `join-club.js` API route
16. Build `create-table.js` API route
17. Wire all three frontends

### Sprint 5: Union Dashboard
18. Build `/hub/club-arena/union-dashboard` page
19. Build union create/manage API routes
20. Build union admin management

### Sprint 6: Player Experience
21. Add pending cashout status display in cashier
22. Add cashout history
23. Wire marketplace to API route
24. Add club announcements view

---

## 15. FILE INVENTORY

### API Routes (15 files, ~2,870 lines)
```
pages/api/club-arena/
├── agent-credit.js        174 lines
├── agent-dashboard.js     175 lines
├── approve-cashout.js     238 lines
├── buyin.js               114 lines
├── clawback-chips.js      183 lines
├── delete-club.js          91 lines
├── distribute-chips.js    124 lines
├── manage-agent.js        468 lines
├── mint-chips.js           93 lines
├── record-rake.js         151 lines
├── request-cashout.js     203 lines
├── settle-period.js       378 lines
├── table-chips.js         128 lines
├── union-dashboard.js     139 lines
└── TOTAL               ~2,870 lines
```

### Frontend Pages (11 files, ~6,700 lines)
```
pages/hub/club-arena/
├── admin.js               709 lines  ← Wired to API ✅
├── cashier.js             518 lines  ← Wired to API ✅
├── hand-histories.js      531 lines  ← Read-only ✅
├── leaderboard.js         461 lines  ← Read-only ✅
├── lobby.js             1,189 lines  ← Create table still direct ⚠️
├── marketplace.js         472 lines  ← Direct writes ⚠️
├── messages.js          1,020 lines  ← RPC calls (acceptable)
├── player-stats.js        423 lines  ← Read-only ✅
├── players.js             490 lines  ← Read-only ✅
├── table/[tableId].js     160 lines  ← Engine bridge ✅
└── TOTAL               ~5,973 lines

pages/hub/club-arena.js   736 lines  ← Create/Join direct ⚠️
pages/hub/my-clubs.js     979 lines  ← Read-only ✅
```

### Missing Frontend Pages (Need to Build)
```
pages/hub/club-arena/
├── agent-dashboard.js     ← CRITICAL: Agent's command center
├── union-dashboard.js     ← Union owner's command center
└── (settlement UI can live inside admin.js as a new tab)
```

### Poker Engine (14 files, ~240K bytes)
```
src/lib/poker-engine/
├── ActionTimer.js        7,991 bytes
├── ActionValidator.js   14,329 bytes
├── BettingRound.js      14,574 bytes
├── Deck.js              10,464 bytes
├── GameController.js    29,114 bytes
├── GameStateMachine.js  27,385 bytes
├── HandEvaluator.js     17,145 bytes
├── HandHistory.js       14,987 bytes
├── LobbyManager.js      14,987 bytes
├── PotCalculator.js     12,264 bytes
├── RealtimeSync.js      16,344 bytes
├── TableManager.js      24,516 bytes
├── TournamentController.js 50,735 bytes
└── index.js              2,393 bytes

poker-engine/src/
└── ClubLedger.js        556 lines ← Not integrated
```
