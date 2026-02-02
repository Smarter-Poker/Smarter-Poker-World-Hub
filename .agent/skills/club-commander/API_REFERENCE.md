# Club Commander - API Reference

## Overview

All API endpoints are located under `/api/commander/`. Authentication is handled via Supabase Auth with JWT tokens.

## Base URL

```
Production: https://smarter.poker/api/commander
Development: http://localhost:3000/api/commander
```

## Authentication

All endpoints require authentication unless marked as `[Public]`.

```typescript
// Header format
Authorization: Bearer <supabase_jwt_token>
```

## Response Format

```typescript
// Success response
{
  success: true,
  data: <response_data>
}

// Error response
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  }
}
```

---

## Venues

### List Venues
```
GET /venues
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `commander_enabled` | boolean | Filter by Commander status |
| `state` | string | Filter by state |
| `city` | string | Filter by city |
| `lat` | number | GPS latitude for distance |
| `lng` | number | GPS longitude for distance |
| `radius` | number | Search radius in km |
| `limit` | number | Max results (default: 50) |

**Response:**
```typescript
{
  venues: Venue[],
  total: number
}
```

### Get Venue Details
```
GET /venues/:id
```

**Response:**
```typescript
{
  venue: Venue,
  currentGames: Game[],
  waitlists: WaitlistSummary[],
  todaysTournaments: Tournament[],
  activePromotions: Promotion[]
}
```

### Update Venue Settings [Manager]
```
PATCH /venues/:id
```

**Body:**
```typescript
{
  waitlist_settings?: WaitlistSettings,
  tournament_settings?: TournamentSettings,
  auto_text_enabled?: boolean,
  // ... other settings
}
```

### Get Venue Analytics [Manager]
```
GET /venues/:id/analytics
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `start_date` | string | Start date (ISO format) |
| `end_date` | string | End date (ISO format) |
| `granularity` | string | 'daily', 'weekly', 'monthly' |

---

## Games

### Get Live Games [Public]
```
GET /games/live
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `venue_id` | string | Filter by venue |
| `game_type` | string | 'nlh', 'plo', 'mixed', etc. |
| `stakes` | string | '1/3', '2/5', etc. |

### Get Games at Venue [Public]
```
GET /games/venue/:venueId
```

**Response:**
```typescript
{
  games: Game[],
  tables: Table[]
}
```

### Open New Game [Staff]
```
POST /games
```

**Body:**
```typescript
{
  venue_id: string,
  table_id: string,
  game_type: string,
  stakes: string,
  min_buyin: number,
  max_buyin: number,
  max_players?: number,
  is_must_move?: boolean,
  parent_game_id?: string
}
```

### Update Game [Staff]
```
PATCH /games/:id
```

**Body:**
```typescript
{
  status?: 'waiting' | 'running' | 'breaking' | 'closed',
  current_players?: number,
  settings?: GameSettings
}
```

### Close Game [Staff]
```
DELETE /games/:id
```

### Balance Tables [Staff]
```
POST /games/:id/balance
```

**Response:**
```typescript
{
  recommendations: {
    fromTable: string,
    toTable: string,
    player: string,
    reason: string
  }[]
}
```

---

## Waitlist

### Get Venue Waitlists [Public]
```
GET /waitlist/venue/:venueId
```

**Response:**
```typescript
{
  waitlists: {
    game_type: string,
    stakes: string,
    players: WaitlistEntry[],
    count: number,
    estimated_wait: number
  }[]
}
```

### Get My Waitlists
```
GET /waitlist/my
```

**Response:**
```typescript
{
  entries: {
    waitlist_entry: WaitlistEntry,
    venue: Venue,
    game: Game,
    position: number,
    estimated_wait: number
  }[]
}
```

### Join Waitlist
```
POST /waitlist/join
```

**Body:**
```typescript
{
  venue_id: string,
  game_type: string,
  stakes: string,
  // For walk-ins (staff use):
  player_name?: string,
  player_phone?: string
}
```

**Response:**
```typescript
{
  entry: WaitlistEntry,
  position: number,
  estimated_wait: number
}
```

### Leave Waitlist
```
DELETE /waitlist/:id
```

### Call Player [Staff]
```
POST /waitlist/:id/call
```

**Body:**
```typescript
{
  notify_sms?: boolean,
  notify_push?: boolean,
  message?: string
}
```

### Seat Player [Staff]
```
POST /waitlist/:id/seat
```

**Body:**
```typescript
{
  game_id: string,
  seat_number: number,
  buyin_amount?: number
}
```

### Player Passed [Staff]
```
POST /waitlist/:id/pass
```

**Body:**
```typescript
{
  reason?: string,
  requeue?: boolean  // Put back on list
}
```

---

## Squads (Group Waitlist)

### Create Squad
```
POST /squads
```

**Body:**
```typescript
{
  venue_id: string,
  game_type: string,
  stakes: string,
  member_ids: string[],  // Player IDs to invite
  prefer_same_table: boolean,
  accept_split: boolean
}
```

### Get Squad
```
GET /squads/:id
```

### Join Squad
```
POST /squads/:id/join
```

### Leave/Delete Squad
```
DELETE /squads/:id
```

---

## Tournaments

### List Tournaments [Public]
```
GET /tournaments
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `venue_id` | string | Filter by venue |
| `status` | string | Filter by status |
| `start_date` | string | From date |
| `end_date` | string | To date |
| `min_buyin` | number | Minimum buy-in |
| `max_buyin` | number | Maximum buy-in |
| `limit` | number | Max results |

