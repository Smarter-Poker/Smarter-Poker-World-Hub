# SMARTER.POKER — CLUB ARENA MASTER FEATURE AUDIT
## "Every Feature Required for a Production Online Poker Platform"
### Competitors: PokerBros, Pokerrr2, ClubGG, WPT Global

---

## LEGEND
- ✅ = Fully built, wired, tested
- ⚠️ = Partially built or needs fixes
- ❌ = Missing / Not built
- 🔧 = Exists but needs hardening

---

## SECTION 1: CORE POKER ENGINE (Server-Side)

### 1.1 Card System & RNG
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.1.1 | Cryptographic RNG (Node crypto.randomBytes) | ✅ | Deck.js | Fisher-Yates + crypto.randomBytes(n*4), unbiased |
| 1.1.2 | 52-card deck representation | ✅ | Deck.js | Rank (0-12) × Suit (0-3) = 0-51 integers |
| 1.1.3 | 36-card Short Deck (6+) | ✅ | Deck.js | shortDeck option removes 2-5 |
| 1.1.4 | Shuffle (Fisher-Yates) | ✅ | Deck.js | O(n) shuffle with crypto random |
| 1.1.5 | Deal hole cards (variable per variant) | ✅ | Deck.js | dealHoleCards(numPlayers, cardsPerPlayer) |
| 1.1.6 | Burn cards | ✅ | Deck.js | burn() before each street |
| 1.1.7 | Deal flop (3 cards) | ✅ | Deck.js | dealFlop() |
| 1.1.8 | Deal turn (1 card) | ✅ | Deck.js | dealTurn() |
| 1.1.9 | Deal river (1 card) | ✅ | Deck.js | dealRiver() |
| 1.1.10 | Deck reset between hands | ✅ | Deck.js | reset() + shuffle() |

### 1.2 Hand Evaluation
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.2.1 | 5-card hand evaluation | ✅ | HandEvaluator.js | evaluate5() — all 9 hand ranks |
| 1.2.2 | Texas Hold'em (best 5 of 7) | ✅ | HandEvaluator.js | evaluateHoldem() — all C(7,5)=21 combos |
| 1.2.3 | Omaha (must use exactly 2 hole + 3 board) | ✅ | HandEvaluator.js | evaluateOmaha() — enforces 2+3 rule |
| 1.2.4 | PLO4, PLO5, PLO6 support | ✅ | HandEvaluator.js | 4-6 hole cards, all combos evaluated |
| 1.2.5 | Short Deck hand rankings (flush > full house) | ✅ | HandEvaluator.js | SHORT_DECK_CATEGORIES with swapped ranks |
| 1.2.6 | Hi-Lo evaluation (8-or-better low) | ✅ | HandEvaluator.js | evaluateLow() + hi/lo split logic |
| 1.2.7 | Hand comparison / ranking | ✅ | HandEvaluator.js | compareHands() returns -1/0/1 |
| 1.2.8 | Multi-player showdown resolution | ✅ | HandEvaluator.js | holdemShowdown() + omahaShowdown() |
| 1.2.9 | Tie handling / kicker comparison | ✅ | HandEvaluator.js | Rank array comparison for kickers |

### 1.3 Game State Machine
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.3.1 | Hand lifecycle (idle→blinds→deal→streets→showdown→payout) | ✅ | GameStateMachine.js | Full phase machine |
| 1.3.2 | Blind posting (SB/BB) | ✅ | GameStateMachine.js | _postBlinds() with dead blinds |
| 1.3.3 | Ante support | ✅ | GameStateMachine.js | config.ante per hand |
| 1.3.4 | Straddle support | ✅ | GameStateMachine.js | Auto UTG + voluntary straddle with UI toggle |
| 1.3.5 | Button rotation | ✅ | TableManager.js | Moves clockwise each hand |
| 1.3.6 | Heads-up button rule (SB=BTN posts first) | ✅ | GameStateMachine.js | 2-player special case |
| 1.3.7 | Dead button / missed blind handling | ✅ | TableManager.js | Tracks missed blinds |
| 1.3.8 | All-in showdown (skip remaining streets) | ✅ | GameStateMachine.js | Advances to showdown if all active are all-in |
| 1.3.9 | Run it twice | ✅ | GameStateMachine.js | _runItMultiple — 2 or 3 boards, pot split, HU all-in only |
| 1.3.10 | Variant selection per table | ✅ | GameStateMachine.js | GAME_VARIANT enum: holdem/omaha4/5/6/short_deck/hilo/pineapple |
| 1.3.11 | Crazy Pineapple variant | ✅ | GameStateMachine.js | 3 hole cards, discard 1 after flop, full discard UI + auto-discard |

