# Club Commander - Complete Build Plan

## The PokerAtlas Killer: A Strategic Disruption Play

---

## Executive Summary

**Club Commander** is a cloud-based poker room management platform designed to:
1. **Replicate every PokerAtlas feature** with improvements
2. **Add home games functionality** (untapped market)
3. **Integrate deeply with Smarter.Poker** for user acquisition
4. **Offer free/near-free pricing** to clubs (loss-leader strategy)
5. **100% cloud-based** - zero on-premise hardware/software

### The Business Model Innovation

```
Traditional Model (PokerAtlas):
  Club pays $$$$ → Gets software → Players use app → PokerAtlas gains audience

Club Commander Model:
  Club pays $0-99/mo → Gets better software → Players MUST sign up to Smarter.Poker
  → Smarter.Poker gains verified users → Monetize via training/subscriptions/marketplace
```

**Why This Wins:**
- Clubs save thousands annually
- Players get better experience + training platform
- Smarter.Poker builds massive verified user base
- Network effects compound (more clubs = more players = more clubs)

---

## Part 1: Feature Parity Matrix

### Every PokerAtlas Feature + Our Improvement

| PokerAtlas Feature | Club Commander | Our Improvement |
|---------------------|-----------------|-----------------|
| Cash game waitlists | ✅ | AI-powered wait time estimates |
| Online waitlist signup | ✅ | One-tap signup (already logged into Smarter.Poker) |
| SMS seat notifications | ✅ | SMS + Push + In-app + Discord/Telegram bots |
| Tournament registration | ✅ | Pre-registration weeks ahead + auto-reminders |
| Live tournament clock | ✅ | Mobile-optimized + Apple Watch/widget support |
| Blind structure display | ✅ | Visual chip stack calculator + ICM integration |
| Payout calculations | ✅ | Real-time payout updates + chop calculator |
| Player leaderboards | ✅ | Cross-venue leaderboards + Smarter.Poker XP integration |
| Player check-in | ✅ | QR code + NFC + Face recognition options |
| Table management | ✅ | AI-assisted table balancing recommendations |
| Must-move tracking | ✅ | Automated must-move with fairness scoring |
| Staff interfaces | ✅ | Role-based dashboards + mobile staff app |
| Promotions management | ✅ | A/B testing + engagement analytics |
| High hand tracking | ✅ | Auto-verification with hand history |
| Bad beat jackpots | ✅ | Network-wide progressive jackpots (opt-in) |
| Business analytics | ✅ | Real-time dashboards + predictive analytics |
| Marketing broadcast | ✅ | Multi-channel (Smarter.Poker + social + email) |
| Player rewards | ✅ | Cross-venue loyalty + Smarter.Poker diamonds |
| **Home Games** | ✅ NEW | Full home game management suite |
| **Training Integration** | ✅ NEW | Direct link to GodMode training |
| **Social Features** | ✅ NEW | Player messaging, friends, groups |
| **Bankroll Tracking** | ✅ NEW | Integrated session logging |
| **AI Dealer Assistant** | ✅ NEW | Rules lookup, pot calculations |
| **Stream Integration** | ✅ NEW | One-click Twitch/YouTube setup |

---

## Part 2: System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLUB COMMANDER CLOUD                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Player     │  │    Staff     │  │   Manager    │  │    Owner     │    │
│  │   Web/App    │  │   Terminal   │  │  Dashboard   │  │   Analytics  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│         └─────────────────┴─────────────────┴─────────────────┘             │
│                                    │                                         │
│                         ┌──────────▼──────────┐                             │
│                         │   API Gateway       │                             │
│                         │   (Next.js API)     │                             │
│                         └──────────┬──────────┘                             │
│                                    │                                         │
│    ┌───────────────────────────────┼───────────────────────────────┐        │
│    │                               │                               │        │
│    ▼                               ▼                               ▼        │
│ ┌─────────┐                 ┌─────────────┐                 ┌──────────┐   │
│ │Supabase │                 │ Realtime    │                 │ Edge     │   │
│ │Database │◄───────────────►│ WebSockets  │◄───────────────►│ Workers  │   │
│ │(Postgres)│                │ (Supabase)  │                 │ (Vercel) │   │
│ └─────────┘                 └─────────────┘                 └──────────┘   │
│      │                                                           │          │
│      │                    ┌─────────────────┐                   │          │
│      └───────────────────►│ Notification    │◄──────────────────┘          │
│                           │ Service         │                              │
│                           │ (Twilio/FCM)    │                              │
│                           └─────────────────┘                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SMARTER.POKER PLATFORM                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   User      │  │   Training  │  │   Social    │  │   XP &      │        │
│  │   Profiles  │  │   (GodMode) │  │   Features  │  │   Diamonds  │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema (New Tables)

