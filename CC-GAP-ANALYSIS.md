# Club Commander — Deep Dive Gap Analysis
## TC Parity Check + Dashboard Icon Wiring Audit
### February 12, 2026

---

## System Totals

| Component | Count |
|-----------|-------|
| Staff Dashboard Pages | 92 |
| Player Hub Pages | 34 |
| Commander APIs | 196 |
| Migrations | 21 |
| Shared Components (.jsx) | 49 |
| Dashboard Icon Tiles | 41 |

---

## Part 1: TC Feature Parity — Module by Module

### WAITLIST MODULE (TC: 4 blue tiles)

| TC Tile | CC Equivalent | Status | Notes |
|---------|--------------|--------|-------|
| **Desk View** | `/commander/waitlist/desk` (322L) | ✅ FULLY WIRED | Table grid + seat rings + active waitlists + call/seat. APIs: tables, waitlist |
| **Player View** | `/commander/displays/waitlist` (228L) + `/hub/commander/waitlist/[venueId]` (512L) | ✅ FULLY WIRED | TV display + player app view. CC has BOTH display and app versions (TC only had display) |
| **Player Maintenance** | `/commander/members` (293L) | ✅ WIRED | Search/view/edit. Imports AddMemberModal, ScanMemberModal, MemberDetailPanel (all exist). 1 fetch (search) but modals handle CRUD |
| **Player Kiosk** | `/commander/kiosk` (427L) | ✅ FULLY WIRED | Phone lookup, waitlist signup, check-in, register new. APIs: members/checkin, waitlist, members |

**CC EXTRAS beyond TC:** Seat preferences in waitlist join, QR check-in, digital player card, AI wait time predictions, squad mode

---

### MANAGEMENT MODULE (TC: 2 red tiles)

| TC Tile | CC Equivalent | Status | Notes |
|---------|--------------|--------|-------|
| **Employee Maintenance** | `/commander/staff` (401L) | ✅ FULLY WIRED | 4 fetches, 10 response handlers. Add/update/delete staff, PIN management, role assignment. API: staff |
| **Poker Room Functions** | Spread across: `/commander/tables` (376L), `/commander/open-game` (290L), `/commander/settings` (364L), `/commander/displays` (469L) | ✅ COVERED | CC breaks TC's monolithic "Poker Room Functions" into dedicated pages. More granular = better UX |

**CC EXTRAS beyond TC:** Dealer management (718L), dealer rotations, time billing, floor calls, cashier, must-move games, shift handoff, streaming integration — TC had NONE of these as separate features

---

### TOURNAMENT MODULE (TC: 6 gold tiles)

