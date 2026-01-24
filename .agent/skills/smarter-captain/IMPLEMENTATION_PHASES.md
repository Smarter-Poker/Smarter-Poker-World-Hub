# Smarter Captain - Implementation Phases

## Critical Instructions for All Agents

**BEFORE starting any Smarter Captain work:**
1. Read `SKILL.md` for overview
2. Read the relevant phase section below
3. Reference `DATABASE_SCHEMA.sql` for table structures
4. Reference `API_REFERENCE.md` for endpoint specs
5. Follow the UI design system in `ENHANCEMENTS.md`

**NEVER:**
- Invent features not in the spec
- Change database schema without updating `DATABASE_SCHEMA.sql`
- Create APIs not documented in `API_REFERENCE.md`
- Use emojis in the UI
- Deviate from the Facebook-style color scheme

---

## Phase 1: Foundation (Weeks 1-4)

### Goal
Core infrastructure + Basic waitlist MVP

### Week 1-2: Database & API Foundation

#### Step 1.1: Create Database Migration
```bash
# Create migration file
touch supabase/migrations/20260201_captain_foundation.sql
```

**Tables to create (copy from DATABASE_SCHEMA.sql):**
- `captain_staff`
- `captain_tables`
- `captain_games`
- `captain_waitlist`
- `captain_waitlist_history`
- `captain_seats`
- `captain_notifications`

**Validation:**
```sql
-- Run after migration
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'captain_%';
-- Should return 7 tables
```

#### Step 1.2: Create API Route Structure
```
/pages/api/captain/
├── venues/
│   ├── index.js              # GET list, POST create
│   └── [id].js               # GET, PATCH venue
├── games/
│   ├── index.js              # POST create game
│   ├── live.js               # GET all live games
│   └── [id].js               # GET, PATCH, DELETE game
├── waitlist/
│   ├── index.js              # POST join waitlist
│   ├── my.js                 # GET user's waitlists
│   ├── venue/
│   │   └── [venueId].js      # GET venue waitlists
│   └── [id]/
│       ├── index.js          # DELETE leave
│       ├── call.js           # POST call player
│       └── seat.js           # POST seat player
├── staff/
│   ├── index.js              # GET list, POST add
│   └── verify-pin.js         # POST verify PIN
└── notifications/
    └── send.js               # POST send notification
```

**Validation:**
- Each endpoint returns proper JSON
- Authentication required on protected routes
- Staff routes check venue permissions

#### Step 1.3: Implement Authentication Middleware
```typescript
// /src/lib/captain/auth.ts
export async function requireStaff(req, res, venueId: string) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  const staff = await supabase
    .from('captain_staff')
    .select('*')
    .eq('venue_id', venueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single();

  if (!staff.data) return res.status(403).json({ error: 'FORBIDDEN' });
  return staff.data;
}
```

### Week 3-4: Waitlist MVP

#### Step 1.4: Waitlist Join Flow
```typescript
// POST /api/captain/waitlist/join
interface JoinWaitlistRequest {
  venue_id: string;
  game_type: string;
  stakes: string;
  player_name?: string;  // For walk-ins
  player_phone?: string;
}

// Response
interface JoinWaitlistResponse {
  entry: WaitlistEntry;
  position: number;
  estimated_wait: number;
}
```

**Business Logic:**
1. Check if player already on this waitlist
2. Get current max position for game
3. Insert with position = max + 1
4. Calculate estimated wait (simple: position * 15 min initially)
5. Return entry with position

#### Step 1.5: Staff Terminal UI
```
Location: /pages/captain/dashboard.js

Components needed:
- /src/components/captain/staff/GameGrid.jsx
- /src/components/captain/staff/WaitlistManager.jsx
- /src/components/captain/staff/QuickActions.jsx
- /src/components/captain/staff/ActivityFeed.jsx
```