```sql
-- =====================================================
-- CLUB COMMANDER DATABASE SCHEMA
-- =====================================================

-- ===================
-- VENUE MANAGEMENT
-- ===================

-- Extends existing poker_venues table
ALTER TABLE poker_venues ADD COLUMN IF NOT EXISTS
  commander_enabled BOOLEAN DEFAULT false,
  commander_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'enterprise'
  commander_activated_at TIMESTAMPTZ,
  commission_type TEXT DEFAULT 'time', -- 'time', 'rake', 'hybrid'
  accepts_home_games BOOLEAN DEFAULT false,
  auto_text_enabled BOOLEAN DEFAULT true,
  waitlist_settings JSONB DEFAULT '{}',
  tournament_settings JSONB DEFAULT '{}',
  staff_pin_required BOOLEAN DEFAULT true,
  primary_contact_id UUID REFERENCES profiles(id);

-- Staff & Roles
CREATE TABLE commander_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'owner', 'manager', 'floor', 'brush', 'dealer'
  permissions JSONB DEFAULT '{}',
  pin_code TEXT, -- 4-6 digit PIN for quick actions
  is_active BOOLEAN DEFAULT true,
  hired_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

-- ===================
-- TABLE MANAGEMENT
-- ===================

CREATE TABLE commander_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  table_name TEXT, -- "Table 1", "Feature Table", etc.
  max_seats INTEGER DEFAULT 9,
  current_game_id UUID, -- Active game on this table
  status TEXT DEFAULT 'available', -- 'available', 'in_use', 'reserved', 'maintenance'
  features JSONB DEFAULT '{}', -- { "has_usb": true, "has_auto_shuffler": true }
  position_x INTEGER, -- For floor map visualization
  position_y INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Active Games (Cash & Tournament)
CREATE TABLE commander_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  table_id UUID REFERENCES commander_tables(id),
  game_type TEXT NOT NULL, -- 'nlh', 'plo', 'mixed', 'limit', 'tournament'
  stakes TEXT, -- '1/3', '2/5', '5/10', etc.
  min_buyin INTEGER,
  max_buyin INTEGER,
  current_players INTEGER DEFAULT 0,
  max_players INTEGER DEFAULT 9,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'running', 'breaking', 'closed'
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  is_must_move BOOLEAN DEFAULT false,
  parent_game_id UUID REFERENCES commander_games(id), -- For must-move chains
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- WAITLIST SYSTEM
-- ===================

CREATE TABLE commander_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  game_id UUID REFERENCES commander_games(id),
  player_id UUID REFERENCES profiles(id),
  player_name TEXT, -- For walk-in players without accounts
  player_phone TEXT,
  position INTEGER NOT NULL,
  signup_method TEXT DEFAULT 'walk_in', -- 'walk_in', 'app', 'phone', 'kiosk'
  status TEXT DEFAULT 'waiting', -- 'waiting', 'called', 'seated', 'passed', 'removed'
  call_count INTEGER DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  seated_at TIMESTAMPTZ,
  estimated_wait_minutes INTEGER -- AI-calculated
);

-- Waitlist History (for analytics)
CREATE TABLE commander_waitlist_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  game_type TEXT,
  stakes TEXT,
  wait_time_minutes INTEGER,
  was_seated BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- SEAT MANAGEMENT
-- ===================

CREATE TABLE commander_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES commander_games(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT, -- For walk-ins
  status TEXT DEFAULT 'empty', -- 'empty', 'occupied', 'reserved', 'away'
  buyin_amount INTEGER,
  seated_at TIMESTAMPTZ,
  away_since TIMESTAMPTZ,
  session_id UUID, -- Links to player session tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(game_id, seat_number)
);

-- ===================
-- TOURNAMENT SYSTEM
-- ===================

CREATE TABLE commander_tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  tournament_type TEXT DEFAULT 'freezeout', -- 'freezeout', 'rebuy', 'bounty', 'satellite'
  buyin_amount INTEGER NOT NULL,
  buyin_fee INTEGER DEFAULT 0, -- House fee
  starting_chips INTEGER NOT NULL,

  -- Schedule
  scheduled_start TIMESTAMPTZ NOT NULL,
  registration_opens TIMESTAMPTZ,
  late_registration_levels INTEGER DEFAULT 0,
  actual_start TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Structure
  blind_structure JSONB NOT NULL, -- Array of { level, small_blind, big_blind, ante, duration_minutes }
  break_schedule JSONB, -- Array of { after_level, duration_minutes }
  payout_structure JSONB, -- Array of { place, percentage } or { place, amount }

  -- Current State
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'registering', 'running', 'paused', 'final_table', 'completed', 'cancelled'
  current_level INTEGER DEFAULT 0,
  level_started_at TIMESTAMPTZ,
  seconds_remaining INTEGER,
  is_on_break BOOLEAN DEFAULT false,

  -- Counts
  max_entries INTEGER,
  total_entries INTEGER DEFAULT 0,
  total_rebuys INTEGER DEFAULT 0,
  total_addons INTEGER DEFAULT 0,
  players_remaining INTEGER DEFAULT 0,
  prize_pool INTEGER DEFAULT 0,

  -- Settings
  allows_rebuys BOOLEAN DEFAULT false,
  rebuy_amount INTEGER,
  rebuy_chips INTEGER,
  max_rebuys INTEGER,
  rebuy_end_level INTEGER,
  allows_addon BOOLEAN DEFAULT false,
  addon_amount INTEGER,
  addon_chips INTEGER,

  -- Display
  featured BOOLEAN DEFAULT false,
  broadcast_to_smarter BOOLEAN DEFAULT true,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tournament Registrations
CREATE TABLE commander_tournament_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES commander_tournaments(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  player_name TEXT,
  player_phone TEXT,

  entry_number INTEGER, -- For multiple entries
  table_number INTEGER,
  seat_number INTEGER,
  chip_count INTEGER,

  status TEXT DEFAULT 'registered', -- 'registered', 'seated', 'eliminated', 'cashed'
  finish_position INTEGER,
  payout_amount INTEGER,

  rebuys_used INTEGER DEFAULT 0,
  addon_used BOOLEAN DEFAULT false,

  registered_at TIMESTAMPTZ DEFAULT now(),
  seated_at TIMESTAMPTZ,
  eliminated_at TIMESTAMPTZ,
  eliminated_by UUID REFERENCES profiles(id)
);

-- ===================
-- NOTIFICATIONS
-- ===================

CREATE TABLE commander_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),

  notification_type TEXT NOT NULL, -- 'seat_available', 'tournament_starting', 'called_for_seat', 'promotion', 'custom'
  channel TEXT NOT NULL, -- 'sms', 'push', 'email', 'in_app'

  title TEXT,
  message TEXT NOT NULL,

  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed'
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- PROMOTIONS & JACKPOTS
-- ===================

CREATE TABLE commander_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  promotion_type TEXT NOT NULL, -- 'high_hand', 'bad_beat', 'splash_pot', 'bonus', 'drawing', 'custom'

  -- Schedule
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  recurring_schedule JSONB, -- { days: [1,2,3], start_time: "18:00", end_time: "23:00" }

  -- Rules
  qualifying_games TEXT[], -- ['nlh', 'plo']
  qualifying_stakes TEXT[], -- ['1/3', '2/5']
  rules JSONB NOT NULL,

  -- Prize
  prize_type TEXT, -- 'cash', 'progressive', 'item', 'freeroll'
  prize_amount INTEGER,
  progressive_pool INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active', -- 'draft', 'active', 'paused', 'completed'

  created_at TIMESTAMPTZ DEFAULT now()
);

-- High Hand Winners
CREATE TABLE commander_high_hands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  promotion_id UUID REFERENCES commander_promotions(id),

  player_id UUID REFERENCES profiles(id),
  player_name TEXT,

  hand_description TEXT NOT NULL, -- "Aces full of Kings"
  hand_cards TEXT[], -- ['As', 'Ah', 'Ad', 'Kc', 'Kd']
  board_cards TEXT[],
  hand_rank INTEGER, -- Numeric ranking for comparison

  game_id UUID REFERENCES commander_games(id),
  table_number INTEGER,

  prize_amount INTEGER,
  verified_by UUID REFERENCES commander_staff(id),
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- PLAYER SESSIONS
-- ===================

CREATE TABLE commander_player_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),

  -- Session tracking
  check_in_at TIMESTAMPTZ DEFAULT now(),
  check_out_at TIMESTAMPTZ,
  total_minutes INTEGER,

  -- Games played
  games_played JSONB DEFAULT '[]', -- Array of { game_id, game_type, stakes, buyin, cashout, duration }

  -- Comp tracking
  comp_rate_per_hour DECIMAL(10,2),
  comps_earned DECIMAL(10,2) DEFAULT 0,

  -- XP integration with Smarter.Poker
  xp_earned INTEGER DEFAULT 0,
  diamonds_earned INTEGER DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ===================
-- HOME GAMES MODULE
-- ===================

CREATE TABLE commander_home_games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES profiles(id) NOT NULL,

  -- Basic Info
  name TEXT NOT NULL,
  description TEXT,
  game_type TEXT NOT NULL,
  stakes TEXT,
  buyin_min INTEGER,
  buyin_max INTEGER,
  max_players INTEGER DEFAULT 9,

  -- Location (privacy-aware)
  city TEXT,
  state TEXT,
  zip_code TEXT,
  full_address TEXT, -- Only shown to confirmed players
  location_notes TEXT,

  -- Schedule
  scheduled_date DATE NOT NULL,
  start_time TIME NOT NULL,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB, -- { frequency: 'weekly', day: 'friday' }

  -- Privacy & Access
  visibility TEXT DEFAULT 'private', -- 'private', 'friends', 'public'
  requires_approval BOOLEAN DEFAULT true,
  invite_code TEXT UNIQUE,

  -- Status
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled'

  -- Preferences
  food_provided BOOLEAN DEFAULT false,
  byob BOOLEAN DEFAULT true,
  smoking_allowed BOOLEAN DEFAULT false,
  house_rules TEXT,

  -- Trust & Verification
  host_verified BOOLEAN DEFAULT false,
  games_hosted_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Home Game RSVPs
CREATE TABLE commander_home_game_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES commander_home_games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),

  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'declined', 'waitlist', 'cancelled'
  rsvp_message TEXT,

  -- Host response
  approved_by UUID REFERENCES profiles(id),
  response_message TEXT,

  -- Confirmation
  confirmed_at TIMESTAMPTZ,
  checked_in BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(home_game_id, player_id)
);

-- Home Game Reviews
CREATE TABLE commander_home_game_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES commander_home_games(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES profiles(id),

  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  -- Specific ratings
  game_quality INTEGER,
  host_rating INTEGER,
  location_rating INTEGER,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(home_game_id, reviewer_id)
);

-- ===================
-- ANALYTICS
-- ===================

CREATE TABLE commander_analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  date DATE NOT NULL,

  -- Traffic
  total_players INTEGER DEFAULT 0,
  unique_players INTEGER DEFAULT 0,
  new_players INTEGER DEFAULT 0, -- First time at venue
  returning_players INTEGER DEFAULT 0,

  -- Waitlist
  total_signups INTEGER DEFAULT 0,
  app_signups INTEGER DEFAULT 0,
  walk_in_signups INTEGER DEFAULT 0,
  average_wait_minutes DECIMAL(10,2),

  -- Games
  tables_opened INTEGER DEFAULT 0,
  peak_tables_running INTEGER DEFAULT 0,
  total_player_hours DECIMAL(10,2),

  -- Tournaments
  tournaments_run INTEGER DEFAULT 0,
  tournament_entries INTEGER DEFAULT 0,
  tournament_prize_pool INTEGER DEFAULT 0,

  -- Revenue indicators
  total_rake_estimate DECIMAL(10,2), -- If tracked
  comp_dollars_issued DECIMAL(10,2),

  -- Engagement
  smarter_poker_signups INTEGER DEFAULT 0, -- New Smarter.Poker accounts

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, date)
);

-- ===================
-- INDEXES FOR PERFORMANCE
-- ===================

CREATE INDEX idx_commander_waitlist_venue_status ON commander_waitlist(venue_id, status);
CREATE INDEX idx_commander_waitlist_player ON commander_waitlist(player_id);
CREATE INDEX idx_commander_games_venue_status ON commander_games(venue_id, status);
CREATE INDEX idx_commander_tournaments_venue_date ON commander_tournaments(venue_id, scheduled_start);
CREATE INDEX idx_commander_tournaments_status ON commander_tournaments(status);
CREATE INDEX idx_commander_sessions_player ON commander_player_sessions(player_id);
CREATE INDEX idx_commander_sessions_venue_date ON commander_player_sessions(venue_id, check_in_at);
CREATE INDEX idx_commander_home_games_date ON commander_home_games(scheduled_date);
CREATE INDEX idx_commander_home_games_location ON commander_home_games(state, city);
CREATE INDEX idx_commander_home_games_visibility ON commander_home_games(visibility, status);
CREATE INDEX idx_commander_notifications_player ON commander_notifications(player_id, status);

-- ===================
-- ROW LEVEL SECURITY
-- ===================

ALTER TABLE commander_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commander_home_games ENABLE ROW LEVEL SECURITY;

-- Staff can manage their venue
CREATE POLICY staff_venue_access ON commander_staff
  FOR ALL USING (
    user_id = auth.uid() OR
    venue_id IN (SELECT venue_id FROM commander_staff WHERE user_id = auth.uid())
  );

-- Players can see their own waitlist entries
CREATE POLICY waitlist_player_access ON commander_waitlist
  FOR SELECT USING (player_id = auth.uid() OR player_id IS NULL);

-- Public tournament visibility
CREATE POLICY tournament_public_read ON commander_tournaments
  FOR SELECT USING (broadcast_to_smarter = true OR venue_id IN (
    SELECT venue_id FROM commander_staff WHERE user_id = auth.uid()
  ));

-- Home game visibility based on setting
CREATE POLICY home_game_visibility ON commander_home_games
  FOR SELECT USING (
    visibility = 'public' OR
    host_id = auth.uid() OR
    id IN (SELECT home_game_id FROM commander_home_game_rsvps WHERE player_id = auth.uid())
  );
```