### 1.4 Betting Engine
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.4.1 | Fold / Check / Call / Bet / Raise / All-in | ✅ | BettingRound.js | All 6 action types |
| 1.4.2 | No-Limit betting structure | ✅ | BettingRound.js | No cap on raises |
| 1.4.3 | Pot-Limit betting structure | ✅ | BettingRound.js | maxBet = pot size calculation |
| 1.4.4 | Fixed-Limit betting structure | ✅ | BettingRound.js | Fixed bet/raise sizes |
| 1.4.5 | Minimum raise enforcement | ✅ | ActionValidator.js | Min raise = last raise size |
| 1.4.6 | Legal action validation | ✅ | ActionValidator.js | validateAction() checks all rules |
| 1.4.7 | Round completion detection | ✅ | BettingRound.js | _isRoundComplete() |
| 1.4.8 | Last aggressor tracking | ✅ | BettingRound.js | For showdown order |

### 1.5 Pot Management
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.5.1 | Main pot calculation | ✅ | PotCalculator.js | All contributions tracked |
| 1.5.2 | Side pot creation (multi all-in) | ✅ | PotCalculator.js | calculatePots() splits correctly |
| 1.5.3 | Pot eligibility per player | ✅ | PotCalculator.js | Folded players ineligible |
| 1.5.4 | Winner payout with side pots | ✅ | PotCalculator.js | distribute() handles multi-pot/multi-winner |
| 1.5.5 | Split pot (ties) | ✅ | PotCalculator.js | Even split, odd chip to first position |
| 1.5.6 | Hi/Lo pot split | ✅ | PotCalculator.js | Half to hi winner, half to lo winner |
| 1.5.7 | Rake calculation from pot | ✅ | PotCalculator.js | rakePercent/rakeCap applied post-showdown |

### 1.6 Timer / Clock System
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 1.6.1 | Action timer (configurable seconds) | ✅ | ActionTimer.js | Default 30s + timebank |
| 1.6.2 | Timebank (extra seconds pool) | ✅ | ActionTimer.js | Configurable per player |
| 1.6.3 | Disconnect detection (reduced timer) | ✅ | ActionTimer.js | 15s for disconnected players |
| 1.6.4 | Auto-fold/check on timer expiry | ✅ | ActionTimer.js | Emits 'expired' → auto-action |
| 1.6.5 | Timer broadcast to clients | ✅ | RealtimeSync.js | timer_update events |

---

## SECTION 2: TABLE MANAGEMENT

### 2.1 Table Operations
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 2.1.1 | Create table with config | ✅ | GameController.js | createTable() + connectToClubTable() |
| 2.1.2 | Seat player at specific seat | ✅ | TableManager.js | sitDown(playerId, seatIndex, buyIn) |
| 2.1.3 | Stand up / leave table | ✅ | TableManager.js | standUp() returns stack |
| 2.1.4 | Sit out (skip hands) | ✅ | TableManager.js | sitOut() / sitIn() toggle |
| 2.1.5 | Add chips (rebuy at table) | ✅ | TableManager.js | addChips() between hands |
| 2.1.6 | Min/Max buy-in enforcement | ✅ | TableManager.js | Validated on sit_down |
| 2.1.7 | Waitlist management | ✅ | TableManager.js | joinWaitlist() / leaveWaitlist() |
| 2.1.8 | Auto-start when enough players | ✅ | TableManager.js | _checkAutoStart() — needs minPlayers |
| 2.1.9 | Auto-sit from waitlist | ✅ | TableManager.js | Offers seat when available |
| 2.1.10 | 2-10 player seat layouts | ✅ | LivePokerTable.jsx | SEAT_LAYOUTS with trig positioning |
| 2.1.11 | Max tables per player (multi-table, up to 4) | ✅ | useMultiTable.js | MAX_TABLES=4, enforced in openTable() |
| 2.1.12 | Table close / destroy | ✅ | LobbyManager.js | closeTable() with cleanup |

---

## SECTION 3: TOURNAMENT ENGINE

### 3.1 Tournament Types
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 3.1.1 | MTT (Multi-Table Tournament) | ✅ | TournamentController.js | Full lifecycle |
| 3.1.2 | SNG (Sit & Go) | ✅ | TournamentController.js | Auto-start when full |
| 3.1.3 | Spin & Go (3-max hyper with multiplier) | ✅ | TournamentController.js | Random multiplier draw |
| 3.1.4 | XMTT (Cross-club union tournament) | ✅ | TournamentController.js | Multi-club support |

