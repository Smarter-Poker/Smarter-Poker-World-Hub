# Club Commander - Agent Skill

## Overview

Club Commander is Smarter.Poker's poker room management platform designed to compete with and surpass PokerAtlas. It provides cloud-based software for poker clubs, casinos, and home games while serving as a user acquisition funnel for the Smarter.Poker ecosystem.

## Skill Documents

This skill contains comprehensive documentation across multiple reference files:

| Document | Purpose |
|----------|---------|
| `SKILL.md` | This file - overview and quick reference |
| `COMPETITOR_ANALYSIS.md` | Complete PokerAtlas feature analysis |
| `BUILD_PLAN.md` | Core architecture, database, APIs, build phases |
| `ENHANCEMENTS.md` | UI design system, advanced features, AI/ML |
| `DEPLOYMENT.md` | Hardware-as-a-Service, turnkey deployment |
| `EXPANSION.md` | Additional features, integrations, monetization |
| `DATABASE_SCHEMA.sql` | Complete SQL schema for all tables |
| `API_REFERENCE.md` | Full API endpoint documentation |

## Quick Reference

### Business Model

```
Traditional (PokerAtlas): Club pays $500+/mo for software
Club Commander: Club pays $0-149/mo, players MUST create Smarter.Poker account
Result: User acquisition funnel that pays for itself
```

### Core Value Proposition

**For Clubs:**
- Free/cheap software (vs $500+/mo competitors)
- Pre-configured hardware shipped ready to go
- 5-minute setup, no IT required
- Marketing exposure to Smarter.Poker user base

**For Players:**
- One app for waitlists, home games, training
- Earn XP and diamonds by playing
- Never miss a seat (multi-channel notifications)
- Track results, improve game

**For Smarter.Poker:**
- Massive verified user acquisition
- Rich data for AI training features
- Multiple monetization paths
- Network effects compound

### Feature Categories

1. **Cash Game Management** - Waitlists, tables, seating, must-move
2. **Tournament Management** - Registration, clocks, payouts, leaderboards
3. **Home Games** - Create, discover, RSVP, reviews, escrow
4. **Player Features** - Profiles, notifications, friends, achievements
5. **Staff Tools** - Floor terminal, dealer management, incidents
6. **Analytics** - Real-time dashboards, reports, predictions
7. **Integrations** - Casino systems, payments, calendars, streaming

### Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, DaisyUI
- **Backend**: Supabase (PostgreSQL), Next.js API Routes
- **Real-time**: Supabase Realtime (WebSockets)
- **Notifications**: Twilio (SMS), FCM (Push)
- **Deployment**: Vercel, Cloud-based MDM
- **Mobile**: PWA + Native apps (iOS/Android)

### Database Tables (35+)

**Venue Management:**
- `poker_venues` (extended)
- `commander_staff`
- `commander_tables`
- `commander_games`

**Waitlist System:**
- `commander_waitlist`
- `commander_waitlist_history`
- `commander_waitlist_groups`
- `commander_waitlist_group_members`
- `commander_player_preferences`
- `commander_seats`

**Tournaments:**
- `commander_tournaments`
- `commander_tournament_entries`

**Home Games:**
- `commander_home_games`
- `commander_home_game_rsvps`
- `commander_home_game_reviews`
- `commander_escrow_transactions`
- `commander_dealer_marketplace`
- `commander_equipment_rentals`

**Operations:**
- `commander_notifications`
- `commander_promotions`
- `commander_high_hands`
- `commander_player_sessions`
- `commander_service_requests`
- `commander_dealers`
- `commander_dealer_rotations`
- `commander_incidents`

**Analytics & AI:**
- `commander_analytics_daily`
- `commander_wait_time_predictions`
- `commander_player_recommendations`

**Streaming:**
- `commander_streams`
- `commander_hand_history`

**Responsible Gaming:**
- `commander_self_exclusions`
- `commander_spending_limits`

**Network Features:**
- `commander_leagues`
- `commander_league_standings`
- `commander_tax_events`

### API Endpoints (80+)