---

## Part 3: User Interfaces

### 3.1 Player App Interface (Smarter.Poker Integration)

```
┌─────────────────────────────────────────┐
│  🎰 Club Commander                  ≡  │
├─────────────────────────────────────────┤
│                                         │
│  📍 Venues Near You                     │
│  ┌─────────────────────────────────┐   │
│  │ 🏆 The Lodge Card Club          │   │
│  │    2.3 mi • 8 tables running    │   │
│  │    ┌─────────────────────────┐  │   │
│  │    │ 1/3 NLH    │ 3 waiting  │  │   │
│  │    │ 2/5 NLH    │ 5 waiting  │  │   │
│  │    │ 5/10 NLH   │ 0 waiting  │  │   │
│  │    └─────────────────────────┘  │   │
│  │    [Join Waitlist]              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🏠 Home Games Tonight                  │
│  ┌─────────────────────────────────┐   │
│  │ 🎲 Friday Night Poker           │   │
│  │    Austin, TX • 8 PM            │   │
│  │    1/2 NLH • 6/9 spots          │   │
│  │    Host: ⭐4.8 (23 games)        │   │
│  │    [Request Invite]             │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🏆 Tournaments Today                   │
│  ┌─────────────────────────────────┐   │
│  │ Daily $150 @ The Lodge          │   │
│  │    7:00 PM • 42 registered      │   │
│  │    15K chips • 20 min levels    │   │
│  │    [Pre-Register]               │   │
│  └─────────────────────────────────┘   │
│                                         │
├─────────────────────────────────────────┤
│  🎯 My Waitlists                        │
│  ┌─────────────────────────────────┐   │
│  │ 1/3 NLH @ The Lodge             │   │
│  │ Position: #3 • Est: 12 min      │   │
│  │ ████████░░░░░░ 67%              │   │
│  │ [Leave List] [Move to 2/5]      │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
│  🏠      🎰      🏆      👤      ⚙️   │
│  Home   Games   Tourneys Profile  More │
└─────────────────────────────────────────┘
```