### Get Tournament Details [Public]
```
GET /tournaments/:id
```

**Response:**
```typescript
{
  tournament: Tournament,
  entries: TournamentEntry[],
  blind_structure: BlindLevel[],
  payouts: Payout[],
  chip_leaders?: ChipCount[]
}
```

### Get Live Clock [Public]
```
GET /tournaments/:id/clock
```

**Response:**
```typescript
{
  current_level: number,
  seconds_remaining: number,
  small_blind: number,
  big_blind: number,
  ante: number,
  next_level: BlindLevel,
  is_on_break: boolean,
  players_remaining: number,
  average_stack: number,
  chip_leader?: ChipCount
}
```

### Create Tournament [Staff]
```
POST /tournaments
```

**Body:**
```typescript
{
  venue_id: string,
  name: string,
  description?: string,
  tournament_type: 'freezeout' | 'rebuy' | 'bounty' | 'satellite',
  buyin_amount: number,
  buyin_fee: number,
  starting_chips: number,
  scheduled_start: string,      // ISO datetime
  registration_opens?: string,
  late_registration_levels?: number,
  max_entries?: number,
  blind_structure: BlindLevel[],
  break_schedule?: Break[],
  payout_structure?: Payout[],
  allows_rebuys?: boolean,
  rebuy_amount?: number,
  rebuy_chips?: number,
  max_rebuys?: number,
  allows_addon?: boolean,
  addon_amount?: number,
  addon_chips?: number,
  broadcast_to_smarter?: boolean
}
```

### Update Tournament [Staff]
```
PATCH /tournaments/:id
```

### Register for Tournament
```
POST /tournaments/:id/register
```

**Body:**
```typescript
{
  // For walk-ins (staff use):
  player_name?: string,
  player_phone?: string
}
```

### Cancel Registration
```
DELETE /tournaments/:id/register
```

### Start Tournament [Staff]
```
POST /tournaments/:id/start
```

### Pause Tournament [Staff]
```
POST /tournaments/:id/pause
```

### Resume Tournament [Staff]
```
POST /tournaments/:id/resume
```

### Advance Level [Staff]
```
POST /tournaments/:id/next-level
```

### Eliminate Player [Staff]
```
POST /tournaments/:id/eliminate
```

**Body:**
```typescript
{
  entry_id: string,
  eliminated_by?: string,  // Entry ID of eliminator
  finish_position: number
}
```

### Record Payout [Staff]
```
POST /tournaments/:id/payout
```