**UI Requirements:**
- Facebook blue (#1877F2) for primary actions
- Gray-50 (#F9FAFB) background
- White cards with subtle shadows
- No emojis anywhere
- Touch-optimized (44px minimum tap targets)

#### Step 1.6: SMS Notifications (Twilio)
```typescript
// /src/lib/captain/notifications.ts
import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function sendSeatNotification(phone: string, venue: string, game: string) {
  return client.messages.create({
    body: `Your seat is ready at ${venue} for ${game}. Please check in within 5 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone
  });
}
```

**Validation Checklist Phase 1:**
- [ ] 7 database tables created with indexes
- [ ] Staff can log in with PIN
- [ ] Players can join waitlist via API
- [ ] Staff can view waitlist on dashboard
- [ ] Staff can call players (sends SMS)
- [ ] Staff can seat players
- [ ] Real-time updates via Supabase
- [ ] Mobile-responsive staff UI

---

## Phase 2: Cash Games (Weeks 5-8)

### Goal
Complete cash game management

### Week 5-6: Table Management

#### Step 2.1: Table CRUD
```
APIs:
- GET /api/captain/tables/venue/[venueId]
- POST /api/captain/tables
- PATCH /api/captain/tables/[id]
- DELETE /api/captain/tables/[id]
```

#### Step 2.2: Game Opening Flow
```typescript
// Business logic for opening a game
async function openGame(venueId: string, tableId: string, gameConfig: GameConfig) {
  // 1. Verify table is available
  // 2. Create game record
  // 3. Update table status to 'in_use'
  // 4. Create 9 empty seat records
  // 5. Broadcast via Supabase realtime
  // 6. Return game with seats
}
```

#### Step 2.3: Player Seating Workflow
```
1. Staff clicks "Call Next" on waitlist
2. System sends notification to player
3. Staff clicks "Seat Player"
4. Modal shows available seats
5. Staff selects seat
6. System:
   - Updates waitlist entry to 'seated'
   - Creates seat record
   - Updates game player count
   - Logs to waitlist history
   - Awards XP to player
```

### Week 7-8: Enhanced Features

#### Step 2.4: Must-Move Games
```sql
-- Must-move game links to parent
INSERT INTO captain_games (
  venue_id, table_id, game_type, stakes,
  is_must_move, parent_game_id
) VALUES (
  $1, $2, 'nlh', '1/3',
  true, $parent_game_id
);
```

**Logic:**
- When main game has seat, pull from must-move
- Must-move player goes to top of main game waitlist
- Track time on must-move for fairness

#### Step 2.5: Session Tracking
```typescript
// Auto-create session on first seating
// Auto-close session on last checkout
// Track: venue, games played, duration, comps earned
```

#### Step 2.6: XP Integration
```typescript
const CAPTAIN_XP_EVENTS = {
  'waitlist.joined': 5,
  'game.seated': 25,
  'session.hour_played': 10,
  'session.completed': 50,
};

// Award XP when player is seated
await awardXP(playerId, 'game.seated', 25);
```

**Validation Checklist Phase 2:**
- [ ] Tables can be created/edited/deleted
- [ ] Games can be opened on tables
- [ ] 9 seats created per game
- [ ] Players can be seated from waitlist
- [ ] Must-move games work correctly
- [ ] Sessions tracked automatically
- [ ] XP awarded for actions
- [ ] Game player counts accurate
- [ ] Real-time updates working

---

## Phase 3: Tournaments (Weeks 9-12)

### Goal
Complete tournament management system

### Week 9-10: Tournament Core

#### Step 3.1: Tournament Creation
```typescript
interface CreateTournamentRequest {
  venue_id: string;
  name: string;
  tournament_type: 'freezeout' | 'rebuy' | 'bounty' | 'satellite';
  buyin_amount: number;
  buyin_fee: number;
  starting_chips: number;
  scheduled_start: string;
  blind_structure: BlindLevel[];
  // ... see API_REFERENCE.md for full spec
}
```

#### Step 3.2: Blind Structure Builder UI
```
Component: /src/components/captain/shared/BlindStructureEditor.jsx

Features:
- Add/remove/reorder levels
- Set SB, BB, ante, duration
- Insert breaks
- Templates for common structures
- Preview total tournament length
```

#### Step 3.3: Registration System
```typescript
// POST /api/captain/tournaments/[id]/register
// - Check tournament not full
// - Check not already registered
// - Create entry record
// - Update tournament counts
// - Send confirmation notification
```

### Week 11-12: Tournament Operations

#### Step 3.4: Live Clock Management
```typescript
// Tournament clock state machine
interface TournamentClock {
  tournamentId: string;
  currentLevel: number;
  secondsRemaining: number;
  isRunning: boolean;
  isOnBreak: boolean;
}

