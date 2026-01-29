# Club Commander - Enhanced Features & Design System

## Part 1: UI Design System

### Color Palette (Facebook-Inspired Professional)

```css
:root {
  /* Primary Blues */
  --primary-50: #EBF5FF;
  --primary-100: #E1EFFE;
  --primary-200: #C3DDFD;
  --primary-300: #A4CAFE;
  --primary-400: #76A9FA;
  --primary-500: #1877F2;    /* Facebook Blue - Primary Action */
  --primary-600: #1A56DB;
  --primary-700: #1E40AF;
  --primary-800: #1E3A8A;
  --primary-900: #1E3A5F;

  /* Neutrals */
  --gray-50: #F9FAFB;        /* Background */
  --gray-100: #F3F4F6;       /* Card Background */
  --gray-200: #E5E7EB;       /* Borders */
  --gray-300: #D1D5DB;       /* Disabled */
  --gray-400: #9CA3AF;       /* Placeholder */
  --gray-500: #6B7280;       /* Secondary Text */
  --gray-600: #4B5563;       /* Body Text */
  --gray-700: #374151;       /* Headings */
  --gray-800: #1F2937;       /* Primary Text */
  --gray-900: #111827;       /* Dark Mode Background */

  /* Status Colors */
  --success-50: #ECFDF5;
  --success-500: #10B981;    /* Green - Success/Available */
  --success-600: #059669;

  --warning-50: #FFFBEB;
  --warning-500: #F59E0B;    /* Amber - Warning/Waiting */
  --warning-600: #D97706;

  --error-50: #FEF2F2;
  --error-500: #EF4444;      /* Red - Error/Full */
  --error-600: #DC2626;

  /* Accent */
  --accent-500: #8B5CF6;     /* Purple - Premium/Pro Features */
}
```

### Typography

```css
/* Font Stack - Clean, Professional */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs: 0.75rem;      /* 12px - Labels, timestamps */
--text-sm: 0.875rem;     /* 14px - Secondary text */
--text-base: 1rem;       /* 16px - Body text */
--text-lg: 1.125rem;     /* 18px - Emphasized text */
--text-xl: 1.25rem;      /* 20px - Card titles */
--text-2xl: 1.5rem;      /* 24px - Section headers */
--text-3xl: 1.875rem;    /* 30px - Page titles */
--text-4xl: 2.25rem;     /* 36px - Hero text */

/* Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Component Design Principles

1. **Cards**: Rounded corners (8px), subtle shadow, white background
2. **Buttons**: Solid fills for primary, outlined for secondary, no gradients
3. **Icons**: Lucide icon set, 20px standard size, single color
4. **Spacing**: 8px base unit (8, 16, 24, 32, 48)
5. **Borders**: 1px solid gray-200, rounded-lg (8px)
6. **Shadows**: Subtle, single layer (0 1px 3px rgba(0,0,0,0.1))
7. **States**: Clear hover, focus, active, disabled states
8. **Motion**: Subtle, 150-200ms transitions, ease-out curves

### UI Component Examples

#### Waitlist Card (Player View)

```
+----------------------------------------------------------+
|                                                          |
|  1/3 No-Limit Hold'em                                    |
|  The Lodge Card Club                                     |
|                                                          |
|  +--------------------------------------------------+   |
|  |  Your Position          Estimated Wait           |   |
|  |       #3                   ~12 min               |   |
|  +--------------------------------------------------+   |
|                                                          |
|  [||||||||||||||||................] 67%                  |
|                                                          |
|  Players ahead: 2  |  Tables running: 3                  |
|                                                          |
|  +--------------------+  +------------------------+      |
|  |   Leave Waitlist   |  |   Change to 2/5 NLH    |      |
|  +--------------------+  +------------------------+      |
|                                                          |
+----------------------------------------------------------+
```

#### Staff Dashboard Header

```
+------------------------------------------------------------------+
|                                                                  |
|  CLUB COMMANDER                              The Lodge Card Club|
|                                                                  |
|  +----------+  +----------+  +----------+  +----------+          |
|  | Tables   |  | Waitlist |  | Tourneys |  | Players  |    [MK]  |
|  |    8     |  |    14    |  |    2     |  |    67    |   Staff  |
|  | Running  |  | Waiting  |  | Today    |  | Active   |          |
|  +----------+  +----------+  +----------+  +----------+          |
|                                                                  |
+------------------------------------------------------------------+
```

#### Table Status Grid

```
+------------------+  +------------------+  +------------------+
|  Table 1         |  |  Table 2         |  |  Table 3         |
|  1/3 NLH         |  |  1/3 NLH         |  |  2/5 NLH         |
|                  |  |                  |  |                  |
|  [=========]     |  |  [=========]     |  |  [=======..]     |
|  9/9 FULL        |  |  9/9 FULL        |  |  7/9             |
|                  |  |                  |  |                  |
|  Running 2h 34m  |  |  Running 1h 12m  |  |  Running 45m     |
+------------------+  +------------------+  +------------------+
```

---

## Part 2: Advanced Features Beyond TableCaptain

### 2.1 AI-Powered Intelligence

#### Predictive Wait Time Engine

```typescript
interface WaitTimePrediction {
  estimatedMinutes: number;
  confidence: number;           // 0-1
  factors: {
    historicalAverage: number;
    currentTurnover: number;
    timeOfDay: number;
    dayOfWeek: number;
    specialEvents: number;
  };
  recommendation?: string;      // "Consider 2/5 NLH - shorter wait"
}
```

**How it works:**
- Analyzes historical session lengths by game type, stakes, time of day
- Tracks real-time table turnover rates
- Factors in special events, holidays, tournament schedules
- Learns patterns specific to each venue
- Improves accuracy over time with ML feedback loops

#### Smart Game Recommendations

```typescript
interface GameRecommendation {
  gameType: string;
  stakes: string;
  reason: string;
  waitTime: number;
  matchScore: number;          // How well this matches player's history
}