**Body:**
```typescript
{
  entry_id: string,
  amount: number,
  position: number
}
```

---

## Home Games

### Browse Home Games [Public]
```
GET /home-games
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `state` | string | Filter by state |
| `city` | string | Filter by city |
| `date` | string | Filter by date |
| `game_type` | string | Game type filter |
| `visibility` | string | 'public', 'friends' |
| `lat` | number | GPS latitude |
| `lng` | number | GPS longitude |
| `radius` | number | Search radius km |

### Get My Home Games
```
GET /home-games/my
```

**Response:**
```typescript
{
  hosting: HomeGame[],
  attending: HomeGame[],
  pending: HomeGame[]
}
```

### Get Home Game Details
```
GET /home-games/:id
```

### Create Home Game
```
POST /home-games
```

**Body:**
```typescript
{
  name: string,
  description?: string,
  game_type: string,
  stakes?: string,
  buyin_min?: number,
  buyin_max?: number,
  max_players: number,
  city: string,
  state: string,
  zip_code?: string,
  full_address?: string,       // Only shown to approved players
  location_notes?: string,
  scheduled_date: string,      // YYYY-MM-DD
  start_time: string,          // HH:MM
  is_recurring?: boolean,
  recurrence_pattern?: RecurrencePattern,
  visibility: 'private' | 'friends' | 'public',
  requires_approval: boolean,
  food_provided?: boolean,
  byob?: boolean,
  smoking_allowed?: boolean,
  house_rules?: string
}
```

### Update Home Game
```
PATCH /home-games/:id
```

### Cancel Home Game
```
DELETE /home-games/:id
```

### Request to Join (RSVP)
```
POST /home-games/:id/rsvp
```

**Body:**
```typescript
{
  message?: string
}
```

### Approve/Decline RSVP [Host]
```
PATCH /home-games/:id/rsvp/:rsvpId
```

**Body:**
```typescript
{
  status: 'approved' | 'declined' | 'waitlist',
  message?: string
}
```

### Leave Review
```
POST /home-games/:id/review
```

**Body:**
```typescript
{
  rating: number,              // 1-5
  review_text?: string,
  game_quality?: number,
  host_rating?: number,
  location_rating?: number
}
```

### Get Reviews
```
GET /home-games/:id/reviews
```

---

## Notifications

### Get My Notifications
```
GET /notifications/my
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `unread_only` | boolean | Filter unread |
| `type` | string | Filter by type |
| `limit` | number | Max results |

### Send Notification [Staff/System]
```
POST /notifications/send
```

**Body:**
```typescript
{
  player_id?: string,
  phone?: string,
  venue_id: string,
  type: 'seat_available' | 'tournament_starting' | 'called_for_seat' | 'promotion' | 'custom',
  channels: ('sms' | 'push' | 'in_app')[],
  title?: string,
  message: string,
  metadata?: any
}
```

### Mark as Read
```
PATCH /notifications/:id/read
```

### Subscribe to Push
```
POST /notifications/subscribe
```

**Body:**
```typescript
{
  token: string,               // FCM token
  platform: 'ios' | 'android' | 'web'
}
```

---

## Promotions

### Get Active Promotions [Public]
```
GET /promotions/active
```

### Get Venue Promotions [Public]
```
GET /promotions/venue/:venueId
```

### Create Promotion [Staff]
```
POST /promotions
```

**Body:**
```typescript
{
  venue_id: string,
  name: string,
  description?: string,
  promotion_type: 'high_hand' | 'bad_beat' | 'splash_pot' | 'bonus' | 'drawing' | 'custom',
  starts_at?: string,
  ends_at?: string,
  recurring_schedule?: RecurringSchedule,
  qualifying_games: string[],
  qualifying_stakes: string[],
  rules: any,
  prize_type: 'cash' | 'progressive' | 'item' | 'freeroll',
  prize_amount?: number
}
```

### Update Promotion [Staff]
```
PATCH /promotions/:id
```

### Record Winner [Staff]
```
POST /promotions/:id/winner
```