### 3.2 Staff Terminal Interface

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CLUB COMMANDER - The Lodge Card Club                    Staff: Mike  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ ACTIVE GAMES ──────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  T1: 1/3 NLH     T2: 1/3 NLH     T3: 2/5 NLH     T4: 2/5 NLH   │   │
│  │  [████████]      [████████]      [████████]      [██████░░]    │   │
│  │   9/9 Full       9/9 Full        9/9 Full        7/9 -2        │   │
│  │                                                                  │   │
│  │  T5: 5/10 NLH    T6: 1/2 PLO     T7: EMPTY       T8: MAINT     │   │
│  │  [████░░░░]      [██████░░]      [░░░░░░░░]      [XXXXXXXX]    │   │
│  │   5/9 -4         7/9 -2          Available       Shuffler      │   │
│  │                                                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ WAITLISTS ─────────────────────┬─ QUICK ACTIONS ────────────────┐  │
│  │                                 │                                 │  │
│  │  1/3 NLH (8 waiting)           │  [📞 Call Next Player]          │  │
│  │  ┌──────────────────────────┐  │                                 │  │
│  │  │ 1. John S.    📱 12min   │  │  [➕ Add Walk-In]               │  │
│  │  │ 2. Maria G.   📱 8min    │  │                                 │  │
│  │  │ 3. *NEW* App  📱 2min    │  │  [🔄 Open New Table]            │  │
│  │  │ 4. Walk-in    ☎️ 1min    │  │                                 │  │
│  │  └──────────────────────────┘  │  [⚖️ Balance Tables]            │  │
│  │                                 │                                 │  │
│  │  2/5 NLH (3 waiting)           │  [📊 View Analytics]            │  │
│  │  5/10 NLH (0 waiting)          │                                 │  │
│  │  1/2 PLO (2 waiting)           │  [🎰 Promotions]                │  │
│  │                                 │                                 │  │
│  └─────────────────────────────────┴─────────────────────────────────┘  │
│                                                                         │
│  ┌─ RECENT ACTIVITY ────────────────────────────────────────────────┐  │
│  │  ✅ 7:42 PM - John S. seated at T1 Seat 5 (1/3 NLH)              │  │
│  │  📱 7:40 PM - New signup: "PokerPro99" for 2/5 NLH via app       │  │
│  │  🔔 7:38 PM - Text sent to Maria G. - seat available soon        │  │
│  │  💰 7:35 PM - High hand: Aces full (T3) - Sarah K. - $500        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  [Waitlists]  [Tables]  [Tournament]  [Players]  [Promos]  [Reports]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Tournament Clock Display

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    THE LODGE CARD CLUB                                  │
│                    Daily $150 NLH                                       │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                         LEVEL 8                                         │
│                                                                         │
│                    ┌─────────────────┐                                  │
│                    │                 │                                  │
│                    │    12:47        │                                  │
│                    │                 │                                  │
│                    └─────────────────┘                                  │
│                                                                         │
│              BLINDS: 400 / 800    ANTE: 800                            │
│                                                                         │
│          NEXT LEVEL: 500 / 1000 / 1000 (15 min break)                  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ENTRIES: 67        REMAINING: 34        AVG STACK: 29,552            │
│                                                                         │
│   PRIZE POOL: $8,710                                                    │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │  1st: $2,613  │  2nd: $1,742  │  3rd: $1,307  │  4th: $871     │  │
│   │  5th: $697    │  6th: $523    │  7th: $436    │  8th: $348     │  │
│   │  9th: $174                                                      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   🏆 CHIP LEADER: SmarterPlayer123 - 87,400                            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│            Powered by Club Commander | smarter.poker                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Home Game Host Dashboard

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🏠 My Home Games                                          Host View   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ UPCOMING GAME ──────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │  🎲 Friday Night Poker                                           │  │
│  │     January 31, 2026 • 8:00 PM                                   │  │
│  │     1/2 NLH • $100-$300 buy-in                                   │  │
│  │                                                                   │  │
│  │  ┌─ CONFIRMED (6/9) ──────────────────────────────────────────┐ │  │
│  │  │ ✅ Mike T.     ⭐4.9    💰 Always rebuys                    │ │  │
│  │  │ ✅ Sarah K.    ⭐4.7    🎯 Tight player                     │ │  │
│  │  │ ✅ John D.     ⭐4.5    📱 Usually on time                  │ │  │
│  │  │ ✅ Lisa M.     ⭐4.8    🆕 First game with you              │ │  │
│  │  │ ✅ Tom R.      ⭐4.6    ⚠️ Cancelled twice before           │ │  │
│  │  │ ✅ Amy W.      ⭐4.9    🏆 Regular                          │ │  │
│  │  └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  │  ┌─ PENDING REQUESTS (3) ─────────────────────────────────────┐ │  │
│  │  │ ⏳ Chris P.    ⭐4.2    "Friend of Mike T."                 │ │  │
│  │  │    [✅ Approve]  [❌ Decline]  [💬 Message]                 │ │  │
│  │  │                                                             │ │  │
│  │  │ ⏳ Dan S.      ⭐3.8    "Looking for good home game"        │ │  │
│  │  │    [✅ Approve]  [❌ Decline]  [💬 Message]                 │ │  │
│  │  │                                                             │ │  │
│  │  │ ⏳ NewUser22   🆕 No rating yet                             │ │  │
│  │  │    [✅ Approve]  [❌ Decline]  [💬 Message]                 │ │  │
│  │  └────────────────────────────────────────────────────────────┘ │  │
│  │                                                                   │  │
│  │  [📤 Share Invite Link]  [📋 Copy Game Details]  [✏️ Edit Game] │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  📊 YOUR HOST STATS                                                     │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │  Games Hosted: 23  │  Avg Rating: 4.8  │  Total Players: 187     │ │
│  │  No-show Rate: 4%  │  Repeat Players: 78%  │  XP Earned: 12,450  │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  [➕ Create New Game]  [📅 View Calendar]  [👥 My Player Network]      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: API Architecture

### Core API Endpoints