### 3.2 Tournament Operations
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 3.2.1 | Registration / unregistration | ✅ | TournamentController.js | registerPlayer() / unregisterPlayer() |
| 3.2.2 | Late registration | ✅ | TournamentController.js | Until configurable level |
| 3.2.3 | Blind level advancement | ✅ | TournamentController.js | Timer-based auto-advance |
| 3.2.4 | Break scheduling | ✅ | TournamentController.js | Built into blind structure |
| 3.2.5 | Rebuy period | ✅ | TournamentController.js | processRebuy() until rebuyEndLevel |
| 3.2.6 | Add-on (at break) | ✅ | TournamentController.js | processAddon() |
| 3.2.7 | Player elimination | ✅ | TournamentController.js | Auto on bust-out |
| 3.2.8 | Table balancing | ✅ | TournamentController.js | Balance when imbalanced by 2+ |
| 3.2.9 | Table breaking | ✅ | TournamentController.js | Remove table, redistribute |
| 3.2.10 | Final table merge | ✅ | TournamentController.js | Move all remaining to single table |
| 3.2.11 | Hand-for-hand (bubble) | ✅ | TournamentController.js | Pause between hands at bubble |
| 3.2.12 | Payout calculation | ✅ | TournamentController.js | Standard structures by player count |
| 3.2.13 | Prize distribution | ✅ | TournamentController.js | Atomic payout to club balances |
| 3.2.14 | Pause / Resume | ✅ | TournamentController.js | Admin control |
| 3.2.15 | Tournament lobby / registration UI | ✅ | tournaments.js | 438 lines, browse/filter/register/detail modal |
| 3.2.16 | Tournament create UI (club admin) | ✅ | tournaments.js | CreateTournamentModal with full form (MTT/SNG/Spin) |

---

## SECTION 4: REALTIME COMMUNICATION

### 4.1 Server→Client Broadcasting
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 4.1.1 | Supabase Realtime channels per table | ✅ | RealtimeSync.js | channel = supabase.channel(`table:${id}`) |
| 4.1.2 | Game state broadcasts | ✅ | RealtimeSync.js | table_state event |
| 4.1.3 | Action broadcasts | ✅ | RealtimeSync.js | action_processed event |
| 4.1.4 | Timer broadcasts | ✅ | RealtimeSync.js | timer_update event |
| 4.1.5 | Private card delivery (per-user) | ✅ | RealtimeSync.js | private_cards:{userId} targeted |
| 4.1.6 | Chat messages | ✅ | RealtimeSync.js | chat_message broadcast |
| 4.1.7 | Player presence (online/offline) | ✅ | RealtimeSync.js | Presence tracking |
| 4.1.8 | Heartbeat / disconnect detection | ✅ | useTableConnection.js | 10s heartbeat interval |
| 4.1.9 | Reconnection handling | ✅ | useTableConnection.js | Re-subscribes + state refresh |
| 4.1.10 | Event throttling (100ms min) | ✅ | RealtimeSync.js | BROADCAST_THROTTLE_MS |

---

## SECTION 5: FRONTEND (Player-Facing UI)

### 5.1 Game Table UI
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 5.1.1 | Poker table felt / layout | ✅ | LivePokerTable.jsx | SVG oval table with felt texture |
| 5.1.2 | Player seats (2-10 positions) | ✅ | LivePokerTable.jsx | PlayerSeat component with trig layout |
| 5.1.3 | Player avatars / display names | ✅ | LivePokerTable.jsx | Avatar + name + stack display |
| 5.1.4 | Hole card rendering | ✅ | LivePokerTable.jsx | CardImg with face-down/up states |
| 5.1.5 | Community cards (flop/turn/river) | ✅ | LivePokerTable.jsx | CommunityCards component |
| 5.1.6 | Card deal animations | ✅ | LivePokerTable.jsx | Framer Motion with delay |
| 5.1.7 | Pot display (main + side pots) | ✅ | LivePokerTable.jsx | PotDisplay component |
| 5.1.8 | Action buttons (fold/check/call/bet/raise/all-in) | ✅ | LivePokerTable.jsx | ActionPanel with all 6 buttons |
| 5.1.9 | Bet slider with presets | ✅ | LivePokerTable.jsx | 1/3 pot, 1/2 pot, 3/4 pot, pot, all-in |
| 5.1.10 | Turn timer visual (ring countdown) | ✅ | LivePokerTable.jsx | SVG circle with stroke-dashoffset |
| 5.1.11 | Buy-in dialog | ✅ | LivePokerTable.jsx | BuyInDialog with min/max/slider |
| 5.1.12 | Seat selection (click empty seat) | ✅ | LivePokerTable.jsx | Click handler on empty seats |
| 5.1.13 | Chat overlay | ✅ | LivePokerTable.jsx | ChatOverlay component |
| 5.1.14 | Table info bar (stakes, variant, club name) | ✅ | LivePokerTable.jsx | TableInfoBar component |
| 5.1.15 | Sit out / Sit in buttons | ✅ | LivePokerTable.jsx | In TableInfoBar |
| 5.1.16 | Stand up button | ✅ | LivePokerTable.jsx | In TableInfoBar |
| 5.1.17 | Add chips button | ✅ | LivePokerTable.jsx | In TableInfoBar |
| 5.1.18 | Result overlay (winner display) | ✅ | LivePokerTable.jsx | ResultOverlay component |
| 5.1.19 | Winning hand highlighting | ✅ | LivePokerTable.jsx | Gold glow filter + winGlow animation on winner cards |
| 5.1.20 | Showdown card reveal animation | ⚠️ | LivePokerTable.jsx | Cards show but flip animation basic |
| 5.1.21 | Chip movement animations (pot collection) | ✅ | LivePokerTable.jsx | ChipFlyAnimation — colored chips fly from pot to winner seats on payout |
| 5.1.22 | Sound effects (deal, check, call, fold, win) | ✅ | PokerSoundManager.js | Web Audio API, 317 lines, all game events |
| 5.1.23 | Emote/sticker system | ✅ | ThrowableEmojis.jsx | 22 SVG throwables, 8 impact types, PokerBros-style animations |
| 5.1.24 | Table themes / customization | ✅ | TableThemes.js + ThemePicker.jsx | 8 themes + 7 card backs, localStorage persistence |
| 5.1.25 | Rabbit hunting (show undealt cards) | ✅ | Deck.js + GameStateMachine.js + LivePokerTable.jsx | peekRabbitCards engine + 🐇 button in ResultOverlay |
| 5.1.26 | Hand strength indicator | ✅ | handStrength.js + LivePokerTable.jsx | 360-line evaluator + color-coded label overlay |