// Broadcast every second when running
// Channel: captain:tournament:{id}
// Event: clock:tick
```

#### Step 3.5: Clock Display Component
```
Component: /src/components/captain/player/LiveClock.jsx

Display:
- Current level number
- Time remaining (MM:SS)
- Current blinds/ante
- Next level preview
- Players remaining
- Average stack
- Prize pool
```

#### Step 3.6: Elimination & Payouts
```typescript
// POST /api/captain/tournaments/[id]/eliminate
// - Update entry status to 'eliminated'
// - Set finish_position
// - Update players_remaining
// - If in money, trigger payout flow
// - Broadcast elimination event
```

**Validation Checklist Phase 3:**
- [ ] Tournaments can be created with blind structures
- [ ] Players can register (app + walk-in)
- [ ] Clock displays and updates in real-time
- [ ] Clock can be paused/resumed
- [ ] Levels advance correctly
- [ ] Breaks work correctly
- [ ] Players can be eliminated
- [ ] Payouts recorded correctly
- [ ] Final results published

---

## Phase 4: Home Games (Weeks 13-16)

### Goal
Launch home games marketplace

### Week 13-14: Home Game Core

#### Step 4.1: Home Game Creation
```typescript
// POST /api/captain/home-games
// See API_REFERENCE.md for full spec

// Key fields:
// - visibility: 'private' | 'friends' | 'public'
// - requires_approval: boolean
// - invite_code: auto-generated unique code
```

#### Step 4.2: Discovery & Search
```typescript
// GET /api/captain/home-games
// Query params: state, city, date, game_type, visibility

// Privacy rules:
// - 'public': Anyone can see
// - 'friends': Only Smarter.Poker friends can see
// - 'private': Only via invite code
```

#### Step 4.3: RSVP Flow
```
1. Player finds game or has invite code
2. Player clicks "Request to Join"
3. Optional: Enter message to host
4. Host receives notification
5. Host approves/declines/waitlists
6. Player notified of decision
7. If approved: See full address
```

### Week 15-16: Trust & Safety

#### Step 4.4: Rating System
```typescript
// After game ends, prompt both host and players for reviews
interface HomeGameReview {
  rating: 1-5;
  review_text?: string;
  game_quality?: 1-5;
  host_rating?: 1-5;
  location_rating?: 1-5;
}

// Aggregate into host profile
// Display average rating, games hosted count
```

#### Step 4.5: Host Verification
```
Verification levels:
- Unverified: New hosts
- Phone Verified: Confirmed phone number
- ID Verified: Government ID check (optional)
- Trusted Host: 10+ games, 4.5+ rating
```

#### Step 4.6: Reporting System
```typescript
// POST /api/captain/home-games/[id]/report
interface ReportRequest {
  reason: 'no_show' | 'unsafe' | 'scam' | 'harassment' | 'other';
  description: string;
  evidence?: string[]; // URLs to screenshots
}
```

**Validation Checklist Phase 4:**
- [ ] Hosts can create games (all visibility levels)
- [ ] Games appear in discovery (respecting privacy)
- [ ] Invite codes work
- [ ] RSVP flow complete
- [ ] Host can approve/decline
- [ ] Address only visible to approved players
- [ ] Reviews can be left
- [ ] Ratings aggregate correctly
- [ ] Reporting works

---

## Phase 5: Promotions & Analytics (Weeks 17-20)

### Goal
Advanced features for competitive edge

### Week 17-18: Promotions

#### Step 5.1: Promotion Builder
```typescript
// Support types: high_hand, bad_beat, splash_pot, drawing, custom
// Recurring schedules
// Qualifying game/stakes filters
// Prize configuration
```

#### Step 5.2: High Hand Tracking
```typescript
// POST /api/captain/promotions/[id]/winner
// Staff enters winning hand
// System verifies hand ranks higher than current
// Updates current high hand
// Broadcasts to displays
```

#### Step 5.3: Promotion Displays
```
Table displays rotate through:
1. Current waitlist
2. Tournament clock (if running)
3. Active promotions
4. Current high hand
5. Leaderboards
```

### Week 19-20: Analytics

#### Step 5.4: Daily Analytics Aggregation
```typescript
// Cron job: aggregate daily stats
// Run at 4 AM venue local time
// Populate captain_analytics_daily table
```

#### Step 5.5: Manager Dashboard
```
/pages/captain/reports.js