```
/api/commander/
├── venues/
│   ├── GET    /                     # List venues with commander enabled
│   ├── GET    /:id                  # Venue details + live status
│   ├── POST   /                     # Register new venue (admin)
│   ├── PATCH  /:id                  # Update venue settings
│   └── GET    /:id/analytics        # Venue analytics dashboard
│
├── games/
│   ├── GET    /live                 # All live games (public)
│   ├── GET    /venue/:venueId       # Games at specific venue
│   ├── POST   /                     # Open new game (staff)
│   ├── PATCH  /:id                  # Update game status (staff)
│   ├── DELETE /:id                  # Close game (staff)
│   └── POST   /:id/balance          # Trigger table balance (staff)
│
├── waitlist/
│   ├── GET    /venue/:venueId       # Current waitlists at venue
│   ├── GET    /my                   # User's active waitlist positions
│   ├── POST   /join                 # Join a waitlist
│   ├── DELETE /:id                  # Leave waitlist
│   ├── POST   /:id/call             # Call player for seat (staff)
│   ├── POST   /:id/seat             # Seat player (staff)
│   └── POST   /:id/pass             # Player passed on seat (staff)
│
├── tournaments/
│   ├── GET    /                     # List tournaments (filters)
│   ├── GET    /:id                  # Tournament details + live clock
│   ├── GET    /:id/clock            # Live clock data (WebSocket friendly)
│   ├── GET    /:id/entries          # Registration list
│   ├── POST   /                     # Create tournament (staff)
│   ├── PATCH  /:id                  # Update tournament (staff)
│   ├── POST   /:id/register         # Register for tournament
│   ├── DELETE /:id/register         # Cancel registration
│   ├── POST   /:id/start            # Start tournament (staff)
│   ├── POST   /:id/pause            # Pause clock (staff)
│   ├── POST   /:id/resume           # Resume clock (staff)
│   ├── POST   /:id/next-level       # Advance level (staff)
│   ├── POST   /:id/eliminate        # Eliminate player (staff)
│   └── POST   /:id/payout           # Record payout (staff)
│
├── home-games/
│   ├── GET    /                     # Browse home games (public)
│   ├── GET    /my                   # User's home games (hosted & attending)
│   ├── GET    /:id                  # Home game details
│   ├── POST   /                     # Create home game
│   ├── PATCH  /:id                  # Update home game
│   ├── DELETE /:id                  # Cancel home game
│   ├── POST   /:id/rsvp             # Request to join
│   ├── PATCH  /:id/rsvp/:rsvpId     # Approve/decline RSVP (host)
│   ├── POST   /:id/review           # Leave review
│   └── GET    /:id/reviews          # Get reviews
│
├── notifications/
│   ├── GET    /my                   # User's notifications
│   ├── POST   /send                 # Send notification (staff/system)
│   ├── PATCH  /:id/read             # Mark as read
│   └── POST   /subscribe            # Subscribe to push notifications
│
├── promotions/
│   ├── GET    /venue/:venueId       # Active promotions at venue
│   ├── GET    /active               # All active promotions (public)
│   ├── POST   /                     # Create promotion (staff)
│   ├── PATCH  /:id                  # Update promotion (staff)
│   ├── POST   /:id/winner           # Record winner (staff)
│   └── GET    /:id/winners          # Get promotion winners
│
├── staff/
│   ├── GET    /venue/:venueId       # List staff at venue
│   ├── POST   /                     # Add staff member (manager)
│   ├── PATCH  /:id                  # Update staff role/permissions
│   ├── DELETE /:id                  # Remove staff member
│   └── POST   /verify-pin           # Verify staff PIN for actions
│
├── analytics/
│   ├── GET    /venue/:venueId/daily     # Daily metrics
│   ├── GET    /venue/:venueId/trends    # Trend analysis
│   ├── GET    /venue/:venueId/players   # Player insights
│   └── GET    /global                    # Network-wide stats (admin)
│
└── webhooks/
    ├── POST   /twilio/status        # SMS delivery status
    └── POST   /stripe/events        # Payment events (if applicable)
```

### Real-Time WebSocket Events

```javascript
// Socket.io / Supabase Realtime channels

// Venue-specific channel
channel: `commander:venue:${venueId}`
events:
  - game:opened          // New game started
  - game:closed          // Game ended
  - game:updated         // Player count changed
  - waitlist:updated     // Waitlist position changes
  - waitlist:called      // Player called for seat
  - promotion:winner     // High hand/promotion winner
  - announcement         // General announcement

// Tournament-specific channel
channel: `commander:tournament:${tournamentId}`
events:
  - clock:tick           // Every second (level time remaining)
  - level:changed        // New level started
  - break:started        // Break began
  - break:ended          // Break ended
  - player:eliminated    // Player busted
  - player:chiplead      // New chip leader
  - final_table          // Final table reached
  - winner               // Tournament completed

// User-specific channel
channel: `commander:user:${userId}`
events:
  - seat:available       // Seat available for user
  - waitlist:position    // Position updated
  - tournament:starting  // Registered tournament starting soon
  - home_game:rsvp       // RSVP status change
  - notification         // General notification
```

---

## Part 5: Smarter.Poker Integration Strategy

### The Funnel Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        USER ACQUISITION FUNNEL                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ENTRY POINTS (Free)                                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │ Club Waitlist  │  │  Home Game     │  │  Tournament    │            │
│  │ Signup         │  │  RSVP          │  │  Registration  │            │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘            │
│          │                   │                   │                      │
│          └───────────────────┴───────────────────┘                      │
│                              │                                          │
│                              ▼                                          │
│                    ┌─────────────────┐                                  │
│                    │ REQUIRE         │                                  │
│                    │ SMARTER.POKER   │  ◄── Gate all actions behind    │
│                    │ ACCOUNT         │      free account creation       │
│                    └────────┬────────┘                                  │
│                             │                                           │
│                             ▼                                           │
│                    ┌─────────────────┐                                  │
│                    │ VERIFIED USER   │                                  │
│                    │ (Email + Phone) │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│          ┌──────────────────┼──────────────────┐                       │
│          │                  │                  │                        │
│          ▼                  ▼                  ▼                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│  │ Play at Clubs │  │ Host/Join     │  │ Free Training │              │
│  │ (Earn XP)     │  │ Home Games    │  │ (GodMode Demo)│              │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘              │
│          │                  │                  │                        │
│          └──────────────────┴──────────────────┘                       │
│                             │                                           │
│                             ▼                                           │
│                    ┌─────────────────┐                                  │
│                    │ ENGAGED USER    │                                  │
│                    │ XP + Diamonds   │                                  │
│                    │ Social Proof    │                                  │
│                    └────────┬────────┘                                  │
│                             │                                           │
│  MONETIZATION               │                                           │
│          ┌──────────────────┼──────────────────┐                       │
│          │                  │                  │                        │
│          ▼                  ▼                  ▼                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│  │ GodMode Pro   │  │ Marketplace   │  │ Premium       │              │
│  │ Subscription  │  │ Purchases     │  │ Features      │              │
│  │ $19.99/mo     │  │ Diamonds      │  │ Coaching      │              │
│  └───────────────┘  └───────────────┘  └───────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### XP & Rewards Integration