### 5.2 Multi-Table Play (CRITICAL MISSING FEATURE)
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 5.2.1 | Open up to 4 tables simultaneously | ✅ | MultiTableView.jsx | useMultiTable hook manages 4 slots |
| 5.2.2 | Table tab bar / switcher | ✅ | MultiTableView.jsx | TabBar component with stakes/variant labels |
| 5.2.3 | Action-required notification on inactive table | ✅ | MultiTableView.jsx | Pulsing red dot + sound on action needed |
| 5.2.4 | Tile view (show all tables at once) | ✅ | MultiTableView.jsx | 2x2 grid view toggle |
| 5.2.5 | Auto-switch to table requiring action | ✅ | useMultiTable.js | markActionNeeded auto-switches in single mode |
| 5.2.6 | Per-table state isolation | ✅ | MultiTableView.jsx | Each TableSlot has own useTableConnection |

### 5.3 Lobby UI
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 5.3.1 | Club lobby with table list | ✅ | lobby.js | 1249 lines, full lobby |
| 5.3.2 | Table cards (stakes, players, variant) | ✅ | lobby.js | Card display per table |
| 5.3.3 | Filter by game type (cash/MTT) | ✅ | lobby.js | Tab filters |
| 5.3.4 | Quick Seat (auto-join best table) | ✅ | lobby.js | Quick Seat button |
| 5.3.5 | Create table (admin) | ✅ | CreateGameModal.jsx | Full config: rake %, fee cap, BBJ %, straddle, insurance, buy-in auth |
| 5.3.6 | Tournament registration from lobby | ✅ | tournaments.js | Full tournament page — list, detail modal, register, unregister, start, blind structure |
| 5.3.7 | Player count / waitlist count display | ✅ | lobby.js | Shows current_players / max_players |
| 5.3.8 | Table search / sort | ✅ | lobby.js | Search input + sort dropdown (players/stakes/name) |

---

## SECTION 6: FINANCIAL SYSTEM (Chips, Rake, BBJ, Wallets)

### 6.1 Chip Operations
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 6.1.1 | Mint chips (club treasury) | ✅ | mint-chips.js | RPC: mint_club_chips |
| 6.1.2 | Distribute chips (club→agent or club→player) | ✅ | distribute-chips.js | RPC: distribute_chips |
| 6.1.3 | Agent→Player chip transfer | ✅ | distribute-chips.js | RPC: transfer_chips_agent_to_player |
| 6.1.4 | Lock chips on table sit-down | ✅ | ChipBridge.js | lockChips() — atomic deduct |
| 6.1.5 | Unlock chips on stand-up | ✅ | ChipBridge.js | unlockChips() — atomic credit |
| 6.1.6 | Rebuy chips at table | ✅ | ChipBridge.js | rebuyChips() |
| 6.1.7 | Cashout request (player→agent or player→club) | ✅ | request-cashout.js | Creates pending request |
| 6.1.8 | Cashout approval | ✅ | approve-cashout.js | Admin/agent approval flow |
| 6.1.9 | Chip clawback (admin emergency) | ✅ | clawback-chips.js | Force reclaim |

### 6.2 Rake System
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 6.2.1 | Per-hand rake calculation (% of pot, capped) | ✅ | PotCalculator.js + RakeConfig.js | 6 tiers: 3-10% with BB-based caps |
| 6.2.2 | Tier-based auto-config (nano→nosebleed) | ✅ | RakeConfig.js | Auto-fill based on big blind |
| 6.2.3 | Rake recording to DB | ✅ | LobbyManager.js → record_rake RPC | Atomic after each hand |
| 6.2.4 | Dealt method attribution (equal split) | ✅ | record_rake RPC | Split among all dealt players |
| 6.2.5 | Union routing (100% rake → union) | ✅ | record_rake RPC | IF union_id → all to union |
| 6.2.6 | Standalone routing (100% rake → club) | ✅ | record_rake RPC | ELSE → all to club |
| 6.2.7 | Cascading agent commission | ✅ | calculate_cascading_commission RPC | Multi-level agent chain |