// Example output for a player
recommendations: [
  {
    gameType: "NLH",
    stakes: "2/5",
    reason: "Matches your typical stakes, 8 min shorter wait than 1/3",
    waitTime: 4,
    matchScore: 0.92
  },
  {
    gameType: "PLO",
    stakes: "1/2",
    reason: "You've been improving at PLO in training",
    waitTime: 0,
    matchScore: 0.78
  }
]
```

#### Optimal Table Balancing

AI recommends which players to move when balancing tables:
- Considers time at current table
- Player preferences (if they've requested to stay)
- Social connections (avoid breaking up friends)
- Skill level distribution
- Dealer/player dynamics

#### Player Churn Prediction

Identifies players at risk of not returning:
- Session frequency trending down
- Losing sessions streak
- Shorter session durations
- Reduced engagement with promotions

Enables proactive outreach: personalized offers, check-ins, exclusive invites

---

### 2.2 Player Experience Innovations

#### Digital Player Card

```typescript
interface DigitalPlayerCard {
  playerId: string;
  qrCode: string;              // Rotates every 30 seconds
  nfcEnabled: boolean;

  quickActions: {
    checkIn: boolean;
    joinWaitlist: boolean;
    viewComps: boolean;
    requestCashout: boolean;
  };

  displayInfo: {
    playerName: string;
    memberSince: string;
    tier: string;
    photoUrl?: string;
  };
}
```

**Use cases:**
- Tap phone to check in at kiosk
- Staff scans to instantly seat player
- Show at cage for faster transactions
- Access member-only promotions

#### Seat Selection

When joining waitlist, players can indicate preferences:
- Specific seat numbers (1, 9 for corner seats)
- Left-handed preference
- Near/away from TV
- Away from specific players (discreet)

System attempts to honor preferences when seating.

#### Squad Mode - Join With Friends

```typescript
interface SquadRequest {
  leaderId: string;
  members: string[];           // 2-4 players
  preferSameTable: boolean;
  acceptSplit: boolean;        // OK if we can't all sit together
}
```

Friends can join waitlist together:
- Get seated at same table when possible
- Or at adjacent tables
- Notified together when seats available

#### Table Atmosphere Ratings

After sessions, players rate:
- Action level (1-5): Tight to wild
- Friendliness (1-5): Serious to social
- Pace (1-5): Slow to fast

Aggregated to show "Table Vibe" in app:
- "Action Game" - High aggression, big pots
- "Social Game" - Friendly, recreational players
- "Grinder Table" - Tight, serious players

Helps players find games matching their preference.

#### In-Seat Services

Request from your phone while playing:
- Food & beverage orders
- Chip runner (buy more chips)
- Table change request
- Dealer compliment/feedback
- Floor call request
- Cash-out request (chips counted, ready at cage)

---

### 2.3 Club Operations Advanced

#### Automated Game Starting

System intelligently opens new tables:
- When waitlist hits threshold (e.g., 7 players)
- Based on predicted demand (Friday 6pm = open extra tables early)
- Considers dealer availability
- Sends "Interest Check" to regular players before opening

#### Dealer Management Suite

```typescript
interface DealerSchedule {
  dealerId: string;
  shifts: Shift[];
  tableAssignments: {
    tableId: string;
    startTime: Date;
    endTime: Date;
    gameType: string;
  }[];
  breakSchedule: Break[];
  tipsEarned?: number;         // If venue tracks
  playerRatings: number;       // Average rating from players
}
```

Features:
- Automatic rotation scheduling (30/60 min rounds)
- Break management with coverage
- Skill-based game assignment (best dealers on feature tables)
- Performance tracking
- Tip reporting (optional)

#### Incident Reporting System

```typescript
interface Incident {
  id: string;
  venueId: string;
  reportedBy: string;          // Staff ID
  type: 'dispute' | 'rules_violation' | 'behavior' | 'safety' | 'equipment' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  playersInvolved: string[];
  tableId?: string;
  description: string;
  resolution?: string;
  resolvedBy?: string;
  attachments?: string[];      // Photos, video clips
  createdAt: Date;
  resolvedAt?: Date;
}
```

- Document incidents with photos/video
- Track player history for repeat offenders
- Generate reports for gaming commission
- Flag players across network (serious violations)

#### Shift Handoff Tools

End-of-shift summary auto-generated:
- Tables currently running
- Players on waitlists
- Active promotions/jackpots
- Pending issues
- Notable players present (high rollers, problem players)
- Upcoming tournament prep needed

---

### 2.4 Financial Integration

#### Digital Buy-In System

Partner with payment processors for:
- In-app chip purchases (linked to cage)
- Express cash-out (funds to bank/Venmo/PayPal)
- Credit/marker tracking
- Spending limits (responsible gaming)

#### Tax Compliance Automation

```typescript
interface TaxEvent {
  playerId: string;
  venueId: string;
  eventType: 'tournament_win' | 'jackpot' | 'high_hand';
  grossAmount: number;
  buyIn?: number;
  netAmount: number;
  withholdingRequired: boolean;
  withholdingAmount?: number;
  w2gGenerated: boolean;
  playerAcknowledged: boolean;
  timestamp: Date;
}
```

- Automatic W-2G generation for qualifying wins
- Player signature capture on device
- SSN on file for regular players
- Tax report exports for players and venues

#### Comp Dollar Economy

```typescript
interface CompProgram {
  venueId: string;
  earnRates: {
    cashGame: number;          // $ per hour
    tournamentBuyin: number;   // % of buy-in
  };
  redemptionOptions: {
    food: { rate: number; locations: string[] };
    merchandise: { rate: number; catalog: string };
    freeplay: { rate: number; restrictions: string };
    hotelRooms: { rate: number; availability: string };
  };
  tiers: CompTier[];
}
```

- Earn comp dollars automatically during play
- Redeem in-app at partner restaurants
- Convert to Smarter.Poker diamonds (cross-platform value)
- Tier benefits (priority seating, exclusive events)

---

### 2.5 Streaming & Content Integration

#### One-Click Stream Setup

```typescript
interface StreamConfig {
  venueId: string;
  tableId: string;
  platforms: ('youtube' | 'twitch' | 'facebook')[];
  delayMinutes: number;        // 5-30 min delay
  overlayConfig: {
    showPotSize: boolean;
    showPlayerNames: boolean;
    showChipCounts: boolean;
    brandingLogo: string;
  };
  commentaryEnabled: boolean;
  rfidEnabled: boolean;        // Hole card display
}
```

Features:
- Pre-configured OBS scenes
- Automatic hand detection (RFID)
- AI-generated highlights
- Clip export for social media
- Multi-camera support
- Commentator tools

#### Hand History Capture

Every hand at feature tables logged:
- Hole cards (if RFID)
- Board cards
- Actions and bet sizes
- Pot size
- Showdown results

Players can:
- Review their hands post-session
- Send to GodMode for analysis
- Share notable hands socially
- Track win rates by position/hand

---

### 2.6 Home Games Advanced

#### Secure Buy-In Escrow

```typescript
interface EscrowTransaction {
  homeGameId: string;
  playerId: string;
  amount: number;
  status: 'pending' | 'held' | 'released' | 'refunded';
  paymentMethod: string;
  heldAt: Date;
  releasedAt?: Date;
  releasedTo?: string;         // Host ID
}
```

**Flow:**
1. Players submit buy-in when RSVPing
2. Funds held in escrow until game completion
3. Host confirms attendance
4. Funds released to host (minus small fee)
5. No-shows forfeit deposit

**Benefits:**
- Eliminates no-show problem
- Hosts guaranteed to get paid
- Players protected if game cancelled
- Builds trust for higher stakes

#### Dealer Marketplace

Connect hosts with professional dealers:
- Verified dealers with ratings
- Hourly rates displayed
- Book directly in app
- Dealer handles bank/chips
- Host reviews after game

#### Equipment Rental

Partner with local poker suppliers:
- Professional chip sets
- Folding poker tables
- Card shufflers
- Table felt/layouts
- Delivery & pickup included

---

### 2.7 Network Features

#### Cross-Venue Leaderboards

```typescript
interface NetworkLeaderboard {
  region: string;              // "Texas", "Las Vegas", "National"
  timeframe: 'weekly' | 'monthly' | 'yearly' | 'alltime';
  categories: {
    sessions: LeaderboardEntry[];
    hoursPlayed: LeaderboardEntry[];
    tournamentWins: LeaderboardEntry[];
    tournamentCashes: LeaderboardEntry[];
    venuesVisited: LeaderboardEntry[];
    homeGamesHosted: LeaderboardEntry[];
  };
}
```

Players compete across the network:
- Most sessions in a month
- Most venues visited
- Tournament performance
- Home game hosting achievements

#### Inter-Club Leagues

Venues can organize leagues:
- Weekly tournaments with cumulative points
- Season championships
- Travel events at partner venues
- Prize pools across venues

#### Player Reputation System

```typescript
interface PlayerReputation {
  odentifier: string;
  overallScore: number;        // 1-5
  breakdown: {
    reliability: number;       // Shows up when expected
    sportsmanship: number;     // Handles wins/losses gracefully
    etiquette: number;         // Follows rules, tips dealers
    communication: number;     // Responsive, clear
  };
  reviews: Review[];
  badges: Badge[];
  verifications: {
    idVerified: boolean;
    phoneVerified: boolean;
    paymentVerified: boolean;
    backgroundCheck?: boolean; // Optional, for high-stakes
  };
}
```

---

### 2.8 Training Integration (Smarter.Poker)

#### "Study This Hand" Button

From hand history or during play:
- One tap sends hand to GodMode
- Get solver analysis
- See what GTO would do
- Track leaks over time

#### Skill-Based Suggestions

Based on training progress:
- "Your 3-bet defense improved - try 2/5 tonight"
- "Struggling with PLO? Free PLO course available"
- "Tournament coming up - practice ICM scenarios"

#### Live Coaching Mode

Premium feature:
- Coach watches session remotely (delayed)
- Takes notes on spots
- Post-session review scheduled automatically
- Hand histories synced to coaching platform

---

### 2.9 Hardware Integrations

#### Self-Service Kiosk Mode

```typescript
interface KioskConfig {
  venueId: string;
  deviceId: string;
  features: {
    waitlistSignup: boolean;
    waitlistStatus: boolean;
    tournamentRegistration: boolean;
    playerCardScan: boolean;
    cashierIntegration: boolean;
    promotionDisplay: boolean;
  };
  displayConfig: {
    rotationItems: ('waitlists' | 'tournaments' | 'promotions' | 'leaderboard')[];
    rotationInterval: number;  // seconds
  };
}
```

Tablets in poker room lobby:
- Players sign up without approaching brush
- View waitlist status
- Browse tournaments
- See current promotions

#### Digital Signage Network

Manage all displays from dashboard:
- Waitlist boards
- Tournament clocks
- Promotion displays
- Live stream feeds
- Customizable layouts

#### RFID Integration

Support for RFID-enabled tables:
- Automatic hole card capture
- Hand history without input
- Pot size tracking
- Player stack monitoring
- Streaming overlay automation

---

### 2.10 Responsible Gaming Features

#### Self-Exclusion Tools

```typescript
interface SelfExclusion {
  playerId: string;
  type: 'temporary' | 'permanent';
  duration?: number;           // days
  scope: 'venue' | 'network';
  reason?: string;
  createdAt: Date;
  expiresAt?: Date;
  acknowledged: boolean;
}
```

Players can self-exclude:
- Cool-off periods (24h, 7d, 30d)
- Permanent exclusion
- Network-wide or single venue
- Cannot be overridden by player

#### Spending Limits

- Set daily/weekly/monthly limits
- Buy-in alerts
- Session duration alerts
- Loss limit notifications
- Required breaks after X hours

#### Pattern Detection

AI monitors for concerning patterns:
- Chasing losses (rebuying repeatedly)
- Playing longer than usual
- Stakes escalation
- Emotional tilting indicators

Optional alerts to player or trusted contact.

---

## Part 3: Database Schema Additions

```sql
-- AI Features
CREATE TABLE commander_wait_time_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  game_type TEXT NOT NULL,
  stakes TEXT NOT NULL,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  predicted_minutes INTEGER,
  actual_minutes INTEGER,      -- For ML feedback
  confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_player_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  venue_id UUID REFERENCES poker_venues(id),
  recommendation_type TEXT,    -- 'game', 'stakes', 'venue', 'training'
  recommendation_data JSONB,
  was_followed BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Squad/Group Waitlist