```javascript
// XP earning events from Commander activities
const COMMANDER_XP_EVENTS = {
  // Club Activities
  'waitlist.joined': 5,
  'game.seated': 25,
  'session.hour_played': 10,      // Per hour
  'session.completed': 50,
  'tournament.registered': 15,
  'tournament.cashed': 100,
  'tournament.won': 500,

  // Home Games
  'home_game.created': 25,
  'home_game.hosted': 100,
  'home_game.attended': 50,
  'home_game.reviewed': 15,
  'home_game.five_star_host': 200,

  // Social
  'player.referred': 250,         // New user signup via referral
  'review.left': 10,
  'profile.verified': 100,

  // Milestones
  'milestone.10_sessions': 500,
  'milestone.50_sessions': 2500,
  'milestone.100_sessions': 10000,
  'milestone.first_tournament_win': 1000,
};

// Diamond earning (premium currency)
const COMMANDER_DIAMOND_EVENTS = {
  'session.completed': 5,
  'tournament.cashed': 25,
  'tournament.won': 100,
  'home_game.hosted': 10,
  'home_game.five_star': 50,
  'streak.7_day': 25,
  'streak.30_day': 100,
};
```

### Data Sharing Between Systems

```
COMMANDER → SMARTER.POKER:
├── User session history (venues visited, hours played)
├── Tournament results (finishes, payouts)
├── Home game participation
├── Comp dollars earned
├── Player ratings/reviews
└── Activity for XP/Diamond calculation

SMARTER.POKER → COMMANDER:
├── User profile data
├── Verification status
├── Skill tier (for matchmaking)
├── Friends list (for home game suggestions)
├── Training progress (for table talk/recommendations)
└── Premium status (unlock features)
```

---

## Part 6: Pricing Strategy

### Tier Structure

| Tier | Monthly Cost | Target | Features |
|------|-------------|--------|----------|
| **Free** | $0 | Home games, small clubs (<3 tables) | Basic waitlist, 1 tournament/day, home games unlimited, Smarter.Poker branding |
| **Starter** | $49 | Small clubs (3-6 tables) | Remove branding, 5 tournaments/day, basic analytics, email support |
| **Pro** | $149 | Medium clubs (7-15 tables) | Unlimited tournaments, SMS notifications (500/mo), advanced analytics, priority support |
| **Enterprise** | $299+ | Large rooms (15+ tables) | Unlimited everything, API access, custom integrations, dedicated support, white-label options |

### Why This Works

1. **Free tier is genuinely useful** - Home games and small clubs can fully operate
2. **Low barrier to entry** - $49/mo vs PokerAtlas's custom pricing (likely $500+/mo)
3. **Value scales with usage** - Larger rooms need more features anyway
4. **Hidden value** - All tiers drive users to Smarter.Poker (worth far more than subscription revenue)

### Cost Analysis

```
ESTIMATED COSTS PER VENUE:
├── Supabase (database/realtime): ~$0.50-5/mo per venue
├── SMS notifications (Twilio): ~$0.01/message
├── Push notifications (FCM): Free
├── Hosting (Vercel): ~$0.10-1/mo per venue
└── Support overhead: ~$5-20/mo per venue

BREAK-EVEN: ~$10-30/mo per venue
PROFIT MARGIN: 60-90% on paid tiers

BUT THE REAL VALUE:
├── Cost per acquired user (traditional): $5-50
├── Users per venue per month: 50-500
├── Value of users acquired: $250-25,000/venue/month
└── ROI: 1000%+ even giving software away
```

---

## Part 7: Build Phases

### Phase 1: Foundation (Weeks 1-4)
**Goal: Core infrastructure + Basic waitlist**

```
Week 1-2: Database & API
├── [ ] Set up Supabase schema (commander tables)
├── [ ] Create API routes structure
├── [ ] Implement authentication/authorization
├── [ ] Staff role management
└── [ ] Basic venue CRUD

Week 3-4: Waitlist MVP
├── [ ] Waitlist join/leave functionality
├── [ ] Staff terminal for managing waitlist
├── [ ] Real-time updates via Supabase
├── [ ] SMS notification integration (Twilio)
├── [ ] Player mobile view
└── [ ] Integration with existing Smarter.Poker auth
```

**Deliverable: Working waitlist system for 1 pilot venue**

### Phase 2: Cash Games (Weeks 5-8)
**Goal: Complete cash game management**

```
Week 5-6: Table Management
├── [ ] Table creation/configuration
├── [ ] Game opening/closing
├── [ ] Seat management
├── [ ] Player seating workflow
└── [ ] Must-move game support

Week 7-8: Enhanced Features
├── [ ] AI wait time estimation
├── [ ] Table balancing recommendations
├── [ ] Session tracking
├── [ ] Comp rate calculations
├── [ ] XP/Diamond integration
└── [ ] Floor map visualization
```

**Deliverable: Full cash game management ready for production**

### Phase 3: Tournaments (Weeks 9-12)
**Goal: Complete tournament management**

```
Week 9-10: Tournament Core
├── [ ] Tournament creation wizard
├── [ ] Blind structure builder
├── [ ] Registration system
├── [ ] Clock management
└── [ ] Payout calculator

Week 11-12: Tournament Operations
├── [ ] Live clock display
├── [ ] Table/seat assignments
├── [ ] Elimination tracking
├── [ ] Chip count updates
├── [ ] Results/leaderboards
└── [ ] Mobile tournament view
```

**Deliverable: Tournament system competitive with PokerAtlas**

### Phase 4: Home Games (Weeks 13-16)
**Goal: Launch home games market**

```
Week 13-14: Home Game Core
├── [ ] Home game creation
├── [ ] Discovery/search
├── [ ] RSVP system
├── [ ] Host approval workflow
└── [ ] Location privacy controls

Week 15-16: Trust & Safety
├── [ ] Player/host ratings
├── [ ] Review system
├── [ ] Verification badges
├── [ ] Reporting/moderation
├── [ ] Host analytics
└── [ ] Recurring game support
```

**Deliverable: First-to-market home games platform**

### Phase 5: Promotions & Analytics (Weeks 17-20)
**Goal: Advanced features for competitive edge**

```
Week 17-18: Promotions
├── [ ] High hand tracking
├── [ ] Bad beat jackpots
├── [ ] Promotion builder
├── [ ] Winner verification
├── [ ] Progressive pools
└── [ ] Marketing broadcasts

Week 19-20: Analytics & Reporting
├── [ ] Real-time dashboards
├── [ ] Historical reports
├── [ ] Player insights
├── [ ] Predictive analytics
├── [ ] Export capabilities
└── [ ] Network-wide stats
```

