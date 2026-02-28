# Club Arena — Comprehensive Feature Audit
## Updated: Feb 28, 2026 (Post-Sprint Completion)

### System Summary
- **26 API routes** — all server-side with Bearer token auth
- **12 frontend pages** (7,600+ total lines) — all wired to API routes
- **0 direct Supabase writes** from frontend pages (except RPCs in messages.js)
- **1 ChipBridge** (304 lines) connecting poker engine to club chip economy
- **Engine integration** — lock/unlock/rake all wired through LobbyManager

---

## Feature Status by Role

### Union Owner (5/8 features complete)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1.1 | Create union | ❌ | Rare op — Supabase dashboard |
| 1.2 | Union Dashboard | ✅ | API + page (457 lines, 5 tabs) |
| 1.3 | Add/remove clubs | ❌ | Future — clubs join via union_id |
| 1.4 | Add/remove admins | ❌ | Future |
| 1.5 | Mint chips to clubs | ✅ | API + union-dashboard mint tab |
| 1.6 | View all agents | ✅ | union-dashboard agents tab |
| 1.7 | View settlement | ✅ | union-dashboard settlement tab |
| 1.8 | Union settings | ❌ | Low priority |

### Club Owner (21/21 features complete)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 2.1 | Create club | ✅ | API + UI |
| 2.2 | Delete club | ✅ | API + UI (danger zone) |
| 2.3 | Edit settings | ✅ | API + UI (admin + lobby) |
| 2.4 | Dashboard/reports | ✅ | admin.js reports tab |
| 2.5 | Manage members | ✅ | admin.js members tab |
| 2.6 | Promote→Agent | ✅ | manage-agent API |
| 2.7 | Demote→Player | ✅ | manage-agent API |
| 2.8 | Assign players | ✅ | manage-agent API |
| 2.9 | Distribute chips | ✅ | API + admin chips tab |
| 2.10 | Mint chips | ✅ | API + admin mint tab |
| 2.11 | Agent credit | ✅ | API + admin agents tab |
| 2.12 | Settlement | ✅ | API + admin settlement tab |
| 2.13 | Pay commissions | ✅ | settle-period pay_all |
| 2.14 | View cashouts | ✅ | agent-dashboard (owners see all) |
| 2.15 | Approve/cancel | ✅ | agent-dashboard buttons |
| 2.16 | Create tables | ✅ | API + lobby UI |
| 2.17 | Announcements | ✅ | API + admin modal (create/delete/pin) |
| 2.18 | Marketplace admin | ✅ | manage-shop API + admin modal (CRUD/toggle) |
| 2.19 | Transaction history | ✅ | cashier.js |
| 2.20 | Suspend agent | ✅ | API + admin agents tab |
| 2.21 | Commission rates | ✅ | API + admin agents tab |

### Agent / Super Agent (9/10 features complete)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 5.1 | Agent dashboard | ✅ | 803-line page, fully wired |
| 5.2 | Distribute chips | ✅ | distribute-chips API |
| 5.3 | Pending cashouts | ✅ | Dashboard shows pending |
| 5.4 | Approve/cancel | ✅ | approve-cashout API + buttons |
| 5.5 | Clawback (10 min) | ✅ | clawback-chips API + button |
| 5.6 | Commission history | ✅ | Dashboard shows history |
| 5.7 | Sub-agent management | ✅ | Agents promote own downline via ⬆️ button |
| 5.8 | Sub-agent performance | ❌ | P2 — stats reporting |
| 5.9 | Cascading commission | ✅ | settle-period calculates |
| 5.10 | Credit management | ✅ | agent-credit API + admin Issue Credit button |