CREATE TABLE commander_waitlist_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID REFERENCES profiles(id),
  venue_id UUID REFERENCES poker_venues(id),
  game_type TEXT,
  stakes TEXT,
  prefer_same_table BOOLEAN DEFAULT true,
  accept_split BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_waitlist_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES commander_waitlist_groups(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  joined_at TIMESTAMPTZ DEFAULT now()
);

-- Seat Preferences
CREATE TABLE commander_player_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) UNIQUE,
  preferred_seats INTEGER[],   -- [1, 9] for corner seats
  left_handed BOOLEAN DEFAULT false,
  avoid_players UUID[],        -- Discreet exclusion list
  table_vibe TEXT,             -- 'action', 'social', 'grinder'
  notification_preferences JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- In-Seat Services
CREATE TABLE commander_service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  table_id UUID REFERENCES commander_tables(id),
  seat_number INTEGER,
  request_type TEXT,           -- 'food', 'chips', 'table_change', 'cashout', 'floor'
  details JSONB,
  status TEXT DEFAULT 'pending',
  assigned_to UUID REFERENCES commander_staff(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Dealer Management
CREATE TABLE commander_dealers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  user_id UUID REFERENCES profiles(id),
  employee_id TEXT,
  skill_level INTEGER,         -- 1-5
  certified_games TEXT[],      -- ['nlh', 'plo', 'mixed', 'stud']
  is_active BOOLEAN DEFAULT true,
  hired_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_dealer_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  dealer_id UUID REFERENCES commander_dealers(id),
  table_id UUID REFERENCES commander_tables(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  tips_reported DECIMAL(10,2)
);

-- Incidents
CREATE TABLE commander_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  reported_by UUID REFERENCES commander_staff(id),
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  players_involved UUID[],
  table_id UUID REFERENCES commander_tables(id),
  description TEXT NOT NULL,
  resolution TEXT,
  resolved_by UUID REFERENCES commander_staff(id),
  attachments TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Financial
CREATE TABLE commander_tax_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  player_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  buy_in DECIMAL(12,2),
  net_amount DECIMAL(12,2),
  withholding_required BOOLEAN DEFAULT false,
  withholding_amount DECIMAL(12,2),
  w2g_generated BOOLEAN DEFAULT false,
  w2g_document_url TEXT,
  player_acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Streaming
CREATE TABLE commander_streams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  table_id UUID REFERENCES commander_tables(id),
  platforms TEXT[],
  stream_keys JSONB,           -- Encrypted
  delay_minutes INTEGER DEFAULT 15,
  overlay_config JSONB,
  status TEXT DEFAULT 'offline',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Hand History
CREATE TABLE commander_hand_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID REFERENCES poker_venues(id),
  table_id UUID REFERENCES commander_tables(id),
  game_id UUID REFERENCES commander_games(id),
  hand_number INTEGER,

  -- Hand data
  player_cards JSONB,          -- { "seat_1": ["As", "Kh"], ... }
  board TEXT[],
  actions JSONB,               -- Array of actions
  pot_size INTEGER,
  winners JSONB,

  -- RFID captured
  rfid_captured BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Home Games Advanced
CREATE TABLE commander_escrow_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_game_id UUID REFERENCES commander_home_games(id),
  player_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  held_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_to UUID REFERENCES profiles(id),
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_dealer_marketplace (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES profiles(id),
  service_area TEXT[],         -- Cities/regions
  hourly_rate DECIMAL(10,2),
  games_offered TEXT[],
  experience_years INTEGER,
  bio TEXT,
  rating DECIMAL(3,2),
  review_count INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT false,
  available_days INTEGER[],    -- 0-6 for days of week
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_equipment_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,               -- 'chips', 'table', 'shuffler', 'cards'
  daily_rate DECIMAL(10,2),
  weekly_rate DECIMAL(10,2),
  service_area TEXT[],
  images TEXT[],
  available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Responsible Gaming
CREATE TABLE commander_self_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id),
  exclusion_type TEXT NOT NULL,
  duration_days INTEGER,
  scope TEXT NOT NULL,         -- 'venue', 'network'
  venue_id UUID REFERENCES poker_venues(id), -- If venue-specific
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  acknowledged BOOLEAN DEFAULT false,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID
);