### 6.3 Bad Beat Jackpot (BBJ)
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 6.3.1 | BBJ fee per hand (BB-based by tier) | ✅ | RakeConfig.js | 0.03-0.6 BB per hand |
| 6.3.2 | 3-pool split (40% main / 30% backup / 30% promo) | ✅ | record_rake RPC | Configurable per union |
| 6.3.3 | BBJ pool tracking (main/backup/promo balances) | ✅ | unions table | 3 balance columns |
| 6.3.4 | BBJ payout % by tier (15%-85% of pool) | ✅ | bbj_stakes_tiers table + RakeConfig.js | Higher stakes = more of pool |
| 6.3.5 | Loser/Winner/Table share split | ✅ | RakeConfig.js | Loser gets most, table share split evenly |
| 6.3.6 | Qualifying hand rules per variant | ✅ | bbj_qualifying_hands table | NLH=AAAJJ, PLO4=KKKK2, PLO5=87654 |
| 6.3.7 | BBJ eligibility rules (pot≥10BB, 4+ dealt, etc.) | ✅ | RakeConfig.js + BBJ_RULES | All rules encoded |
| 6.3.8 | BBJ award RPC | ✅ | award_bbj RPC | Payout + backup→main reseed |
| 6.3.9 | BBJ detection during showdown | ✅ | GameStateMachine.js | _checkBBJ() with NLH/PLO4/PLO5/PLO6 qualifying hands |
| 6.3.10 | BBJ trigger + payout flow | ✅ | LobbyManager.js | bbj_triggered event → award_bbj RPC → broadcast |
| 6.3.11 | BBJ history / audit log | ✅ | union_bbj_ledger table | Full contribution + payout tracking |
| 6.3.12 | BBJ display in UI (current jackpot amount) | ✅ | BBJDisplay.js | Lobby banner + table ticker + 3-tab modal (Winners/Basic/Qualifying) + realtime |

### 6.4 Promo Wallets
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 6.4.1 | Union promo_fund_balance | ✅ | unions table | Funded by 30% BBJ |
| 6.4.2 | Club promo_balance | ✅ | clubs table | For club promos |
| 6.4.3 | Agent promo_balance | ✅ | agents table | For player incentives |
| 6.4.4 | Player promo_balance | ✅ | club_members table | Bonuses/rewards |
| 6.4.5 | Union→Club promo transfer | ✅ | transfer_promo_union_to_club RPC | Atomic |
| 6.4.6 | Union→Agent promo transfer | ✅ | transfer_promo_union_to_agent RPC | Direct to agent |
| 6.4.7 | Club→Agent promo transfer | ✅ | transfer_promo_club_to_agent RPC | Atomic |
| 6.4.8 | Agent→Player promo transfer | ✅ | transfer_promo_agent_to_player RPC | Bonuses |
| 6.4.9 | Player promo→chips redemption | ✅ | redeem_promo_to_chips RPC | Convert to playable |
| 6.4.10 | Promo wallet UI (admin dashboard) | ✅ | admin.js + promo-wallet.js | PromoWalletModal — mint, grant to agents, balance list |

---

## SECTION 7: HIERARCHY & ROLE SYSTEM

### 7.1 Union Level
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 7.1.1 | Create union | ✅ | manage-union.js | API + UI |
| 7.1.2 | Union dashboard (clubs, revenue, BBJ) | ✅ | union-dashboard.js | 815 lines |
| 7.1.3 | BBJ pool management tab | ✅ | union-dashboard.js | Shows balances + activity |
| 7.1.4 | BBJ split configuration (40/30/30) | ✅ | union-dashboard.js | Editable in settings |
| 7.1.5 | Member club management | ✅ | union-dashboard.js | List + approve/remove clubs |
| 7.1.6 | Union rake routing info | ✅ | union-dashboard.js | "100% flows to union" display |
| 7.1.7 | Cross-club tournament creation (XMTT) | ⚠️ | TournamentController.js | Engine supports, no UI to create |

### 7.2 Club Level
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 7.2.1 | Create club | ✅ | create-club.js | API + UI |
| 7.2.2 | Club admin dashboard | ✅ | admin.js | Stats, members, tables, settings |
| 7.2.3 | Member management (approve/ban/role) | ✅ | admin.js | Full member CRUD |
| 7.2.4 | Table management (create/close) | ✅ | admin.js + CreateGameModal.jsx | Full create with all fields, close via engine disconnect |
| 7.2.5 | Club settings (name, logo, join code) | ✅ | save-settings.js | Editable |
| 7.2.6 | Financial overview | ✅ | cashier.js + get_club_financial_summary RPC | Treasury, circulation, net position |
| 7.2.7 | Club join flow (invite code) | ✅ | join-club.js | Code-based join |
| 7.2.8 | Club announcements | ✅ | announcements.js | Push to members |

