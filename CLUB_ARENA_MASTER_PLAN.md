# CLUB ARENA — MASTER BUILD PLAN
## Complete Feature Map for Elite Poker Club Platform
## (PokerBros / ClubGG / Pokerrr2 / WPT Poker Grade)

**Created: Feb 28, 2026**
**Status: In Progress**

---

## ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                     │
│  12 pages + 1 table page + LivePokerTable component      │
├──────────────────────────────────────────────────────────┤
│                    API LAYER (23 routes)                  │
│  All writes go through server-side API with auth guards  │
├──────────────────────────────────────────────────────────┤
│              POKER ENGINE (15 files)                      │
│  ChipBridge connects engine to club chip economy         │
├──────────────────────────────────────────────────────────┤
│                 SUPABASE (Database)                       │
│  30+ tables, RLS policies, RPCs for messaging            │
└──────────────────────────────────────────────────────────┘
```

---

## FEATURE CHECKLIST — EVERY ITEM MUST BE ✅

### TIER 1: UNION OWNER (manages multiple clubs)

| # | Feature | API Route | Frontend Page | Status |
|---|---------|-----------|---------------|--------|
| U1 | Create union | manage-union.js (create) | union-dashboard.js | ✅ API, ✅ UI |
| U2 | View union dashboard (all clubs, totals, stats) | union-dashboard.js GET | union-dashboard.js Overview tab | ✅ |
| U3 | Add club to union | manage-union.js (add_club) | union-dashboard.js Manage Clubs tab | ✅ API, ✅ UI |
| U4 | Remove club from union | manage-union.js (remove_club) | union-dashboard.js Manage Clubs tab | ✅ API, ✅ UI |
| U5 | Add union admin | manage-union.js (add_admin) | union-dashboard.js Admins tab | ✅ API, ✅ UI |
| U6 | Remove union admin | manage-union.js (remove_admin) | union-dashboard.js Admins tab | ✅ API, ✅ UI |
| U7 | Edit union settings (name, desc, rake hold) | manage-union.js (update_settings) | union-dashboard.js Settings tab | ✅ API, ✅ UI |
| U8 | Mint chips to any union club | mint-chips.js | union-dashboard.js Mint tab | ✅ |
| U9 | View all agents across clubs | union-dashboard.js GET | union-dashboard.js Agents tab | ✅ |
| U10 | Run settlement across clubs | settle-period.js | union-dashboard.js Settlement tab | ✅ |

### TIER 2: CLUB OWNER (supreme authority in one club)

| # | Feature | API Route | Frontend Page | Status |
|---|---------|-----------|---------------|--------|
| C1 | Create club | create-club.js | club-arena.js | ✅ |
| C2 | Delete club (danger zone) | delete-club.js | admin.js | ✅ |
| C3 | Edit club settings (name, description) | save-settings.js | admin.js Settings modal | ✅ |
| C4 | View dashboard/reports (members, rake, revenue) | client-side reads | admin.js Reports modal | ✅ |
| C5 | Manage members (view, remove) | manage-agent.js (remove) | admin.js Members modal | ✅ |
| C6 | Change member roles (player↔agent↔admin) | manage-agent.js (change_role) | admin.js role dropdown | ✅ |
| C7 | Assign players to agents | manage-agent.js (reassign) | admin.js agent dropdown | ✅ |
| C8 | Distribute chips to any member | distribute-chips.js | admin.js Chips modal | ✅ |
| C9 | Mint chips to treasury | mint-chips.js | admin.js Mint Chips modal | ✅ |
| C10 | Manage agent credit lines | agent-credit.js | admin.js Agent Management modal | ✅ |
| C11 | Set commission rates per agent | manage-agent.js (update) | admin.js Agent Management modal | ✅ |
| C12 | Suspend/reactivate agents | manage-agent.js (suspend/reactivate) | admin.js Agent Management modal | ✅ |
| C13 | Open/close settlement periods | settle-period.js (open/close) | admin.js Settlement modal | ✅ |
| C14 | Pay commissions (individual/all) | settle-period.js (pay/pay_all) | admin.js Settlement modal | ✅ |
| C15 | View/approve cashout requests | approve-cashout.js | agent-dashboard.js | ✅ |
| C16 | Create tables | create-table.js | lobby.js | ✅ |
| C17 | Manage club announcements (CRUD) | announcements.js | admin.js Announcements modal + lobby.js display | ✅ API, ✅ UI |
| C18 | Manage marketplace items (CRUD) | manage-shop.js | admin.js Shop Management modal | ✅ API, ✅ UI |
| C19 | View transaction history (all members) | cashout-history.js | cashier.js | ✅ |
| C20 | Set parent-agent for sub-agents | manage-agent.js (set_parent_agent) | admin.js Agent Management modal | ✅ API, ⚠️ UI (needs button) |

### TIER 3: CLUB ADMIN (same as owner minus delete/owner-role changes)

| # | Feature | Status |
|---|---------|--------|
| A1 | All owner features except C2, C6 (to owner/admin role) | ✅ Enforced in manage-agent.js |
| A2 | Cannot promote to admin (owner-only) | ✅ Enforced |

### TIER 4: SUPER AGENT (parent_agent_id = NULL, has sub-agents)

| # | Feature | API Route | Frontend Page | Status |
|---|---------|-----------|---------------|--------|
| SA1 | View agent dashboard (stats, players, cashouts) | agent-dashboard.js GET | agent-dashboard.js | ✅ |
| SA2 | Distribute chips to downline players | distribute-chips.js | agent-dashboard.js | ✅ |
| SA3 | View pending cashout requests | agent-dashboard.js GET | agent-dashboard.js Cashouts tab | ✅ |
| SA4 | Approve/cancel cashout requests | approve-cashout.js | agent-dashboard.js | ✅ |
| SA5 | Clawback chips (10-min window) | clawback-chips.js | agent-dashboard.js | ✅ |
| SA6 | View commission history | agent-dashboard.js GET | agent-dashboard.js Commissions tab | ✅ |
| SA7 | View sub-agent list + performance | manage-agent.js (list_sub_agents) | agent-dashboard.js Sub-Agents tab | ✅ API, ⚠️ UI (incomplete) |
| SA8 | Cascading commission from sub-agents | settle-period.js | N/A (automatic) | ✅ |

### TIER 5: AGENT (regular agent)

| # | Feature | Status |
|---|---------|--------|
| AG1 | Same as SA1-SA6 | ✅ All wired |
| AG2 | Message players directly | ✅ messages.js |
| AG3 | View downline player activity | ✅ agent-dashboard.js |

### TIER 6: SUB-AGENT

| # | Feature | Status |
|---|---------|--------|
| SU1 | Same as agent | ✅ |
| SU2 | Commission splits with parent (automatic) | ✅ settle-period.js |

### TIER 7: PLAYER

| # | Feature | API Route | Frontend Page | Status |
|---|---------|-----------|---------------|--------|
| P1 | Join club by code | join-club.js | club-arena.js | ✅ |
| P2 | Buy chips (diamonds → club chips) | buyin.js | cashier.js | ✅ |
| P3 | Request cashout (chips held in escrow) | request-cashout.js | cashier.js | ✅ |
| P4 | View pending cashout status | client-side query | cashier.js | ✅ |
| P5 | View full cashout history | cashout-history.js GET | cashier.js | ✅ API, ⚠️ UI (needs wiring) |
| P6 | View chip balance | client-side query | cashier.js | ✅ |
| P7 | View transaction history | client-side query | cashier.js | ✅ |
| P8 | Sit at table (locks chips) | ChipBridge → seat.js | LivePokerTable | ✅ |
| P9 | Stand up (unlocks chips) | ChipBridge → seat.js | LivePokerTable | ✅ |
| P10 | Rebuy at table | ChipBridge → seat.js | LivePokerTable | ✅ |
| P11 | Play poker (full engine) | engine routes | LivePokerTable | ✅ |
| P12 | View hand history | client-side query | hand-histories.js | ✅ |
| P13 | View leaderboard | client-side query | leaderboard.js | ✅ |
| P14 | View personal stats | client-side query | player-stats.js | ✅ |
| P15 | View club player list | client-side query | players.js | ✅ |
| P16 | Buy marketplace items | marketplace-purchase.js | marketplace.js | ✅ |
| P17 | Club messaging | RPCs | messages.js | ✅ |
| P18 | View club announcements | announcements.js GET | lobby.js | ✅ API, ⚠️ UI (needs wiring) |

### TIER 8: POKER ENGINE INTEGRATION

| # | Feature | Implementation | Status |
|---|---------|---------------|--------|
| E1 | Table connect (DB → engine) | club-connect.js | ✅ |
| E2 | Chip locking on sit-down | ChipBridge.lockChips via seat.js | ✅ |
| E3 | Chip unlocking on stand-up | ChipBridge.unlockChips via seat.js | ✅ |
| E4 | Auto-unlock on disconnect/bust | LobbyManager player_left | ✅ |
| E5 | Rake recording after hand | ChipBridge.recordRake via LobbyManager | ✅ |
| E6 | Per-agent rake tracking | record-rake.js (weekly_rake_generated) | ✅ |
| E7 | Balance-aware buy-in dialog | LivePokerTable BuyInDialog | ✅ |

---

## REMAINING WORK ITEMS

### MUST FIX (Code is written but incomplete/broken)

1. **agent-dashboard.js Sub-Agents tab** — Tab added to list but content panel never rendered. Need to complete the sub-agents tab with list_sub_agents API call and display.

2. **cashier.js cashout history** — cashout-history.js API exists but cashier.js doesn't call it. Need to wire full history (not just pending).

3. **lobby.js announcements** — announcements.js API exists and lobby.js has state vars, but apiGet may fail silently if table doesn't exist. Need graceful handling.

4. **admin.js announcements/shop modals** — Code added but need to verify formLabel, formInput, formTextarea style objects exist.

5. **union-dashboard.js new tabs** — Manage Clubs, Admins, Settings tabs added but need to verify they render correctly.

### NEEDS BUILDING (Not started)

6. **Rakeback system** — DB table `rakeback_periods` exists but nothing populates it. Need API + UI. (P2 priority — can defer to post-launch)

7. **ClubLedger integration** — 556-line ClubLedger.js exists in poker-engine/src/ but is NOT integrated into GameController. ChipBridge replaces its functionality, so this is OPTIONAL.

### VERIFY/HARDEN

8. All 23 API routes have proper auth guards ✅ (verified)
9. Zero direct Supabase writes from frontend ✅ (verified)  
10. All modal close handlers work
11. All toast notifications fire
12. Error states handled (empty data, network failures, auth expiry)
13. Back navigation works (no router.back())

---

## FILE COUNTS

| Category | Files | Total Lines |
|----------|-------|-------------|
| API Routes | 23 | ~3,900 |
| Frontend Pages | 12 + club-arena.js | ~8,400 |
| Engine Files | 15 + ChipBridge | ~650 |
| Components | 5 (LivePokerTable etc) | ~3,400 |
| **TOTAL** | **56** | **~16,350** |