**Body:**
```typescript
{
  player_id?: string,
  player_name: string,
  hand_description: string,
  hand_cards?: string[],
  board_cards?: string[],
  game_id?: string,
  table_number?: number,
  prize_amount: number
}
```

### Get Winners
```
GET /promotions/:id/winners
```

---

## Staff Management

### List Staff [Manager]
```
GET /staff/venue/:venueId
```

### Add Staff [Manager]
```
POST /staff
```

**Body:**
```typescript
{
  venue_id: string,
  user_id: string,
  role: 'owner' | 'manager' | 'floor' | 'brush' | 'dealer',
  permissions?: Permissions,
  pin_code?: string
}
```

### Update Staff [Manager]
```
PATCH /staff/:id
```

### Remove Staff [Manager]
```
DELETE /staff/:id
```

### Verify PIN [Staff]
```
POST /staff/verify-pin
```

**Body:**
```typescript
{
  venue_id: string,
  pin_code: string
}
```

**Response:**
```typescript
{
  valid: boolean,
  staff: Staff,
  permissions: Permissions
}
```

---

## AI Features

### Get Wait Time Predictions [Public]
```
GET /ai/wait-time/:venueId
```

**Response:**
```typescript
{
  predictions: {
    game_type: string,
    stakes: string,
    estimated_minutes: number,
    confidence: number,
    factors: WaitTimeFactors
  }[]
}
```

### Get Player Recommendations
```
GET /ai/recommendations/:playerId
```

**Response:**
```typescript
{
  recommendations: {
    type: 'game' | 'stakes' | 'venue' | 'training',
    data: any,
    reason: string,
    score: number
  }[]
}
```

### Get Table Balance Suggestions [Staff]
```
GET /ai/table-balance/:venueId
```

**Response:**
```typescript
{
  suggestions: {
    fromTable: string,
    toTable: string,
    player: string,
    reason: string,
    priority: number
  }[]
}
```

---

## Dealers

### List Dealers [Manager]
```
GET /dealers
```

### Add Dealer [Manager]
```
POST /dealers
```

### Update Dealer [Manager]
```
PATCH /dealers/:id
```

### Delete Dealer [Manager]
```
DELETE /dealers/:id
```

### Get Rotations [Staff]
```
GET /dealers/rotations
```

### Create Rotation [Staff]
```
POST /dealers/rotations
```

### Get Schedule [Staff]
```
GET /dealers/schedule
```

### Update Schedule [Manager]
```
POST /dealers/schedule
```

---

## Incidents

### List Incidents [Staff]
```
GET /incidents
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `venue_id` | string | Filter by venue |
| `severity` | string | Filter by severity |
| `resolved` | boolean | Filter resolved/unresolved |
| `start_date` | string | From date |
| `end_date` | string | To date |

### Create Incident [Staff]
```
POST /incidents
```

**Body:**
```typescript
{
  venue_id: string,
  incident_type: 'dispute' | 'rules_violation' | 'behavior' | 'safety' | 'equipment' | 'other',
  severity: 'low' | 'medium' | 'high' | 'critical',
  players_involved?: string[],
  table_id?: string,
  description: string,
  attachments?: string[]
}
```

### Update Incident [Staff]
```
PATCH /incidents/:id
```

### Resolve Incident [Staff]
```
POST /incidents/:id/resolve
```

**Body:**
```typescript
{
  resolution: string
}
```

---

## Services (In-Seat)

### Request Service
```
POST /services/request
```

**Body:**
```typescript
{
  venue_id: string,
  table_id: string,
  seat_number: number,
  request_type: 'food' | 'chips' | 'table_change' | 'cashout' | 'floor',
  details?: any
}
```

### Get My Requests
```
GET /services/my
```

### Update Request [Staff]
```
PATCH /services/:id
```

**Body:**
```typescript
{
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled',
  assigned_to?: string
}
```

---

## Streaming

### Start Stream [Staff]
```
POST /streaming/:tableId/start
```

**Body:**
```typescript
{
  platforms: ('youtube' | 'twitch' | 'facebook')[],
  delay_minutes: number,
  overlay_config?: OverlayConfig
}
```

### Stop Stream [Staff]
```
POST /streaming/:tableId/stop
```

### Get/Update Config [Staff]
```
GET /streaming/:tableId/config
PATCH /streaming/:tableId/config
```

---

## Hand History

### Get Hands from Game
```
GET /hands/:gameId
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