| TC Tile | CC Equivalent | Status | Notes |
|---------|--------------|--------|-------|
| **Tournament Registration** | `/commander/td/[id]/register` (334L) + tournament index creation flow | ✅ FULLY WIRED | Dedicated registration page. APIs: register, entries, entries/addon, entries/rebuy |
| **Tournament Controls** | `/commander/td/[id]/index` (549L) + `/commander/tournaments/[id]` (471L) | ✅ FULLY WIRED | Full TD tablet with play/pause/stop + clock + eliminations + table balance. APIs: clock, eliminate, balance-suggest, balance-execute, hand-for-hand, final-table |
| **Tournament Clock** | `/commander/td/[id]/clock` (372L) + `/hub/commander/tournament/[id]/clock` (public) + `/commander/tournaments/[id]/clock-display` | ✅ FULLY WIRED | THREE clock implementations: staff, public, display. CC has mobile-accessible public clock (TC didn't) |
| **Tournament Maintenance** | `/commander/tournaments/index` (383L) + `/commander/tournaments/[id]/settings` (680L) | ✅ FULLY WIRED | Create + list + full settings editor. APIs: tournaments CRUD |
| **Tournament Setups** | `/commander/tournaments/[id]/structure-display` (146L) + BlindStructureEditor component + PayoutStructureEditor component | ✅ WIRED | Blind structure display + editing via components. Has both editor and display modes |
| **Tournament Clock Setup** | `/commander/tournaments/[id]/settings` (680L) handles clock config | ✅ WIRED | Integrated into settings page rather than separate tile |

**Dashboard routing note:** TD Tablet and Tournament Clock tiles on the dashboard both route to `/commander/tournaments` (the list). This is correct web UX — you pick a tournament first, then access TD/Clock from the detail view. TC needed separate tiles because it had no sub-navigation.

**CC Tournament Extras:** Break manager, seating display, auto-break, move player, message players, chip counts, public spectator pages

---

### REPORTS MODULE (TC: 5 silver tiles)

| TC Tile | CC Equivalent | Status | Notes |
|---------|--------------|--------|-------|
| **Wait List Reports** | `/commander/reports/waitlist-metrics` (156L) | ✅ WIRED | Wait time metrics, queue depths. API connected |
| **Player Reports** | `/commander/reports/player-activity` (89L) | ⚠️ THIN | Fetches member data sorted by visits. Functional but lightweight — 89 lines, 1 API call. Could use expansion with session details, spend tracking |
| **Tournament Reports** | `/commander/reports/tournament-results` (128L) | ✅ WIRED | Completed tournaments with results. API: tournaments?status=completed |
| **Custom Reports** | No direct equivalent | ❌ MISSING | TC has a custom report builder with filters/date ranges. CC has Reports Hub (420L) with date selectors and multiple sub-reports, but no drag-and-drop custom builder |
| **Activity List** | `/commander/activity` (218L) + `/commander/reports/staff-activity` (87L) | ✅ WIRED | System activity log with incidents, member visits, sessions. Both pages connected to APIs |

**CC Report Extras beyond TC:** Daily summary, revenue report, analytics dashboard (425L), analytics daily (267L), table utilization (156L), tax/W-2G compliance (363L), churn prediction (AI)

---

### MAINTENANCE MODULE (TC: 4 gray tiles)

| TC Tile | CC Equivalent | Status | Notes |
|---------|--------------|--------|-------|
| **Configuration** | `/commander/settings` (364L) | ⚠️ PARTIAL | Has waitlist config (SMS, push, call timeout, max size, wait estimate, auto-refresh) and display settings. But MISSING game type configuration, rake settings, and buy-in limits — TC's Configuration has these |
| **Setups** | No direct equivalent | ❌ MISSING | TC has saveable room presets (e.g., "Friday Night Config" = 8 NLH tables + 2 PLO + tournament). CC has no preset/template system for room configurations |
| **Activity List** | `/commander/activity` (218L) | ✅ WIRED | Covered above in Reports section |
| **System Information** | No direct equivalent | ❌ MISSING | TC has version info, diagnostics, remote support link. CC has no system diagnostics page |

---

## Part 2: Dashboard Icon Wiring Audit

### All 41 Dashboard Tiles — Verified

Every single dashboard icon maps to a real, functional page with API connections:

| Section | Tiles | All Working? |
|---------|-------|-------------|
| Waitlist (4 tiles) | Desk View, Player Waitlist, Player Maintenance, Player Kiosk | ✅ All 4 wired |
| Tournaments (4 tiles) | Tournament List, TD Tablet, Tournament Clock, Tournament Reports | ✅ All 4 wired (3 share entry point) |
| Tables & Dealers (10 tiles) | Table Mgmt, Assignments, Floor Map, Open Game, Must-Move, Cashier, Dealers, Time Billing, Floor Calls, Table Vibes | ✅ All 10 wired |
| Management (11 tiles) | Staff, Schedule, TV Displays, Promotions, Comps, Incidents, Announcements, Shift Handoff, Game Start AI, Leagues, Reputation | ✅ All 11 wired |
| Reports & Settings (12 tiles) | Reports Hub, Daily Summary, Revenue, Activity, Analytics, Churn, Close Day, Member Import, Settings, Staff Activity, Analytics Daily, Tax/W-2G | ✅ All 12 wired |

### Icon Image Files

| Status | Count | Details |
|--------|-------|---------|
| ✅ Icons exist and used | 16 | All core icons present |
| ❌ Missing icon file | 1 | `mg-time-billing.png` — referenced by Cashier tile but file doesn't exist |
| ⚠️ Unused icon files | 7 | Icons exist in `/public/images/commander/icons/` but aren't on dashboard |

**Unused icons (intended tiles never created):**
- `rp-configuration.png` → For a Configuration tile
- `rp-setups.png` → For a Setups tile
- `rp-system.png` → For a System Information tile
- `rp-players.png` → Alternate player reports icon
- `rp-tournaments.png` → Alternate tournament reports icon
- `tn-clock-setup.png` → For Tournament Clock Setup tile
- `tn-settings.png` → For Tournament Settings tile

---

## Part 3: Gaps to Close — Priority Ranked

### 🔴 HIGH PRIORITY (Core TC parity gaps)

1. **Settings Page — Game Type Configuration**
   - Current settings only has waitlist/display config
   - NEEDS: Game type CRUD (NLH, PLO, Limit, etc.), stakes config, buy-in min/max, rake percentages, table configs
   - This is TC's "Configuration" tile — fundamental to room operations

2. **Missing Icon File**
   - `mg-time-billing.png` doesn't exist — Cashier tile shows broken image
   - Quick fix: copy existing icon or create new one

### 🟡 MEDIUM PRIORITY (TC features CC doesn't match)

3. **Room Setups / Presets**
   - TC lets managers save room configurations as templates ("Friday Night Setup", "Tournament Day", etc.)
   - Needed: Preset system that can apply saved table/game configurations with one click
   - Page + API needed

4. **Player Reports Expansion**
   - Current `player-activity.js` is 89 lines, just showing visit counts
   - NEEDS: Session duration trends, spending patterns, game preference breakdown, visit frequency charts
   - TC has deep player analytics

5. **Custom Reports Builder**
   - TC has a custom report tool with date ranges, metric selection, export
   - CC has good individual reports but no "build your own" capability
   - Could add report builder or expand existing Reports Hub with customizable widgets

6. **System Information Page**
   - TC has version, diagnostics, support access
   - CC needs: App version, API health check, Supabase connection status, environment info, support link
   - Simple page, low effort

### 🟢 LOW PRIORITY (Polish items)

7. **Tournament Dashboard Routing**
   - "TD Tablet" and "Tournament Clock" tiles both go to /commander/tournaments (the list)
   - Works correctly (pick tournament → access TD/Clock) but could add a "recent tournament" quick-launch

8. **Announcements History**
   - Current announcements page sends messages (1 API call) but doesn't show history of past announcements
   - Add: sent history feed, delivery stats

9. **Use Remaining Icon Files**
   - 7 icon files exist but aren't mapped to dashboard tiles
   - These were designed for the gaps identified above

---

## Part 4: CC Features That EXCEED TC

Club Commander has significant functionality TC doesn't offer:

| Feature | CC | TC |
|---------|----|----|
| AI Wait Time Predictions | ✅ | ❌ |
| AI Game Start Intelligence | ✅ | ❌ |
| AI Churn Prediction | ✅ | ❌ |
| AI Table Balance Suggestions | ✅ | ❌ |
| Digital Player Card + QR | ✅ | ❌ |
| Seat Preferences | ✅ | ❌ |
| Table Atmosphere Ratings | ✅ | ❌ |
| Squad Mode (group seating) | ✅ | ❌ |
| In-Seat Services (food/drinks) | ✅ | ❌ |
| Dealer Rotation Management | ✅ | ❌ |
| Time Billing (seat-time tracking) | ✅ | ❌ |
| Floor Call System | ✅ | ❌ |
| Cashier Operations | ✅ | ❌ |
| Must-Move Game Management | ✅ | ❌ |
| Shift Handoff System | ✅ | ❌ |
| Incident Reporting | ✅ | ❌ |
| Tax / W-2G Compliance | ✅ | ❌ |
| Comp System | ✅ | ❌ |
| Streaming Integration | ✅ | ❌ |
| Home Game Management | ✅ | ❌ |
| Dealer Marketplace | ✅ | ❌ |
| Equipment Rental | ✅ | ❌ |
| Player Reputation System | ✅ | ❌ |
| League Management | ✅ | ❌ |
| Responsible Gaming Tools | ✅ | ❌ |
| Escrow for Buy-ins | ✅ | ❌ |
| Hand History Review | ✅ | ❌ |
| Cross-Venue Leaderboards | ✅ | ❌ |
| Multi-Channel Notifications (SMS + Push + In-App) | ✅ | SMS only |
| Realtime WebSocket Updates | ✅ | Polling only |
| 8 TV Display Types | ✅ | Basic displays |

**Bottom line:** CC has 30+ features TC doesn't. The 6 gaps identified are all minor compared to CC's massive feature advantage. The priority is ensuring the core TC parity items (game type config, presets, player reports depth) are solid so clubs making the switch don't miss any existing workflow.
