# TC vs Club Commander — Feature Parity Report
## Generated: Feb 12, 2026

Every TC (PokerAtlas) feature verified against Club Commander codebase.

---

## ✅ FULLY MATCHED FEATURES

### Cash Game Waitlist Management
| TC Feature | CC Status | Location |
|---|---|---|
| Real-time waitlist with player names | ✅ | waitlist/desk.js — names + position numbers |
| Multiple game type support (NLH, PLO, Limit, Stud, Mixed) | ✅ | game-types.js — 7 types defined |
| Online/remote waitlist registration | ✅ | kiosk.js — player self-registration |
| Check-in window / call timeout | ✅ | admin/index.js — configurable call_timeout_minutes |
| SMS "Seat Available" alerts | ✅ | waitlist/call.js → twilio.js — auto-SMS on call |
| Player count per waitlist displayed | ✅ | desk.js — entries.length per game |
| Games currently running displayed | ✅ | desk.js — activeTables with status |
| Table counts and seat availability | ✅ | desk.js — seatedCount/maxSeats per table |
| Call player from waitlist | ✅ | desk.js handleCall → /api/commander/waitlist/call |
| Seat player to specific table+seat | ✅ | desk.js handleSeat → /api/commander/waitlist/seat |
| Wait time display | ✅ | desk.js shows entry.wait_time |

### Tournament Management
| TC Feature | CC Status | Location |
|---|---|---|
| Player registration tracking | ✅ | td/[id]/register.js — registration desk |
| Buy-in processing | ✅ | td/[id]/register.js + TournamentManager |
| Add-on and rebuy management | ✅ | td/[id]/players.js — rebuy/addon actions |
| Random table/seat assignments | ✅ | td/[id]/register.js — auto-seat assignment |
| Prize pool calculations | ✅ | PayoutStructureEditor.jsx — buyIn × entries |
| Live tournament clock | ✅ | td/[id]/clock.js — fullscreen display for TV/HDMI |
| Remote clock viewing (public) | ✅ | tournaments/[id]/clock-display.js + hub/commander/tournament/[id]/clock.js — NO auth required |
| Blind structure display (levels, breaks, time remaining) | ✅ | BlindStructureEditor.jsx + TournamentClock.jsx |
| Color-up schedules | ✅ | Blind structure includes chip denomination levels |
| Payout structure display | ✅ | PayoutStructureEditor.jsx (304L) + PayoutModal.jsx (336L) |
| Winner tracking | ✅ | EliminatePlayerModal.jsx — tracks eliminations + positions |
| Leaderboard standings | ✅ | displays/leaderboard.js + LeaderboardDisplay.jsx |
| Real-time chip counts | ✅ | TournamentClock shows avg stack, TournamentEntryList sorts by chips |
| Table assignments during play | ✅ | TournamentEntryList shows table_number + seat_number |
| Table balancing | ✅ | td/[id]/balance.js — auto-suggest algorithm |
| Hendon Mob export | ✅ | exports.js — one-click export |

### Player Tracking & Profiles
| TC Feature | CC Status | Location |
|---|---|---|
| Check-in history / visit count | ✅ | members/[id].js — total_visits, last_visit |
| Session tracking (hours played) | ✅ | members/[id].js — total_hours_played |
| Leaderboard standings | ✅ | LeaderboardDisplay.jsx — multiple sort types |
| Comp rewards / loyalty | ✅ | comps.js — earn/issue/redeem comps |
| Player profiles / member management | ✅ | members.js + AddMemberModal + MemberDetailPanel |
| Member card / barcode | ✅ | members.js — card generation + scan |

### Business Analytics
| TC Feature | CC Status | Location |
|---|---|---|
| Game analytics | ✅ | reports/analytics-daily.js |
| Player statistics | ✅ | reports/player-activity.js |
| Tournament performance data | ✅ | reports/tournament-results.js |
| Waitlist metrics | ✅ | reports/waitlist-metrics.js |
| Table utilization rates | ✅ | reports/table-utilization.js |
| Revenue reporting | ✅ | reports/revenue.js |
| Staff activity | ✅ | reports/staff-activity.js |
| Daily summary | ✅ | reports/daily-summary.js |

### Promotions Management
| TC Feature | CC Status | Location |
|---|---|---|
| Promotion scheduling and display | ✅ | promotions.js (886L) — CRUD + toggle active |
| High hand bonus tracking | ✅ | high-hands.js (291L) — record + verify |
| Bad beat jackpot information | ✅ | promotions.js — bad_beat type |
| Special event announcements | ✅ | displays/announcements.js |
| Promotions public display | ✅ | displays/promotions.js |

### Staff Interface
| TC Feature | CC Status | Location |
|---|---|---|
| Role-based access (owner/manager/floor/brush/dealer) | ✅ | auth.js — 5 roles + DEFAULT_PERMISSIONS |
| Edit employee role/PIN | ✅ | staff.js — PATCH via StaffModal |
| Delete/deactivate employee | ✅ | staff.js — DELETE button + API |
| PIN code terminal auth | ✅ | auth.js verifyPin + verifyStaffSession |
| Role-based permissions | ✅ | auth.js getEffectivePermissions |
| Dealer rotation | ✅ | dealers.js — rotation management |
| Shift handoff | ✅ | shift-handoff.js — context passing |