```
/api/commander/
├── venues/           # Venue management
├── games/            # Cash game management
├── waitlist/         # Waitlist operations
├── tournaments/      # Tournament management
├── home-games/       # Home game features
├── notifications/    # Notification system
├── promotions/       # Promotions & jackpots
├── staff/            # Staff management
├── analytics/        # Reporting & analytics
├── ai/               # AI-powered features
├── squads/           # Group waitlist
├── services/         # In-seat services
├── dealers/          # Dealer management
├── incidents/        # Incident reporting
├── streaming/        # Stream management
├── hands/            # Hand history
├── escrow/           # Payment escrow
├── marketplace/      # Dealer/equipment rental
├── responsible-gaming/ # Self-exclusion, limits
├── leagues/          # Network leagues
└── webhooks/         # External integrations
```

### UI Design System

**Colors (Facebook-inspired):**
- Primary: #1877F2 (Facebook Blue)
- Background: #F9FAFB
- Text: #1F2937
- Success: #10B981
- Warning: #F59E0B
- Error: #EF4444

**Typography:**
- Font: Inter
- Clean, professional, no emojis

**Components:**
- Cards with 8px rounded corners
- Subtle shadows
- Clear state indicators
- Touch-optimized for tablets

### Hardware Deployment

**Device Roles:**
- iPad Pro 12.9" - Floor Station
- iPad 10th Gen - Manager Station
- iPad Mini 6 - Table Display
- Samsung Galaxy Tab - Budget alternatives

**Deployment Packages:**
- Starter: $299/mo (1-3 tables)
- Club: $499/mo (4-8 tables)
- Pro: $799/mo (8-15 tables)
- Enterprise: Custom (15+ tables)

**Pre-Configuration:**
- MDM enrollment
- App pre-installed
- Venue settings loaded
- 5-minute on-site setup

### Build Phases

1. **Phase 1 (Weeks 1-4)**: Database + Waitlist MVP
2. **Phase 2 (Weeks 5-8)**: Cash Game Management
3. **Phase 3 (Weeks 9-12)**: Tournament System
4. **Phase 4 (Weeks 13-16)**: Home Games Module
5. **Phase 5 (Weeks 17-20)**: Promotions & Analytics
6. **Phase 6 (Weeks 21-24)**: Scale & Polish

### Key Differentiators vs PokerAtlas

| Feature | PokerAtlas | Club Commander |
|---------|--------------|-----------------|
| Price | ~$500+/mo | $0-149/mo |
| Home Games | No | Yes |
| Training Integration | No | GodMode |
| AI Predictions | No | Yes |
| Squad Waitlist | No | Yes |
| In-Seat Services | No | Yes |
| Hand History | No | Yes |
| Streaming Integration | No | Yes |
| Developer API | Limited | Full |

### Revenue Model

**Direct Revenue:**
- Software subscriptions: $0-299/mo per venue
- Hardware leases: $299-799/mo packages
- Enterprise white-label: $25K-100K setup

**Indirect Revenue (via Smarter.Poker):**
- Users acquired convert to training subscribers
- Season passes ($9.99-19.99/mo)
- Diamond purchases
- Premium features

### Success Metrics

- 50+ venues in 6 months
- 10,000 monthly active players
- 500 home games/month
- 25,000 Smarter.Poker signups from Commander
- 5% conversion to paid training

## Usage

When working on Club Commander features:

1. Reference `BUILD_PLAN.md` for core architecture decisions
2. Reference `DATABASE_SCHEMA.sql` for table structures
3. Reference `API_REFERENCE.md` for endpoint specifications
4. Reference `ENHANCEMENTS.md` for UI/UX guidelines
5. Reference `DEPLOYMENT.md` for hardware/device considerations
6. Reference `EXPANSION.md` for future feature planning

## File Locations

**Skill Documents:**
```
.agent/skills/club-commander/
├── SKILL.md
├── COMPETITOR_ANALYSIS.md
├── BUILD_PLAN.md
├── ENHANCEMENTS.md
├── DEPLOYMENT.md
├── EXPANSION.md
├── DATABASE_SCHEMA.sql
└── API_REFERENCE.md
```

**Implementation (when built):**
```
/pages/api/commander/          # API routes
/pages/hub/commander/          # Player UI
/pages/commander/              # Staff UI
/src/components/commander/     # React components
/src/stores/commanderStore.js  # Zustand state
/src/lib/commander/            # Utilities
/supabase/migrations/        # Database migrations
```

## Contact

For questions about Club Commander implementation, reference these skill documents or consult the comprehensive planning files in the repository root.