### 7.3 Agent System
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 7.3.1 | Agent creation (by club admin) | ✅ | manage-agent.js | API + admin UI |
| 7.3.2 | Agent dashboard | ✅ | agent-dashboard.js | Balances, downline, commissions |
| 7.3.3 | Sub-agent hierarchy (parent→child) | ✅ | agents table | parent_agent_id FK |
| 7.3.4 | Cascading commission (multi-level) | ✅ | calculate_cascading_commission RPC | Walks agent chain |
| 7.3.5 | Agent wallets (business + player + promo) | ✅ | agents table | 3 balance columns |
| 7.3.6 | Credit agent (club extends credit) | ✅ | agent-credit.js | credit_limit / credit_used |
| 7.3.7 | Prepaid agent (loads chips upfront) | ✅ | agents table | is_prepaid flag |
| 7.3.8 | Agent→Player chip distribution | ✅ | distribute-chips.js | RPC call |
| 7.3.9 | Agent settlement | ✅ | settle-period.js | Weekly/period settlement |
| 7.3.10 | Agent promo distribution UI | ✅ | agent-dashboard.js | PromoWalletTab — balance display, player select, send promo |

### 7.4 Player Level
| # | Feature | Status | File | Notes |
|---|---------|--------|------|-------|
| 7.4.1 | Player registration / club join | ✅ | join-club.js | Auth + club membership |
| 7.4.2 | Player chip balance | ✅ | club_members.chip_balance | Per-club balance |
| 7.4.3 | Player promo balance | ✅ | club_members.promo_balance | Bonus wallet |
| 7.4.4 | Hand history viewer | ✅ | hand-histories.js | Browse past hands |
| 7.4.5 | Player stats page | ✅ | player-stats.js | Win rate, sessions, etc. |
| 7.4.6 | Leaderboard | ✅ | leaderboard.js | Rankings |
| 7.4.7 | Cashout request | ✅ | request-cashout.js | Submit request |
| 7.4.8 | Player messages / chat | ✅ | messages.js | In-club messaging |
| 7.4.9 | Player profile / avatar | ✅ | profile-edit.js (1442 lines) | Full editable profile with avatar upload, HendonMob integration |
| 7.4.10 | Rakeback tracking | ✅ | rakeback.js | Period-based rakeback |

---

## SECTION 8: API LAYER

### 8.1 Poker Engine APIs
| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 8.1.1 | POST /api/poker/engine/club-connect | ✅ | Bridge club table → engine |
| 8.1.2 | POST /api/poker/engine/action | ✅ | Process player action |
| 8.1.3 | POST /api/poker/engine/seat | ✅ | All seat operations (7 actions) |
| 8.1.4 | GET /api/poker/engine/state | ✅ | Fetch current table state |
| 8.1.5 | POST /api/poker/engine/connect | ✅ | Heartbeat / disconnect / chat |
| 8.1.6 | GET/POST/DELETE /api/poker/engine/tables | ✅ | Table CRUD |

### 8.2 Club Arena APIs
| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| 8.2.1 | All 26 club arena API routes | ✅ | All present and wired |

---

## SECTION 9: DATABASE (Supabase)

### 9.1 Core Tables
| # | Table | Status | Notes |
|---|-------|--------|-------|
| 9.1.1 | clubs | ✅ | + chip_treasury, promo_balance, total_rake |
| 9.1.2 | club_members | ✅ | + chip_balance, promo_balance |
| 9.1.3 | tables (poker tables) | ✅ | + rake_percent, rake_cap_bb, bbj_percent |
| 9.1.4 | agents | ✅ | + business_balance, player_balance, promo_balance |
| 9.1.5 | unions | ✅ | + main_bbj, backup_bbj, promo_fund balances |
| 9.1.6 | union_clubs | ✅ | Club-union membership |
| 9.1.7 | union_bbj_ledger | ✅ | BBJ audit trail |
| 9.1.8 | cashout_requests | ✅ | Pending/approved/rejected |
| 9.1.9 | rakeback_periods | ✅ | Period tracking |
| 9.1.10 | bbj_stakes_tiers | ✅ | 6 tier configs |
| 9.1.11 | bbj_qualifying_hands | ✅ | Per-variant qualifying hands |
| 9.1.12 | hand_histories | ✅ | 20260228_hand_histories.sql | Full table with indexes, RLS, player_ids GIN index |
| 9.1.13 | chip_transactions (audit trail) | ✅ | 20260228_club_arena_engine.sql | Used across all RPCs for distribute, credit, cashout, promo |
| 9.1.14 | club_tournaments | ✅ | 20260228_club_arena_tournaments.sql | Full schema + tournament_registrations + API + UI page |

### 9.2 RPCs (Remote Procedure Calls)
| # | RPC | Status | Notes |
|---|-----|--------|-------|
| 9.2.1 | record_rake | ✅ | Dealt method + union routing + BBJ split |
| 9.2.2 | calculate_cascading_commission | ✅ | Multi-level agent chain |
| 9.2.3 | mint_club_chips | ✅ | Treasury creation |
| 9.2.4 | distribute_chips | ✅ | Club→member/agent |
| 9.2.5 | transfer_chips_agent_to_player | ✅ | Agent→player |
| 9.2.6 | get_club_financial_summary | ✅ | Full financial overview |
| 9.2.7 | get_agent_dashboard | ✅ | Agent stats + balances |
| 9.2.8 | get_union_bbj_status | ✅ | BBJ pools + activity |
| 9.2.9 | award_bbj | ✅ | Payout + reseed |
| 9.2.10 | 5 promo transfer RPCs | ✅ | Full promo chain |
| 9.2.11 | redeem_promo_to_chips | ✅ | Player promo→chips |