### Get Single Hand
```
GET /hands/:handId
```

### Send to GodMode Analysis
```
POST /hands/:handId/analyze
```

**Response:**
```typescript
{
  analysis_id: string,
  redirect_url: string         // GodMode analysis page
}
```

---

## Escrow (Home Games)

### Create Deposit
```
POST /escrow/deposit
```

**Body:**
```typescript
{
  home_game_id: string,
  amount: number,
  payment_method: string
}
```

### Release Funds [Host]
```
POST /escrow/:id/release
```

### Refund [Host/System]
```
POST /escrow/:id/refund
```

---

## Marketplace

### List Available Dealers
```
GET /marketplace/dealers
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `city` | string | Service area |
| `date` | string | Availability date |
| `games` | string[] | Required games |

### Book Dealer
```
POST /marketplace/dealers/:id/book
```

**Body:**
```typescript
{
  home_game_id: string,
  hours: number
}
```

### List Equipment
```
GET /marketplace/equipment
```

### Rent Equipment
```
POST /marketplace/equipment/:id/rent
```

**Body:**
```typescript
{
  home_game_id: string,
  rental_dates: {
    start: string,
    end: string
  }
}
```

---

## Responsible Gaming

### Self-Exclude
```
POST /responsible-gaming/exclusion
```

**Body:**
```typescript
{
  exclusion_type: 'temporary' | 'permanent',
  duration_days?: number,
  scope: 'venue' | 'network',
  venue_id?: string,
  reason?: string
}
```

### Get/Set Spending Limits
```
GET /responsible-gaming/limits
PUT /responsible-gaming/limits
```

**Body:**
```typescript
{
  daily_limit?: number,
  weekly_limit?: number,
  monthly_limit?: number,
  session_duration_limit?: number,
  loss_limit?: number,
  alerts_enabled?: boolean
}
```

### Check Exclusion Status [Staff]
```
GET /responsible-gaming/check/:playerId
```

---

## Leagues

### List Leagues [Public]
```
GET /leagues
```

### Get League Details [Public]
```
GET /leagues/:id
```

### Get Standings [Public]
```
GET /leagues/:id/standings
```

### Join League
```
POST /leagues/:id/join
```

---

## Webhooks

### Twilio Status Callback
```
POST /webhooks/twilio/status
```

### Stripe Events
```
POST /webhooks/stripe/events
```

---

## WebSocket Events

### Venue Channel
```
Channel: commander:venue:{venueId}

Events:
- game:opened
- game:closed
- game:updated
- waitlist:updated
- waitlist:called
- promotion:winner
- announcement
```

### Tournament Channel
```
Channel: commander:tournament:{tournamentId}

Events:
- clock:tick
- level:changed
- break:started
- break:ended
- player:eliminated
- player:chiplead
- final_table
- winner
```

### User Channel
```
Channel: commander:user:{userId}

Events:
- seat:available
- waitlist:position
- tournament:starting
- home_game:rsvp
- notification
```

---

## Rate Limits

| Endpoint Type | Limit |
|--------------|-------|
| Public read | 100/min |
| Authenticated read | 200/min |
| Write operations | 60/min |
| Notifications | 30/min |
| AI features | 20/min |

---

## Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid request data |
| `RATE_LIMITED` | Too many requests |
| `VENUE_NOT_COMMANDER` | Venue not using Commander |
| `ALREADY_ON_WAITLIST` | Player already on waitlist |
| `TOURNAMENT_FULL` | Tournament at capacity |
| `GAME_CLOSED` | Game no longer running |
| `EXCLUDED_PLAYER` | Player is self-excluded |