CREATE TABLE commander_spending_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES profiles(id) UNIQUE,
  daily_limit DECIMAL(10,2),
  weekly_limit DECIMAL(10,2),
  monthly_limit DECIMAL(10,2),
  session_duration_limit INTEGER, -- minutes
  loss_limit DECIMAL(10,2),
  cooling_off_enabled BOOLEAN DEFAULT false,
  alerts_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Network Features
CREATE TABLE commander_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  organizer_id UUID REFERENCES profiles(id),
  venues UUID[],               -- Participating venues
  season_start DATE,
  season_end DATE,
  scoring_system JSONB,
  prize_pool DECIMAL(12,2),
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE commander_league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES commander_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES profiles(id),
  points INTEGER DEFAULT 0,
  events_played INTEGER DEFAULT 0,
  cashes INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  earnings DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_wait_predictions_venue ON commander_wait_time_predictions(venue_id, game_type, stakes);
CREATE INDEX idx_hand_history_player ON commander_hand_history USING GIN (player_cards);
CREATE INDEX idx_incidents_venue ON commander_incidents(venue_id, created_at);
CREATE INDEX idx_escrow_status ON commander_escrow_transactions(status);
CREATE INDEX idx_exclusions_player ON commander_self_exclusions(player_id, expires_at);
```

---

## Part 4: API Additions

```
/api/commander/
├── ai/
│   ├── wait-time/[venueId]              # GET predicted wait times
│   ├── recommendations/[playerId]        # GET game recommendations
│   └── table-balance/[venueId]          # GET balancing suggestions
│
├── squads/
│   ├── index                            # POST create squad
│   ├── [id]                             # GET, DELETE squad
│   └── [id]/join                        # POST join squad
│
├── services/
│   ├── request                          # POST service request
│   └── my                               # GET my pending requests
│
├── dealers/
│   ├── index                            # GET list, POST add dealer
│   ├── [id]                             # PATCH, DELETE dealer
│   ├── rotations                        # GET/POST rotations
│   └── schedule                         # GET/POST schedule
│
├── incidents/
│   ├── index                            # GET list, POST create
│   ├── [id]                             # GET, PATCH incident
│   └── [id]/resolve                     # POST resolve
│
├── streaming/
│   ├── [tableId]/start                  # POST start stream
│   ├── [tableId]/stop                   # POST stop stream
│   └── [tableId]/config                 # GET, PATCH config
│
├── hands/
│   ├── [gameId]                         # GET hands from game
│   ├── [handId]                         # GET single hand
│   └── [handId]/analyze                 # POST send to GodMode
│
├── escrow/
│   ├── deposit                          # POST create deposit
│   ├── [id]/release                     # POST release funds
│   └── [id]/refund                      # POST refund
│
├── marketplace/
│   ├── dealers                          # GET available dealers
│   ├── dealers/[id]/book                # POST book dealer
│   ├── equipment                        # GET available equipment
│   └── equipment/[id]/rent              # POST rent equipment
│
├── responsible-gaming/
│   ├── exclusion                        # POST self-exclude
│   ├── limits                           # GET, PUT spending limits
│   └── check/[playerId]                 # GET check if excluded
│
└── leagues/
    ├── index                            # GET leagues
    ├── [id]                             # GET league details
    ├── [id]/standings                   # GET standings
    └── [id]/join                        # POST join league