**Deliverable: Feature-complete platform exceeding PokerAtlas**

### Phase 6: Scale & Polish (Weeks 21-24)
**Goal: Production hardening and launch**

```
Week 21-22: Performance & Security
├── [ ] Load testing
├── [ ] Security audit
├── [ ] Rate limiting
├── [ ] Error monitoring (Sentry)
├── [ ] Performance optimization
└── [ ] Backup/recovery testing

Week 23-24: Launch Preparation
├── [ ] Documentation
├── [ ] Training materials
├── [ ] Support systems
├── [ ] Marketing site
├── [ ] Onboarding flow
└── [ ] Pilot program expansion
```

**Deliverable: Production-ready platform**

---

## Part 8: Technical Implementation Details

### 8.1 File Structure (New)

```
/pages/api/commander/
├── venues/
│   ├── index.js              # GET list, POST create
│   ├── [id].js               # GET, PATCH, DELETE venue
│   └── [id]/
│       ├── analytics.js      # Venue analytics
│       ├── staff.js          # Staff management
│       └── settings.js       # Venue settings
├── games/
│   ├── index.js              # POST create game
│   ├── live.js               # GET all live games
│   ├── venue/[venueId].js    # GET games at venue
│   └── [id].js               # GET, PATCH, DELETE game
├── waitlist/
│   ├── index.js              # POST join waitlist
│   ├── my.js                 # GET user's waitlists
│   ├── venue/[venueId].js    # GET venue waitlists
│   └── [id]/
│       ├── index.js          # DELETE leave
│       ├── call.js           # POST call player
│       └── seat.js           # POST seat player
├── tournaments/
│   ├── index.js              # GET list, POST create
│   ├── [id]/
│   │   ├── index.js          # GET, PATCH tournament
│   │   ├── clock.js          # GET live clock
│   │   ├── register.js       # POST/DELETE registration
│   │   ├── entries.js        # GET entries
│   │   ├── control.js        # POST start/pause/resume
│   │   └── eliminate.js      # POST eliminate player
├── home-games/
│   ├── index.js              # GET browse, POST create
│   ├── my.js                 # GET user's home games
│   └── [id]/
│       ├── index.js          # GET, PATCH, DELETE
│       ├── rsvp.js           # POST request, PATCH approve
│       └── reviews.js        # GET, POST reviews
├── notifications/
│   ├── my.js                 # GET user notifications
│   ├── send.js               # POST send notification
│   └── subscribe.js          # POST push subscription
├── promotions/
│   ├── index.js              # GET active, POST create
│   ├── venue/[venueId].js    # GET venue promotions
│   └── [id]/
│       ├── index.js          # GET, PATCH promotion
│       └── winners.js        # GET, POST winners
└── webhooks/
    ├── twilio.js             # SMS status callbacks
    └── stripe.js             # Payment callbacks

/pages/hub/
├── commander/
│   ├── index.js              # Player dashboard
│   ├── venue/[id].js         # Venue detail/waitlists
│   ├── tournament/[id].js    # Tournament detail/clock
│   ├── home-games/
│   │   ├── index.js          # Browse home games
│   │   ├── create.js         # Create home game
│   │   ├── my.js             # My home games
│   │   └── [id].js           # Home game detail
│   └── notifications.js      # Notification center

/pages/commander/                 # Staff-facing routes
├── login.js                    # Staff login (PIN)
├── dashboard.js                # Main staff dashboard
├── waitlist.js                 # Waitlist management
├── tables.js                   # Table management
├── tournament/
│   ├── index.js               # Tournament list
│   ├── create.js              # Create tournament
│   └── [id].js                # Tournament control
├── promotions.js               # Promotion management
├── players.js                  # Player lookup
├── reports.js                  # Analytics/reports
└── settings.js                 # Venue settings

/src/components/commander/
├── player/
│   ├── WaitlistCard.jsx
│   ├── VenueCard.jsx
│   ├── TournamentCard.jsx
│   ├── HomeGameCard.jsx
│   ├── LiveClock.jsx
│   └── NotificationToast.jsx
├── staff/
│   ├── GameGrid.jsx
│   ├── WaitlistManager.jsx
│   ├── SeatPicker.jsx
│   ├── TournamentClock.jsx
│   ├── PlayerSearch.jsx
│   └── QuickActions.jsx
├── home-games/
│   ├── CreateGameForm.jsx
│   ├── RSVPManager.jsx
│   ├── PlayerRating.jsx
│   └── GameCalendar.jsx
└── shared/
    ├── BlindStructureEditor.jsx
    ├── PayoutCalculator.jsx
    ├── ChipStackDisplay.jsx
    └── FloorMap.jsx

/src/stores/
├── commanderStore.js            # Main commander state
├── waitlistStore.js           # Waitlist state
├── tournamentStore.js         # Tournament state
├── homeGameStore.js           # Home games state
└── notificationStore.js       # Notifications

/src/lib/commander/
├── notifications.ts           # Twilio/FCM integration
├── analytics.ts               # Analytics helpers
├── waitTime.ts                # AI wait time estimation
├── tableBalance.ts            # Table balancing logic
├── tournamentClock.ts         # Clock management
└── permissions.ts             # Role-based access
```

### 8.2 Real-Time Architecture