---

## SECTION 10: CRITICAL GAPS — PRIORITY BUILD ORDER

### 🔴 P0 — MUST HAVE (Platform Cannot Launch Without These)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| P0-1 | **Multi-table play (up to 4 tables)** | Core feature of every competitor | LARGE — New MultiTableManager component, tab bar, state isolation, auto-switch |
| P0-2 | **BBJ detection during showdown** | BBJ system is wired but never triggers | MEDIUM — Add hand qualification check in GameStateMachine showdown |
| P0-3 | **Tournament create UI (club admin)** | Admins can't create tournaments | MEDIUM — Form in lobby.js for MTT/SNG/Spin creation |
| P0-4 | **Tournament detail/register page** | Players can't register for tournaments | MEDIUM — Dedicated page with info, structure, register button |
| P0-5 | **Create table modal: rake/BBJ fields** | Admin can't set table-level config | SMALL — Add inputs to existing create modal |

### 🟡 P1 — HIGH PRIORITY (Expected by Users)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| P1-1 | **Sound effects** | Silent games feel dead | MEDIUM — Audio system with Web Audio API |
| P1-2 | **Chip movement animations** | No visual chip flow to pot/winner | MEDIUM — Framer Motion animations |
| P1-3 | **BBJ ticker on table + lobby** | Players can't see jackpot | SMALL — Display component |
| P1-4 | **Run it twice (complete)** | Popular cash game feature | MEDIUM — Dual board dealing + split pots |
| P1-5 | **Emote/sticker system** | Social engagement | MEDIUM — Emote picker + animation overlay |
| P1-6 | **Table search/sort in lobby** | Hard to find tables at scale | SMALL — Search + sort controls |
| P1-7 | **Promo wallet distribution UI** | Admins can't distribute promos via UI | MEDIUM — Admin + agent UI panels |

### 🟢 P2 — NICE TO HAVE (Polish / Competitive Edge)

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| P2-1 | Table themes / customization | Personalization | MEDIUM |
| P2-2 | Rabbit hunting | Fun feature | SMALL |
| P2-3 | Hand strength indicator | Helps beginners | SMALL |
| P2-4 | Winning hand card highlighting | Visual polish | SMALL |
| P2-5 | Showdown card flip animation | Visual polish | SMALL |
| P2-6 | Player avatar upload in club | Profile customization | SMALL |
| P2-7 | Straddle toggle per-hand | Cash game feature | SMALL |

---