```

---

## Part 5: Competitive Moat Summary

### What Makes This Unbeatable

| Feature | TableCaptain | Bravo | Club Commander |
|---------|--------------|-------|-----------------|
| AI Wait Time Prediction | No | No | Yes |
| Game Recommendations | No | No | Yes |
| Squad/Friends Waitlist | No | No | Yes |
| In-Seat Service Requests | No | No | Yes |
| Hand History + Analysis | No | No | Yes |
| Training Integration | No | No | Yes |
| Home Games Platform | No | No | Yes |
| Dealer Marketplace | No | No | Yes |
| Equipment Rentals | No | No | Yes |
| Buy-In Escrow | No | No | Yes |
| Cross-Venue Leagues | No | No | Yes |
| Responsible Gaming Suite | Basic | Basic | Comprehensive |
| Streaming Integration | No | No | Yes |
| RFID Support | Limited | Limited | Full |
| Network Leaderboards | No | No | Yes |

### The Unfair Advantage

1. **Data Moat**: Every hand, every session feeds ML models
2. **Network Effects**: More venues = more players = more venues
3. **Ecosystem Lock-in**: XP, diamonds, training progress, social connections
4. **Price Disruption**: Free/cheap vs. expensive incumbents
5. **Innovation Velocity**: Modern stack allows rapid feature shipping
6. **Cross-Platform Value**: Training data improves game, game data improves training

---

## Document Information

- **Version**: 1.0
- **Created**: January 2026
- **Purpose**: Enhancement specification for Club Commander
- **Status**: Strategic Planning
