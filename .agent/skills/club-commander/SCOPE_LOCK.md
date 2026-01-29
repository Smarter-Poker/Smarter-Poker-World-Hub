# Club Commander - Scope Lock

## Purpose

This file defines the EXACT scope of Club Commander. Anything not listed here is OUT OF SCOPE and must be rejected.

---

## IN SCOPE - Phase 1 (Database + Waitlist MVP)

### Database Tables (ONLY these 7)
- [ ] commander_staff
- [ ] commander_tables
- [ ] commander_games
- [ ] commander_waitlist
- [ ] commander_waitlist_history
- [ ] commander_seats
- [ ] commander_notifications

### API Endpoints (ONLY these)
- [ ] GET /api/commander/venues
- [ ] GET /api/commander/venues/[id]
- [ ] GET /api/commander/games/live
- [ ] GET /api/commander/games/venue/[venueId]
- [ ] POST /api/commander/games
- [ ] PATCH /api/commander/games/[id]
- [ ] DELETE /api/commander/games/[id]
- [ ] POST /api/commander/waitlist/join
- [ ] GET /api/commander/waitlist/my
- [ ] GET /api/commander/waitlist/venue/[venueId]
- [ ] DELETE /api/commander/waitlist/[id]
- [ ] POST /api/commander/waitlist/[id]/call
- [ ] POST /api/commander/waitlist/[id]/seat
- [ ] GET /api/commander/staff/venue/[venueId]
- [ ] POST /api/commander/staff
- [ ] POST /api/commander/staff/verify-pin
- [ ] POST /api/commander/notifications/send

### UI Pages (ONLY these)
- [ ] /pages/commander/dashboard.js (Staff terminal)
- [ ] /pages/commander/login.js (Staff PIN login)
- [ ] /pages/hub/commander/index.js (Player waitlist view)
- [ ] /pages/hub/commander/venue/[id].js (Venue detail)

### Components (ONLY these)
- [ ] GameGrid.jsx
- [ ] WaitlistManager.jsx
- [ ] QuickActions.jsx
- [ ] ActivityFeed.jsx
- [ ] WaitlistCard.jsx (player)
- [ ] VenueCard.jsx (player)

---

## IN SCOPE - Phase 2 (Cash Games)

### Additional Tables
- [ ] commander_player_sessions
- [ ] commander_service_requests
- [ ] commander_player_preferences

### Additional Endpoints
- [ ] Table CRUD endpoints
- [ ] Session tracking endpoints
- [ ] Service request endpoints

### Additional UI
- [ ] SeatPicker.jsx
- [ ] TableStatus.jsx
- [ ] SessionTracker.jsx

---

## IN SCOPE - Phase 3 (Tournaments)

### Additional Tables
- [ ] commander_tournaments
- [ ] commander_tournament_entries

### Additional Endpoints
- [ ] Tournament CRUD
- [ ] Registration endpoints
- [ ] Clock control endpoints
- [ ] Elimination endpoints

### Additional UI
- [ ] TournamentClock.jsx
- [ ] BlindStructureEditor.jsx
- [ ] PayoutCalculator.jsx
- [ ] TournamentManager.jsx

---

## IN SCOPE - Phase 4 (Home Games)

### Additional Tables
- [ ] commander_home_games
- [ ] commander_home_game_rsvps
- [ ] commander_home_game_reviews

### Additional Endpoints
- [ ] Home game CRUD
- [ ] RSVP endpoints
- [ ] Review endpoints

### Additional UI
- [ ] CreateGameForm.jsx
- [ ] RSVPManager.jsx
- [ ] PlayerRating.jsx
- [ ] GameCalendar.jsx

---

## IN SCOPE - Phase 5 (Promotions & Analytics)

### Additional Tables
- [ ] commander_promotions
- [ ] commander_high_hands
- [ ] commander_analytics_daily

### Additional Endpoints
- [ ] Promotion CRUD
- [ ] Winner recording
- [ ] Analytics endpoints

### Additional UI
- [ ] PromotionBuilder.jsx
- [ ] HighHandDisplay.jsx
- [ ] AnalyticsDashboard.jsx

---

## IN SCOPE - Phase 6 (Scale & Polish)

### Additional Tables
- [ ] commander_wait_time_predictions
- [ ] commander_player_recommendations
- [ ] Remaining tables from DATABASE_SCHEMA.sql

### Additional Features
- [ ] AI wait time predictions
- [ ] Load testing
- [ ] Security hardening
- [ ] Documentation

---

## OUT OF SCOPE - DO NOT BUILD

### Features NOT in this release
- Mobile native apps (PWA only)
- RFID integration
- Blockchain features
- AR features
- White-label system
- Multi-language support
- Payment processing
- Crypto support

### Technical decisions that are LOCKED
- Database: Supabase PostgreSQL (no alternatives)
- Auth: Supabase Auth (no alternatives)
- Frontend: Next.js Pages Router (not App Router)
- Styling: Tailwind + custom colors (not DaisyUI themes)
- State: Zustand (not Redux, not Context)
- Icons: Lucide (not FontAwesome, not emojis)

### UI decisions that are LOCKED
- Colors: Facebook palette ONLY
- Font: Inter ONLY
- No emojis EVER
- No gradients
- No animations beyond 200ms transitions

---

## How To Use This File

### For Users

When reviewing agent work, check:
1. Is the table in the current phase's scope? If no, reject.
2. Is the endpoint in the current phase's scope? If no, reject.
3. Is the component in the current phase's scope? If no, reject.
4. Did they add anything not listed? If yes, reject.

### For Agents

Before creating anything, verify:
1. Is this item checked in the current phase? If no, stop.
2. Am I in the correct phase? If no, stop.
3. Is this in OUT OF SCOPE? If yes, stop.

---

## Scope Change Process

If something needs to be added to scope:
1. STOP current work
2. Document the proposed addition
3. Get explicit human approval
4. Update this SCOPE_LOCK.md file
5. THEN proceed with implementation

**No scope changes without updating this file first.**