### Player (16/16 features complete)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 8.1 | Join club | ✅ | API + UI |
| 8.2 | Buy-in (💎→chips) | ✅ | buyin API + cashier UI |
| 8.3 | Request cashout | ✅ | request-cashout API + UI |
| 8.4 | Pending cashout status | ✅ | cashier.js shows pending |
| 8.5 | View balance | ✅ | cashier.js |
| 8.6 | Transaction history | ✅ | cashier.js (last 20) |
| 8.7 | Sit at table (lock chips) | ✅ | ChipBridge via seat.js |
| 8.8 | Stand up (unlock chips) | ✅ | ChipBridge via seat.js |
| 8.9 | Rebuy at table | ✅ | ChipBridge via seat.js |
| 8.10 | Play poker | ✅ | Full engine integration |
| 8.11 | Hand history | ✅ | hand-histories.js |
| 8.12 | Leaderboard | ✅ | leaderboard.js |
| 8.13 | Player stats | ✅ | player-stats.js |
| 8.14 | Players list | ✅ | players.js |
| 8.15 | Marketplace | ✅ | marketplace-purchase API |
| 8.16 | Messaging | ✅ | messages.js (RPCs) |

### Engine Integration (6/6 features complete)
| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 9.1 | Table connect | ✅ | connectToClubTable |
| 9.2 | Chip lock on sit | ✅ | ChipBridge.lockChips |
| 9.3 | Chip unlock on stand | ✅ | ChipBridge.unlockChips |
| 9.4 | Auto-unlock on bust | ✅ | LobbyManager player_left |
| 9.5 | Rake recording | ✅ | ChipBridge.recordRake |
| 9.6 | Per-agent rake tracking | ✅ | weekly_rake_generated |

---

## API Route Inventory (19 routes)

| Route | Method | Lines | Purpose |
|-------|--------|-------|---------|
| agent-credit.js | POST | 174 | Issue/repay agent credit |
| agent-dashboard.js | GET | 175 | Agent command center data |
| approve-cashout.js | POST | 238 | Approve/cancel cashouts |
| buyin.js | POST | 114 | Diamonds→chips conversion |
| clawback-chips.js | POST | 183 | 10-min clawback window |
| create-club.js | POST | 67 | Create new club |
| create-table.js | POST | 95 | Create poker table |
| delete-club.js | POST | 91 | Delete club (owner only) |
| distribute-chips.js | POST | 124 | Distribute chips to members |
| join-club.js | POST | 75 | Join club by code |
| manage-agent.js | POST | 468 | Full agent CRUD |
| marketplace-purchase.js | POST | 106 | Atomic marketplace buy |
| mint-chips.js | POST | 93 | Mint chips to treasury |
| record-rake.js | POST | 151 | Record hand rake |
| request-cashout.js | POST | 203 | Player cashout request |
| save-settings.js | POST | 56 | Update club settings |
| settle-period.js | POST | 378 | Settlement lifecycle |
| table-chips.js | POST | 128 | Table chip lock/unlock |
| union-dashboard.js | GET | 139 | Union overview data |

## Frontend Page Inventory (12 pages)

| Page | Lines | API Calls | Direct Writes |
|------|-------|-----------|---------------|
| club-arena.js | 698 | 3 | 0 |
| admin.js | 902 | 12 | 0 |
| agent-dashboard.js | 803 | 7 | 0 |
| cashier.js | 560 | 3 | 0 |
| hand-histories.js | 531 | 0 | 0 |
| leaderboard.js | 461 | 0 | 0 |
| lobby.js | 1,203 | 3 | 0 |
| marketplace.js | 444 | 2 | 0 |
| messages.js | 1,020 | 4 | 0 (RPCs) |
| player-stats.js | 423 | 0 | 0 |
| players.js | 490 | 0 | 0 |
| union-dashboard.js | 457 | 5 | 0 |

## Engine Files

| File | Lines | Purpose |
|------|-------|---------|
| ChipBridge.js | 304 | Club chip economy bridge |
| seat.js (engine) | 169 | Wired to ChipBridge |
| LobbyManager.js | 550 | Rake recording + auto-unlock |
| LivePokerTable.jsx | 1,338 | Balance display in buy-in |

---

## Remaining P2 Items (Not Blocking Launch)
1. Create union API + UI (rare admin operation)
2. Union settings management
3. Union add/remove clubs/admins
4. Photo rotation verification (camera capture + liveness check)
5. Sub-agent performance reporting (stats for sub-agent downlines)