Charts:
- Player traffic over time
- Waitlist signups by source
- Average wait times
- Table utilization
- Tournament revenue
- Promotion costs vs engagement
```

#### Step 5.6: AI Wait Time Predictions
```typescript
// Train on waitlist_history
// Features: hour, day_of_week, game_type, stakes, current_count
// Output: predicted_minutes
// Store predictions, compare to actual, improve model
```

**Validation Checklist Phase 5:**
- [ ] Promotions can be created (all types)
- [ ] High hands tracked and verified
- [ ] Promotion winners recorded
- [ ] Table displays show promotions
- [ ] Daily analytics aggregating
- [ ] Manager can view reports
- [ ] Charts render correctly
- [ ] AI predictions generating

---

## Phase 6: Scale & Polish (Weeks 21-24)

### Goal
Production-ready platform

### Week 21-22: Performance & Security

#### Step 6.1: Load Testing
```bash
# Use k6 or similar
# Target: 100 concurrent venues, 1000 concurrent users
# Test: waitlist operations, tournament clock, notifications
```

#### Step 6.2: Security Audit
```
Checklist:
- [ ] All endpoints require auth (except public)
- [ ] RLS policies on all tables
- [ ] No SQL injection possible
- [ ] Rate limiting implemented
- [ ] HTTPS everywhere
- [ ] Secrets not in code
```

#### Step 6.3: Error Monitoring
```typescript
// Sentry integration
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Week 23-24: Launch Prep

#### Step 6.4: Documentation
```
Create:
- Staff training guide
- Manager admin guide
- Player FAQ
- API documentation (already done)
- Troubleshooting guide
```

#### Step 6.5: Onboarding Flow
```
New venue signup:
1. Contact form → Lead capture
2. Demo call scheduled
3. Agreement signed
4. Venue configured in system
5. Devices shipped (if HaaS)
6. Go-live call
7. 7-day monitoring period
```

#### Step 6.6: Pilot Expansion
```
Target: 5 pilot venues
- 2 Texas card rooms
- 1 California card room
- 1 Las Vegas room
- 1 Florida room

Success criteria:
- 95% uptime
- < 5 support tickets per venue per week
- Staff satisfaction > 4/5
- Player adoption > 50%
```

**Validation Checklist Phase 6:**
- [ ] Load tests pass
- [ ] Security audit complete
- [ ] Error monitoring active
- [ ] Documentation complete
- [ ] Onboarding flow tested
- [ ] 5 pilot venues live
- [ ] Success metrics met

---

## File Quick Reference

| Need | File |
|------|------|
| Database tables | `DATABASE_SCHEMA.sql` |
| API endpoints | `API_REFERENCE.md` |
| UI colors/fonts | `ENHANCEMENTS.md` Part 1 |
| AI features | `ENHANCEMENTS.md` Part 2 |
| Hardware specs | `DEPLOYMENT.md` |
| Competitor info | `COMPETITOR_ANALYSIS.md` |
| Future features | `EXPANSION.md` |
| Business model | `BUILD_PLAN.md` Part 5-6 |

---

## Validation Commands

```bash
# Check all Captain tables exist
psql -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'captain_%';"

# Check API routes exist
find pages/api/captain -name "*.js" | wc -l
# Should be 30+

# Check components exist
find src/components/captain -name "*.jsx" | wc -l
# Should be 20+

# Run tests
npm run test:captain
```

---

## Do Not Deviate

These specifications are final. If you think something should be different:
1. Do NOT change it
2. Document your concern
3. Flag for human review

The goal is exact implementation of this spec, not improvement or reinterpretation.