```typescript
// /src/lib/commander/realtime.ts

import { supabase } from '../supabase';

export class CommanderRealtime {
  private channels: Map<string, any> = new Map();

  // Subscribe to venue updates
  subscribeToVenue(venueId: string, callbacks: {
    onGameUpdate?: (game: any) => void;
    onWaitlistUpdate?: (waitlist: any) => void;
    onPromotion?: (promo: any) => void;
    onAnnouncement?: (msg: string) => void;
  }) {
    const channel = supabase
      .channel(`commander:venue:${venueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commander_games',
        filter: `venue_id=eq.${venueId}`
      }, (payload) => {
        callbacks.onGameUpdate?.(payload.new);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commander_waitlist',
        filter: `venue_id=eq.${venueId}`
      }, (payload) => {
        callbacks.onWaitlistUpdate?.(payload.new);
      })
      .subscribe();

    this.channels.set(`venue:${venueId}`, channel);
    return () => this.unsubscribe(`venue:${venueId}`);
  }

  // Subscribe to tournament clock
  subscribeToTournament(tournamentId: string, callbacks: {
    onClockTick?: (data: { level: number; secondsRemaining: number }) => void;
    onLevelChange?: (level: number) => void;
    onElimination?: (player: any) => void;
  }) {
    const channel = supabase
      .channel(`commander:tournament:${tournamentId}`)
      .on('broadcast', { event: 'clock:tick' }, ({ payload }) => {
        callbacks.onClockTick?.(payload);
      })
      .on('broadcast', { event: 'level:changed' }, ({ payload }) => {
        callbacks.onLevelChange?.(payload.level);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'commander_tournament_entries',
        filter: `tournament_id=eq.${tournamentId}`
      }, (payload) => {
        if (payload.new.status === 'eliminated') {
          callbacks.onElimination?.(payload.new);
        }
      })
      .subscribe();

    this.channels.set(`tournament:${tournamentId}`, channel);
    return () => this.unsubscribe(`tournament:${tournamentId}`);
  }

  // Subscribe to user's personal notifications
  subscribeToUser(userId: string, callbacks: {
    onSeatAvailable?: (data: any) => void;
    onNotification?: (notification: any) => void;
  }) {
    const channel = supabase
      .channel(`commander:user:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'commander_notifications',
        filter: `player_id=eq.${userId}`
      }, (payload) => {
        if (payload.new.notification_type === 'seat_available') {
          callbacks.onSeatAvailable?.(payload.new);
        }
        callbacks.onNotification?.(payload.new);
      })
      .subscribe();

    this.channels.set(`user:${userId}`, channel);
    return () => this.unsubscribe(`user:${userId}`);
  }

  private unsubscribe(key: string) {
    const channel = this.channels.get(key);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(key);
    }
  }

  unsubscribeAll() {
    this.channels.forEach((_, key) => this.unsubscribe(key));
  }
}

export const commanderRealtime = new CommanderRealtime();
```

### 8.3 Notification Service

```typescript
// /src/lib/commander/notifications.ts

import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

interface NotificationPayload {
  userId?: string;
  phone?: string;
  venueId: string;
  type: 'seat_available' | 'tournament_starting' | 'called_for_seat' | 'promotion' | 'custom';
  title?: string;
  message: string;
  channels: ('sms' | 'push' | 'in_app')[];
  metadata?: Record<string, any>;
}

export async function sendNotification(payload: NotificationPayload) {
  const results = {
    sms: null as any,
    push: null as any,
    inApp: null as any,
  };

  // SMS via Twilio
  if (payload.channels.includes('sms') && payload.phone) {
    try {
      results.sms = await twilioClient.messages.create({
        body: payload.message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: payload.phone,
        statusCallback: `${process.env.NEXT_PUBLIC_URL}/api/commander/webhooks/twilio`
      });
    } catch (error) {
      console.error('SMS failed:', error);
    }
  }

  // Push notification via FCM
  if (payload.channels.includes('push') && payload.userId) {
    try {
      results.push = await sendPushNotification(payload.userId, {
        title: payload.title || 'Club Commander',
        body: payload.message,
        data: payload.metadata
      });
    } catch (error) {
      console.error('Push failed:', error);
    }
  }

  // In-app notification (database insert triggers realtime)
  if (payload.channels.includes('in_app') && payload.userId) {
    const { data, error } = await supabase
      .from('commander_notifications')
      .insert({
        venue_id: payload.venueId,
        player_id: payload.userId,
        notification_type: payload.type,
        channel: 'in_app',
        title: payload.title,
        message: payload.message,
        metadata: payload.metadata,
        status: 'delivered'
      });

    results.inApp = data;
  }

  return results;
}

// Pre-built notification templates
export const notificationTemplates = {
  seatAvailable: (venueName: string, gameType: string) => ({
    title: 'Seat Available!',
    message: `Your seat is ready at ${venueName} for ${gameType}. Please check in within 5 minutes.`
  }),

  tournamentStarting: (tournamentName: string, minutes: number) => ({
    title: 'Tournament Starting Soon',
    message: `${tournamentName} starts in ${minutes} minutes. Please be seated.`
  }),

  positionUpdate: (position: number, gameType: string) => ({
    title: 'Waitlist Update',
    message: `You are now #${position} for ${gameType}.`
  }),

  homeGameApproved: (gameName: string, hostName: string) => ({
    title: 'You\'re In!',
    message: `${hostName} approved you for ${gameName}. Check the app for details.`
  })
};
```

---

## Part 9: Competitive Advantages Summary

### vs PokerAtlas

| Aspect | PokerAtlas | Club Commander | Advantage |
|--------|-------------|-----------------|-----------|
| **Price** | Custom ($500+/mo est.) | $0-149/mo | 70-100% cheaper |
| **Home Games** | None | Full suite | New market |
| **Player Base** | 6M passive audience | Active engaged users | Better conversion |
| **Training Integration** | None | GodMode, courses | Added value |
| **Social Features** | Basic | Full social platform | Community |
| **Gamification** | Limited | XP, Diamonds, Tiers | Engagement |
| **Modern Stack** | Legacy | Cloud-native | Faster iteration |
| **API Access** | Limited | Full API | Integrations |

### Moat Building

1. **Network Effects**: More clubs → More players → More clubs
2. **Data Advantage**: Training + playing data = better AI features
3. **Switching Costs**: Players invested in XP/Diamonds/Social
4. **Distribution**: Built-in marketing via Smarter.Poker
5. **Innovation Speed**: Modern stack allows rapid feature development

---

## Part 10: Success Metrics

### Launch Targets (6 months)

| Metric | Target |
|--------|--------|
| Venues using Commander | 50 |
| Monthly active players | 10,000 |
| Home games hosted | 500/month |
| Smarter.Poker signups from Commander | 25,000 |
| Conversion to paid training | 5% |
| NPS Score | >50 |

### Revenue Projections (Year 1)

```
Direct Revenue:
├── Free tier venues: 30 × $0 = $0
├── Starter venues: 15 × $49 = $735/mo
├── Pro venues: 4 × $149 = $596/mo
├── Enterprise venues: 1 × $299 = $299/mo
└── Monthly recurring: $1,630/mo = $19,560/year

Indirect Revenue (via Smarter.Poker):
├── Users acquired: 25,000
├── Training conversion: 5% = 1,250 subscribers
├── Average subscription: $15/mo
├── Monthly value: $18,750/mo = $225,000/year

Total Year 1 Value: ~$245,000
Cost of Commander development: ~$100,000 (engineering time)
ROI: 145%
```

---

## Appendix A: Environment Variables

```env
# Commander-specific
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
FCM_SERVER_KEY=
COMMANDER_WEBHOOK_SECRET=

# Existing Smarter.Poker
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Appendix B: Migration from PokerAtlas

For venues switching from PokerAtlas:

1. **Data Export Assistance**: Help extract player lists, tournament history
2. **Parallel Running**: Run both systems during transition (2-4 weeks)
3. **Staff Training**: On-site or video training for all staff roles
4. **Player Communication**: Email/SMS templates for notifying players
5. **Feature Parity Check**: Ensure all current workflows are supported
6. **Dedicated Support**: Priority support during first 30 days

---

## Document Information

- **Version**: 1.0
- **Created**: January 2026
- **Author**: Smarter.Poker Product Team
- **Status**: Strategic Planning Document
- **Classification**: Internal

---

*"Give away the razor, sell the blades. Give away the software, acquire the users."*