## SECTION 11: ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                     │
│                                                           │
│  LivePokerTable.jsx ──── useTableConnection.js            │
│       │                      │          │                 │
│       │ (UI events)          │ (HTTP)   │ (Realtime)      │
│       ▼                      ▼          ▼                 │
│  ┌──────────┐    ┌───────────────┐  ┌──────────────┐     │
│  │ Actions  │    │ /api/poker/   │  │ Supabase     │     │
│  │ Buttons  │───▶│ engine/*      │  │ Realtime     │     │
│  └──────────┘    └───────┬───────┘  │ Channels     │     │
│                          │          └──────┬───────┘     │
├──────────────────────────┼─────────────────┼─────────────┤
│                   SERVER │                 │              │
│                          ▼                 │              │
│              ┌─────────────────┐           │              │
│              │ GameController  │───────────┘              │
│              │   (singleton)   │  broadcasts              │
│              └────────┬────────┘                          │
│                       │                                   │
│         ┌─────────────┼─────────────┐                     │
│         ▼             ▼             ▼                     │
│  ┌────────────┐ ┌──────────┐ ┌──────────────┐            │
│  │ LobbyMgr   │ │ TableMgr │ │ Tournament   │            │
│  │ (tables)   │ │ (seats)  │ │ Controller   │            │
│  └─────┬──────┘ └────┬─────┘ └──────┬───────┘            │
│        │              │              │                    │
│        ▼              ▼              ▼                    │
│  ┌──────────────────────────────────────────┐             │
│  │         GameStateMachine                  │             │
│  │  Deck → BettingRound → PotCalculator     │             │
│  │  HandEvaluator → ActionTimer/Validator   │             │
│  └──────────────────┬───────────────────────┘             │
│                     │ (hand_complete event)                │
│                     ▼                                     │
│  ┌──────────────────────────────────────────┐             │
│  │         ChipBridge + Supabase RPCs       │             │
│  │  record_rake → cascading_commission      │             │
│  │  lockChips → unlockChips                 │             │
│  │  BBJ contribution → pool split           │             │
│  └──────────────────┬───────────────────────┘             │
│                     │                                     │
├─────────────────────┼─────────────────────────────────────┤
│               DATABASE (Supabase)                         │
│  clubs │ agents │ club_members │ unions │ tables          │
│  union_bbj_ledger │ cashout_requests │ hand_histories     │
│  bbj_stakes_tiers │ bbj_qualifying_hands                  │
└───────────────────────────────────────────────────────────┘
```

---

## SECTION 12: FILE INVENTORY

### Engine (src/lib/poker-engine/) — 15 files, ~260K characters
| File | Lines | Purpose |
|------|-------|---------|
| Deck.js | ~390 | Cards, crypto shuffle, deal |
| HandEvaluator.js | ~520 | All hand types + Omaha + Hi/Lo |
| GameStateMachine.js | ~960 | Hand lifecycle phases |
| BettingRound.js | ~475 | Single street betting |
| ActionValidator.js | ~420 | Legal action validation |
| PotCalculator.js | ~430 | Pots, side pots, distribution |
| ActionTimer.js | ~265 | Turn timer + timebank |
| TableManager.js | ~780 | Per-table seat/hand management |
| GameController.js | ~830 | Orchestrator singleton |
| LobbyManager.js | ~585 | Table lifecycle + rake recording |
| TournamentController.js | ~1200 | Full tournament engine |
| RealtimeSync.js | ~550 | Supabase channel broadcasting |
| HandHistory.js | ~490 | Save/load hand records |
| ChipBridge.js | ~315 | Lock/unlock chips for club tables |
| RakeConfig.js | ~255 | Tier-based rake + BBJ config |

### Frontend Pages (pages/hub/club-arena/) — 12 files
| File | Lines | Purpose |
|------|-------|---------|
| lobby.js | 1249 | Club lobby, table list, create |
| admin.js | ~900 | Club admin dashboard |
| agent-dashboard.js | ~600 | Agent view |
| union-dashboard.js | 815 | Union management + BBJ |
| cashier.js | ~500 | Financial management |
| table/[tableId].js | 160 | Bridge to LivePokerTable |
| hand-histories.js | ~400 | Hand history viewer |
| player-stats.js | ~350 | Player statistics |
| leaderboard.js | ~300 | Rankings |
| players.js | ~300 | Player list |
| messages.js | ~250 | Messaging |
| marketplace.js | ~200 | Club marketplace |

### Key Components
| File | Lines | Purpose |
|------|-------|---------|
| LivePokerTable.jsx | 1338 | Full game table UI |
| useTableConnection.js | ~230 | Realtime hook (HTTP writes + Realtime reads) |

### API Routes (pages/api/) — 32 routes
| Category | Count | All Present |
|----------|-------|-------------|
| Engine (/api/poker/engine/) | 6 | ✅ |
| Club Arena (/api/club-arena/) | 26 | ✅ |

### Database Migrations — Key files
| File | Lines | Purpose |
|------|-------|---------|
| 20260228_club_arena_complete_schema.sql | ~225 | Base schema |
| 20260228_club_arena_engine.sql | ~990 | RPCs + chip operations |
| 20260228_bbj_and_rake_fix.sql | ~950 | BBJ + rake + promo wallets |

---

## WHAT MAKES THIS PRODUCTION-READY TODAY

✅ **Cryptographic RNG** — crypto.randomBytes, not Math.random
✅ **Full poker engine** — All variants (NLH, PLO4/5/6, Short Deck, Hi/Lo)
✅ **Complete hand evaluation** — 9 hand ranks + Omaha + Hi/Lo split
✅ **Side pots** — Correct multi-way all-in pot splitting
✅ **Betting rules** — NL/PL/FL with proper min-raise enforcement
✅ **Tournament engine** — MTT/SNG/Spin with balancing, breaks, payouts
✅ **Real-time communication** — Supabase channels with presence
✅ **Chip integrity** — Atomic lock/unlock, no double-spend
✅ **Rake system** — 6 tiers, dealt method, union routing
✅ **BBJ system** — 3-pool split, qualifying hands, payout tiers
✅ **Agent hierarchy** — Multi-level cascading commission
✅ **Promo wallets** — Full chain from union→club→agent→player
✅ **32 API routes** — All wired and functional
✅ **Full game UI** — Table, seats, cards, actions, timer, chat

## WHAT MUST BE BUILT FOR LAUNCH

✅ **Multi-table play (4 tables)** — Built: MultiTableView.jsx + useMultiTable.js
✅ **BBJ auto-detection** — Built: _checkBBJ() in GameStateMachine + LobbyManager payout
✅ **Tournament creation UI** — Built: CreateTournamentModal in tournaments.js
✅ **Tournament registration flow** — Built: TournamentDetailModal in tournaments.js
✅ **Sound effects** — Built: PokerSoundManager.js (317 lines)
✅ **Chip animations** — ChipFlyAnimation: colored chips fly from pot to winner seats

---

*Document generated: 2026-02-28*
*Total engine code: ~260,000 characters across 15 files*
*Total frontend: ~6,000 lines across 12 pages + components*
*Total API routes: 32 endpoints*
*Total database RPCs: 16 functions*