### Table Management
| TC Feature | CC Status | Location |
|---|---|---|
| Add/configure tables | ✅ | tables.js — POST with modal |
| Remove tables | ✅ | tables.js — DELETE |
| Table status tracking | ✅ | tables.js — available/in_use/maintenance |
| Dealer assignment | ✅ | dealers.js — current_table tracking |
| Must-move table management | ✅ | must-move.js (280L) + API endpoints |
| Open new cash game | ✅ | open-game.js (290L) — select type+stakes+table |
| Room open/close toggle | ✅ | poker-room.js — toggleRoom |

### Display Screens
| TC Feature | CC Status | Location |
|---|---|---|
| Waitlist display (player-facing) | ✅ | displays/waitlist.js (228L) |
| Tables display | ✅ | displays/tables.js (189L) |
| Dealer display | ✅ | displays/dealers.js (183L) |
| Promotions display | ✅ | displays/promotions.js (180L) |
| Leaderboard display | ✅ | displays/leaderboard.js (161L) |
| Announcements display | ✅ | displays/announcements.js (156L) |
| Combined multi-panel display | ✅ | displays/combined.js (296L) |
| Lobby walk-in view | ✅ | lobby.js (260L) |

### Additional (CC exceeds TC)
| Feature | Notes |
|---|---|
| W-2G Tax compliance | TC doesn't have this |
| Responsible gaming / self-exclusion | TC doesn't have this |
| Incident reporting | TC doesn't have this |
| Streaming/overlay system | TC doesn't have this |
| Leagues management | TC doesn't have this |
| Marketplace (freelance dealers/equipment) | TC doesn't have this |
| Desktop application | TC doesn't have this |
| QR code check-in | TC doesn't have this |
| Room presets | TC doesn't have this |

---

## ✅ ALL GAPS FOUND AND FIXED

### GAP 1: Staff Add Form — ✅ FIXED
**TC Behavior:** Manager types employee name, assigns role and PIN. Employee doesn't need an app account.
**CC Problem:** StaffModal only has role + PIN fields. No name, email, or phone field. API requires user_id (existing account) but form never sends one. Adding an employee is completely non-functional.
**Fix:** Add name/email/phone fields to StaffModal. Update API to accept name-based staff without requiring user_id. Add migration for display_name/email/phone columns on commander_staff.

### GAP 2: Waitlist Pass Button — ✅ FIXED
**TC Behavior:** Brush calls player → player declines → brush hits "Pass" → player moves to bottom of list.
**CC Problem:** Pass API exists (`/api/commander/waitlist/[id]/pass`) but desk view has no Pass button.
**Fix:** Add Pass button (SkipForward icon) to each waitlist entry in desk.js.

### GAP 3: Waitlist Remove Button — ✅ FIXED
**TC Behavior:** Brush removes player who left or is no-show.
**CC Problem:** Delete API exists (`DELETE /api/commander/waitlist/[id]`) but desk view has no Remove button.
**Fix:** Add Remove button (Trash2 icon) to each waitlist entry in desk.js.

### GAP 4: Add Walk-In to Waitlist from Desk — ✅ FIXED
**TC Behavior:** Walk-in player approaches podium → brush adds them to waitlist right from the desk.
**CC Problem:** AddWalkInModal component exists (243L) but is never imported or rendered on the desk page. The "Add" button currently links to a different page.
**Fix:** Import AddWalkInModal into desk.js and render it when "Add Player" is clicked.

### GAP 5: Stakes Not Shown on Waitlist Desk — ✅ FIXED
**TC Behavior:** Waitlist shows "NLH 1/2" or "PLO 2/5" — game type AND stakes together.
**Fix Applied:** Changed grouping key to `${game_type} ${stakes}`. Now groups correctly as "NLH 1/3", "NLH 2/5", etc.

### GAP 6: Close/Break Individual Game — ✅ FIXED
**TC Behavior:** Floor manager can close a specific running game (break the table).
**Fix Applied:** Added "Close Game" button to table cards when a game is running. Calls PATCH /api/commander/games/[id] with status: 'closed'.

### GAP 7: Tournament History Per Member — ✅ FIXED
**TC Behavior:** Player profile shows their tournament results history.
**Fix Applied:** Added "tournaments" tab to member detail page. New API /api/commander/tournaments/player-results returns finish position, payouts, rebuys matched by member name.

---

## SUMMARY

| Category | Count |
|---|---|
| TC features fully matched | **68** |
| CC features that exceed TC | **9** |
| Gaps found during audit | **7** |
| Gaps fixed | **7** ✅ |
| Remaining gaps | **0** |
| **TC parity** | **100%** |

### All 7 Gaps Fixed:
1. ✅ Staff Add Form — name/email/phone fields + API accepts name-only employees
2. ✅ Waitlist Pass button — SkipForward icon on every entry
3. ✅ Waitlist Remove button — Trash2 icon on every entry
4. ✅ Add Walk-In from desk — inline WalkInForm modal
5. ✅ Stakes on waitlist grouping — groups by "NLH 1/3" not just "NLH"
6. ✅ Close individual game UI — Close Game button on table cards
7. ✅ Tournament history per member — new tournaments tab + API
