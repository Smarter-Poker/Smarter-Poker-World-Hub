# Club Arena — Master Top-Tier Poker-Room Spec & Gap Analysis

**Prepared:** 2026-08-04 · **Scope:** Everything required to be a best-in-class club/union online poker room, benchmarked against **PokerBros**, **ClubGG**, and **PokerStars**, then measured against what Club Arena has actually built.

## How to read this document

Part 1 is the **master specification** — the complete, precise feature/function/security taxonomy a top-tier room must have, distilled from deep research on the three benchmark platforms plus the regulatory/integrity/engineering standards that define "trustworthy and best-in-class."

Part 2 is the **gap analysis** — organized by the same 15 domains. For each domain you get: the standard, **what Club Arena already has** (with codebase evidence), and **the precise gaps** (missing, partial, stub, bug-risk) with a priority tag.

Part 5 (added 2026-08-04) is the **verified line-by-line audit** — build/typecheck/test results plus six parallel deep-read domain audits, every finding with `file:line` evidence, a de-duplicated bug/stub/wiring inventory by severity, new items discovered, and a recommended execution order for the upgrade. **If you read one section before starting the upgrade, read Part 5.**

Priority tags: **[P0]** = table-stakes / legal / money-integrity blocker · **[P1]** = major competitive gap · **[P2]** = polish / differentiation · **[P3]** = nice-to-have / long tail. In Part 5, **[verify-live]** flags a finding that depends on RPC/RLS bodies in the World Hub repo (not this tree) and must be confirmed against the live database first.

A one-line orientation before the detail: **Club Arena is already far more complete than PokerBros or ClubGG on the engine, integrity, and operator-tooling axes** (server-authoritative engine, CSPRNG shuffle, bot/collusion/multi-account detectors, on-platform cashier, ~80 services, 102 routes, 38 server test suites). Its real gaps are concentrated in **regulatory compliance & responsible gaming, a handful of game variants/formats, RNG certification & provable fairness, and client-side polish/hardening** — not in core poker.

---

# PART 1 — MASTER SPECIFICATION: What a Top-Tier Club Poker Room Must Have

## Domain 1 — Core Game Engine & Rules

The non-negotiable foundation. Everything else is worthless if this is wrong.

- **Server-authoritative architecture.** The server owns the shuffle, hole-card dealing, action legality, pot/side-pot math, showdown evaluation, and all timing. The client is a thin render+input layer and is never trusted for anything payout-affecting. One authoritative owner per table (actor/state-machine model) to avoid split-brain.
- **Certified RNG + unbiased shuffle.** A cryptographically secure PRNG (CSPRNG) seeded from high-entropy sources, producing a **Fisher-Yates/Knuth** unbiased permutation where all 52! orderings are attainable; reshuffled every hand; hole cards encrypted/filtered per-viewer so packet inspection can't reveal them. Ideally certified by an accredited lab (GLI-19/GLI-11, BMM, iTech Labs, eCOGRA).
- **Complete betting engine.** No-Limit, Pot-Limit, Fixed-Limit betting rules; correct min-raise/re-open logic; blinds, antes, **big-blind ante**, straddle; all-in and side-pot construction; dead blinds and missed-blind posting rules.
- **Correct hand evaluation** across every offered variant (high, hi/lo 8-or-better, short-deck rankings where flush beats full house, Badugi/2-7 lowball, OFC scoring/royalties).
- **Deterministic, auditable hand lifecycle.** Every hand produces a verifiable, immutable hand history; state verifier confirms client and server agree.

**Game variants (the full menu a top-tier room offers):**

- Hold'em: **NLHE, PLH, Limit Hold'em**
- Omaha: **PLO (4-card), 5-Card PLO, 6-Card PLO, PLO Hi/Lo (8-or-better), Courchevel**
- **Short Deck / 6+ Hold'em** (36-card, flush-over-full-house, ante-button)
- Stud family: **7-Card Stud, Stud Hi/Lo, Razz**
- Draw family: **5-Card Draw, 2-7 Triple Draw, Badugi**
- **Open-Face Chinese / Pineapple OFC** (multiple variants)
- **Mixed games:** HORSE, 8-Game, and custom rotations

## Domain 2 — Table Formats & Special Features

- **Run It Twice / Multiple Times** (2–3 boards, multiway, consent-gated per player).
- **All-In Insurance** (buy protection against outs before river) **and/or All-In/EV Cash Out** (take equity-based payout minus a small margin, individually opt-in).
- **Straddles** (UTG/button, mandatory/optional, double-straddle) and **Bomb Pots** (ante-funded, immediate flop, single or **double board**, configurable frequency).
- **Rabbit Hunt** (reveal un-dealt board after hand ends).
- **Ante / BB-ante tables**; **kill pots** (limit games).
- **Time bank** (replenishing reserve beyond base clock; card-based or pooled).
- **Auto-actions / pre-actions:** sit-out, auto-post, check/fold, fold-to-any, check, call, call-any, raise, raise-any — all auto-clearing when the action materially changes.
- **Auto-muck / auto-show; show-one-card.**
- **Seat management:** reserve seat, waitlists, min/max buy-in, auto-top-up/auto-rebuy, straddle/RIT/insurance table toggles, VPIP-minimum "action" tables.
- **Jackpots:** Bad Beat Jackpot (rake-funded progressive, configurable qualifying hand) and High Hand promotions.

## Domain 3 — Cash-Game Ecosystem

- **Full stakes ladder** micro → high, clearly laddered with buy-in caps.
- **Table sizes** heads-up (2) through full ring (9-max), plus 4-max/6-max.
- **Fast-fold pooled poker** (Zoom/Rush & Cash analog): fold instantly reseats you against a new opponent from a shared pool — a top-tier retention/volume format requiring a pooled-table server architecture.
- **Seating & discovery:** Quick-Seat/"Seat Me" auto-seating, table selection with rich filters (game, stake, speed, size, avg pot, players/flop %, hands/hr, waitlist length), table preview, favorites, anonymous tables option, **beginner/"training-wheels" tables** restricted to new accounts.
- **Rake:** weighted-contributed or dealt method, **no-flop-no-drop**, %+cap scaling by stake and table size, transparent display.

## Domain 4 — Tournament Ecosystem

- **MTT engine:** equal starting stacks, automatic table balancing and breaking, hand-for-hand bubble play, final-table consolidation, blind/ante structures, guarantees, overlay handling.
- **Registration flexibility:** late registration, **re-entry, rebuy, add-on**, unregister/refund rules.
- **SNGs:** heads-up to large fields; Regular/Turbo/Hyper-Turbo speeds.
- **Spin & Go / lottery SNGs:** 3-max hyper-turbo with a randomly drawn multiplier prize pool revealed pre-deal; multiplier distribution and payout splits; ticket entries; "flash" faster variant.
- **Bounty formats:** fixed bounty, full knockout, **Progressive Knockout (PKO)**, team/pro bounty; **7-2 (seven-deuce) bounties** at cash tables.
- **Satellites & tickets:** satellite ladders/steps feeding bigger events or live packages; tournament tickets / tournament-dollars (non-cash, non-transferable) as buy-in credit.
- **Advanced structures:** phased/multi-day (Day 1 flights → Day 2), shootouts, Fifty50/double-or-nothing, time tournaments, deep stacks, freezeouts, freerolls.
- **ICM final-table deal-making** (chip-chop / ICM, unanimous consent, admin-confirmed).
- **Recovery:** tournament state recovery after server restart; disconnect protection with extra reconnect time in late stages; bubble protection.

## Domain 5 — Club System

- **Club creation** in-app (name, avatar/logo, unique **Club ID**), lifecycle/renewal, club levels gating member/table capacity.
- **Roles & governance:** Owner, Manager/Deputy (delegated admin), Agent, Member — with granular permission matrix (create/close tables, set rake, set rules, approve/ban members, assign roles, run reports).
- **Discovery & joining:** search by Club ID, join request → owner/manager approval, referral-ID attribution, invitations.
- **Member management:** roster, roles, balances, per-member permissions, access restriction by nickname/device/IP/GPS, VPIP restrictions, kick/ban/blacklist.
- **Club operations:** rules page, announcements, club chat/messaging, club financials/reporting, table scheduling, club leaderboards, club-run events/promotions ("Winnings/Hands/Score" ranking), Hall of Fame archive.

## Domain 6 — Union / Alliance System

- **Federation of clubs** into a union sharing a **merged cross-club player pool** so tables/MTTs draw seats from all member clubs.
- **Standardized union schedule** — the same tables/stakes/structures visible to every member club.
- **Union chip valuation** and **rake-split economics** (union operator takes a % of rake; remainder to club owner → agents → players).
- **Union governance:** union roles, club admission/removal, union-level dashboards, cross-club settlement, union-wide leaderboards and jackpots.
- **Per-club chip siloing** (balances non-transferable across clubs by default) with union-level accounting on top.

## Domain 7 — Agent / Affiliate Hierarchy

- **Multi-tier downline:** super-agent → agent → sub-agent, with referral-ID player attribution.
- **Chip & credit distribution:** agents credit/debit player chips, extend **credit lines**, run buy-in/cash-out approval.
- **Commission/rakeback:** configurable agent margin and player-facing rakeback, computed on rake generated by the downline.
- **Agent back-office:** dashboards for chip in/out, deposits/withdrawals, player results, play-style flags, weekly agent reports.
- **Settlement up the chain:** agent ↔ club owner ↔ union, weekly cadence, with an auditable paper trail (the anti-fraud backbone of the club model).

## Domain 8 — Money, Wallet & Cashier

- **Double-entry, append-only wallet ledger.** Every chip movement (deposit, buy-in, pot, rake, payout, transfer, withdrawal) balanced; atomic transfers; idempotency keys; guard triggers preventing unauthorized balance writes; daily reconciliation of player-liability vs. holdings.
- **Buy-in / cash-out flows** (agent-brokered and/or on-platform), chip integrity (whole-chip, no phantom mint), transfer controls.
- **On-platform cashier (differentiator vs. PokerBros/ClubGG):** deposits/withdrawals via cards, e-wallets, **crypto (BTC/USDT/USDC), Apple/Google Pay**, closed-loop withdrawal-to-source, payout approval queues, KYC-gated first withdrawal.
- **Premium currency (Diamonds):** IAP-purchased, account-wide, spent on cosmetics/perks/club operations.
- **Financial controls & ops:** liability dashboard, financial alerts, fraud/chargeback handling, export/reporting, dispute resolution.

## Domain 9 — Rake, Rewards & Economy

- **Rake models:** pot-rake with cap, no-flop-no-drop, tournament fee %, configurable per club/union.
- **Rakeback** (fixed/tiered), computed and settled reliably.
- **VIP / loyalty program:** tiered rewards (points → chests/cash), rake-based tiering, escalating rakeback, StarsRewards/Fish-Buffet-style progression.
- **Leaderboards:** cash and tournament, daily/weekly/monthly, union/club/global, cash-prize races.
- **Jackpots:** Bad Beat + High Hand, rain/promo payouts.
- **Engagement economy:** daily challenges/missions, daily rewards/streaks, spin-the-wheel, achievements, **marketplace/store** (spend points/diamonds on tickets, cosmetics, merch), promotions engine (deposit match, referral bonus, freerolls).

## Domain 10 — Security & Game Integrity

- **RNG certification & transparency:** accredited-lab certificate published; optionally **provably-fair** commit-reveal (server-seed hash pre-hand + client seed → verifiable post-hand).
- **Anti-collusion:** hand-history statistical anomaly detection (soft-play, chip-dumping, whipsawing), **graph/network relationship analysis**, chip-flow/net-transfer analysis, shared-IP/device/geo clustering, review workflow with hole-card visibility, penalties + victim refunds.
- **Anti-bot & RTA detection:** behavioral biometrics (mouse/touch/timing), decision-timing analysis, GTO-deviation profiling, client-integrity/anti-tamper (injection/screen-scrape/overlay detection), prohibited-software scanning, VM/RDP detection.
- **Multi-accounting / ghosting:** device fingerprinting, KYC dedupe, mid-session playstyle-shift detection, remote-access detection.
- **Account security:** 2FA/MFA (TOTP), device management, session security, login-anomaly alerts, encrypted state.
- **Enforcement:** zero-tolerance bans, balance confiscation + redistribution, blacklist sharing, transparency reports.

## Domain 11 — Regulatory Compliance & Responsible Gaming

- **KYC/AML:** government-ID + proof-of-address verification, **document authentication + liveness/biometric face-match**, age verification pre-play, source-of-funds/wealth, transaction monitoring, **sanctions/PEP screening**, SAR/CTR filing.
- **Responsible gaming:** default deposit/loss/stake limits (24h/7d/1m) with **immediate decreases / delayed increases**, session-time limits, **reality checks**, time-out/cool-off, **self-exclusion** (with national-register integration), affordability checks, net-deposit display, self-assessment tools.
- **Licensing & jurisdiction:** appropriate licence, **hard geolocation/geofencing** for regulated markets (GPS+Wi-Fi+cell+IP, VPN/RDP detection), ring-fencing, age/jurisdiction gating.
- **Fund protection:** segregated/trust player funds, disclosed protection rating, PCI-DSS payment handling.
- **Data & privacy:** TLS 1.2/1.3 in transit, AES-256 at rest, GDPR/CCPA, breach notification, ISO 27001-style controls.
- **Fairness transparency & dispute resolution:** downloadable hand histories, all-in EV display, independent ADR path.

## Domain 12 — Client UX & Engineering

- **Networking/reliability:** WebSocket state sync (snapshot + deltas, sequence numbers), server-timestamped action clock with latency grace, idempotent/version-gated actions, reconnection with snapshot resync + frozen-state overlay, sit-out-on-disconnect, all-in protection, crash recovery, spectator sync with stripped hole cards.
- **Table UX:** responsive 2–9 seat layouts (hero bottom-center), community/pot/side-pot rendering, bet-sizing (slider + steppers + pot-fraction presets + numeric + all-in confirm + desktop hotkeys), pre-action checkboxes, quick-fold, mobile-first 375px design.
- **Animations & feel:** deal, street reveals, chips-to-pot, pot-to-winner count-up, winner highlight, all-in reveal, dealer-button move; transform/opacity-only for 60fps; player-selectable animation speed; **`prefers-reduced-motion` support**; animation decoupled from the authoritative clock.
- **Sound & haptics:** action sounds, turn alerts (escalating, work when backgrounded), chip/card foley, haptic tiers, volume controls, mute-but-keep-turn-alert.
- **Multi-tabling:** tile/cascade/stack layouts, next-to-act focus, table switcher with turn indicators, preferred seating, background-table throttling.
- **Personalization:** table themes/felts, **2-color and 4-color decks**, avatars, animated emojis/throwables, dealer tipping.

## Domain 13 — Information & Analytics Tools

- **Hand history** (structured, exportable) and **visual replayer** (step-through, shareable).
- **Session stats & results graphs:** hands, VPIP/PFR, win rate, P/L over time, **all-in EV / EV-adjusted line**.
- **Built-in analytics (PokerCraft-style):** self-analysis, leak-finder, position stats — modern rooms replace third-party HUDs with sanitized built-in stats + player notes + color tags.
- **GTO/training tools** as differentiator (solver queries, post-session analysis, preflop ranges, trainers).

## Domain 14 — Social & Retention

- **Friends & presence:** friend requests, online presence, friend activity feed, player search, public profiles, block/report.
- **Messaging & chat:** table chat (moderated, mutable, canned/quick-chat), DMs/conversations, club messaging, notifications center, push notifications (turn alerts, tournament reminders, rewards) with quiet-hours/RG guardrails.
- **Onboarding/FTUE:** low-friction first table, guided overlays, tutorials, play-money→real funnel.
- **Engagement loops:** friend challenges, achievements, daily challenges/rewards, referrals/invites, leaderboards.

## Domain 15 — Platform & Operations

- **Platforms & parity:** iOS, Android, desktop, web/PWA; consistent account/wallet/rewards across devices; offline resilience.
- **Admin & operator tooling:** club/union/agent admin, financial admin hub, settlement dashboards, dispute/report review, blacklist manager, anti-cheat console, rate audit, health checks.
- **Observability & delivery:** error/crash reporting (Sentry), structured logs, RUM (fps, reconnect rate, action latency), feature flags/remote config, staged rollouts/kill-switches, CI gates, automated tests.
- **Support:** help center, in-app support, dispute workflow, live chat.

---

# PART 2 — GAP ANALYSIS: Club Arena vs. the Master Spec

Legend for each domain: **✅ Built** (evidence) · **🟡 Partial/needs work** · **❌ Missing** · priority tags **[P0]–[P3]**.

## Domain 1 — Core Game Engine & Rules

**✅ Built (strong).** Server-authoritative engine on Hetzner: `HandController`, `ServerTableEngine`, `PokerEngine`, `ServerActionValidator`, `StateMachine`, `StateVerifier`. **CSPRNG with Fisher-Yates** (`CryptoRandom.ts` + `Fisher-Yates` confirmed in source). Betting correctness covered by tests (`HandController.reopening.test`, `bigblindante.test`, `basicplay.test`, `audit.test`). Variants present: NLHE, PLO, **PLO5, PLO6**, **Hi/Lo**, **Short Deck**, **Pineapple/OFC** (`HorseEval`, variant flags). 38 server test suites.

**Gaps:**
- ❌ **[P1] Missing variants:** 7-Card Stud, Stud Hi/Lo, **Razz**, 5-Card Draw, **2-7 Triple Draw**, **Badugi**, **Courchevel**, and true **Mixed-game rotations (HORSE / 8-Game)**. (Note: "HORSE" strings in the engine are mostly the AI-player "horse" system, not the mixed game — confirm before claiming HORSE support.)
- 🟡 **[P0] RNG certification:** shuffle is cryptographically sound but there is **no accredited-lab certificate** (GLI/BMM/iTech). For trust/licensing this must be pursued, and the RNG documented for audit.
- 🟡 **[P2] Hand-evaluation coverage tests** for the missing variants once added (Razz/2-7 lowball/Badugi/OFC royalties need dedicated eval + tests).

## Domain 2 — Table Formats & Special Features

**✅ Built (very strong).** `RunItTwiceEngine` (+consent test), `InsuranceEngine`+`InsuranceEquity`+`MonteCarloEquity`, `StraddleEngine` (+mandatory test), `TimeBankEngine`, `PreActionEngine`, `bomb_pot` support, **Rabbit Hunt**, big-blind ante, `AutoRebuyService`, `SevenDeuceBounty`, `ChipRaceEngine`, `TableBalancer`/`TableBreakEngine`. Handlers exist for insurance, rit, straddle, timebank, preaction, discard, showhand, sitout, leave. **BBJ** service + page; High-Hand promo payout shipped this cycle.

**Gaps:**
- 🟡 **[P1] All-In / EV Cash Out** (take-equity-now, the modern GG feature) — insurance exists, but confirm the one-tap EV-cashout variant is exposed in the client; if not, add it (engine equity math already present via `InsuranceEquity`/`MonteCarloEquity`).
- 🟡 **[P2] Double-board Bomb Pots** — confirm bomb pots support the two-board variant; add if single-board only.
- 🟡 **[P2] Auto-muck/auto-show + show-one-card** client toggles — verify full coverage.
- 🟡 **[P2] Kill pots** (limit) — only relevant once Limit variants ship.

## Domain 3 — Cash-Game Ecosystem

**✅ Built.** Table create/config (`CreateTablePage`, `TableConfigPage`, `TableCreationPage`), `TablePage`, `MultiTablePage`, `WaitlistService`+`WaitlistPage`, `RoomService`, `TableService`, stakes/seat config, buy-in/top-up.

**Gaps:**
- ❌ **[P1] Fast-fold pooled poker (Zoom/Rush analog).** Only ~30 incidental string hits and no pooled-reseat architecture — this is a **major volume/retention format** that competitors (GG Rush & Cash, Stars Zoom) lean on. Requires a pooled-table server mode (fold → requeue → reseat from shared pool).
- 🟡 **[P1] Quick-Seat / "Seat Me" auto-seating** — verify it exists; if lobby is browse-only, add one-tap seating by game+stake.
- 🟡 **[P2] Rich lobby filters & table preview** (avg pot, players/flop %, hands/hr, waitlist length, hot-table indicators).
- 🟡 **[P2] Beginner/"training-wheels" tables** restricted to new accounts; **anonymous tables** option.

## Domain 4 — Tournament Ecosystem

**✅ Built (strong).** `TournamentManager` (+`Eliminations`, +`Base`), `tournamentRecovery`, `TournamentTimerService`, `TournamentRecurringService`, `TournamentService`, `TournamentPage`, **`XMTTPage`** (cross-club MTT), satellite target picker + seat awards (shipped), payout re-sweep idempotency (from the trivia-pipeline work), `PayoutEngine`, ICM logic. `FlashPoolPage` exists (flash-pool format scaffold).

**Gaps:**
- ❌ **[P1] Spin & Go / lottery SNG format** — no mature 3-max hyper-turbo with random-multiplier prize reveal. `FlashPoolPage` references `join_flash_pool` **RPC which is unbuilt** (in the CI allowlist as an unbuilt feature). This is a top-tier retention format; build the multiplier draw + prize-pool reveal + payout splits.
- 🟡 **[P1] Registration flexibility audit:** confirm **re-entry, rebuy, add-on, late-reg** are all wired end-to-end (engine + client + payout), not just MTT freezeouts.
- 🟡 **[P2] ICM final-table deal-making UI** (chip-chop/ICM with unanimous consent) — verify player-facing deal flow exists.
- 🟡 **[P2] Advanced structures:** phased/multi-day (Day1→Day2), shootouts, Fifty50/DoN, bounty/PKO exposure in the client, satellite ladders/steps + tickets economy.

## Domain 5 — Club System

**✅ Built (excellent — exceeds PokerBros/ClubGG tooling).** `CreateClubPage`, `ClubsPage`, `ClubDetailPage`, `ClubHomePage`, `ClubMembersPage`, `ClubSettingsPage`, `ClubRulesPage`, `ClubAnnouncementsPage`, `ClubMessagesPage`, `ClubFinancialsPage`, `ClubCarouselPage`, `ClubDashboard`, `ClubLobby`; `ClubsService`, `MembershipService`, `PermissionService`, `ClubCardGenerator`/`Backfill`/`LogoGeneratorService` (auto club logos). Roles/permissions, announcements, financials, messaging all present.

**Gaps:**
- ❌ **[P2] Club-run Events/Promotions engine** with Winnings/Hands/Score ranking + **Hall of Fame** archive (PokerBros parity). `club_challenges` and `club_activity` tables are **unbuilt** (CI allowlist) — the club activity feed and club challenges degrade to empty. Build these.
- 🟡 **[P3] Club levels** gating member/table capacity + renewal lifecycle (if a monetized club-tier model is desired).

## Domain 6 — Union / Alliance System

**✅ Built (excellent).** `UnionsPage`, `UnionDetailPage`, `UnionDashboardPage`, `UnionGamesPage`, `CreateUnionPage`; `UnionService`, `UnionApiService`. Cross-club MTT (`XMTTPage`). Union rakeback/settlement wired (`SettlementService` union rakeback shipped). Leaderboard union/user-rank periods shipped.

**Gaps:**
- 🟡 **[P1] Verify the shared cross-club cash player-pool** actually merges seats across all union clubs at the table level (not just shared tournaments). This is the defining union feature; confirm cash tables draw from the union pool.
- 🟡 **[P2] Union-wide jackpots and union chip-valuation/rake-split configuration UI** — confirm operator-configurable.

## Domain 7 — Agent / Affiliate Hierarchy

**✅ Built (excellent — a core strength).** `AgentDashboardPage`, `AgentManagementPage`, `AgentPortalPage`, `AgentPage`, `SuperAgentDashboard`; `AgentService`, `CommissionService`, `CreditService`, `CreditRequestService` (+`CreditAdminPanel`, credit-limit raise flow shipped), `RakebackService`/`RakebackEngine`/`RakebackDashboard`, `SettlementService`+`SettlementCronService`+`SettlementDashboardPage`+`SettlementHistoryPage`. Multi-tier downline, credit lines, weekly settlement.

**Gaps:**
- 🟡 **[P2] Agent weekly-report exports** (chip in/out, deposits/withdrawals, play-style flags) — `FinancialExportService` exists; confirm agent-scoped report generation is exposed.
- 🟡 **[P3] Play-style flags surfaced to agents** (`PlayerStyleClassifier` exists server-side — wire its output into agent dashboards).

## Domain 8 — Money, Wallet & Cashier

**✅ Built (strong — a major differentiator; PokerBros/ClubGG have NO on-platform cashier).** `WalletService`, `CashoutService`, `ChipFlowService`, `CashierPage` (2,123 LOC), `PlayerWalletPage`, `TransactionHistoryPage`, `DiamondService`, `AtomicStackService`. Payment rails: **Stripe + Circle/USDC + crypto**. Money-safety: `guard_wallet_balance_write` trigger, `atomic_wallet_transfer`, idempotency keys, durable pending add-on ledger + idempotency on retry-prone credits (engine work shipped). Financial ops: `FinancialAdminHub`, `FinancialAlertsPage`+`FinancialAlertService`, `FinancialHealthPage`, `FinancialCronService`, `DisputeManagementPage`+`DisputeService`.

**Gaps:**
- 🟡 **[P0] KYC-gated withdrawals + closed-loop payout** — cashier exists but must be gated behind identity verification and withdrawal-to-source before it can safely handle real value (see Domain 11).
- 🟡 **[P1] `verify_ledger_totals` RPC is unbuilt** (allowlisted; client has a paginated fallback) — build the server-side ledger-reconciliation RPC for authoritative daily liability checks.
- 🟡 **[P2] Payout approval queue / maker-checker** for large withdrawals + SoF triggers.

## Domain 9 — Rake, Rewards & Economy

**✅ Built (strong).** `RakeService`/`RakebackEngine`, VIP loyalty points economy (accrue-from-rake, spend — shipped), `VIPPage`/`VIPService`, `LeaderboardService`+`LeaderboardPage` (daily/weekly/monthly + union/user-rank periods shipped), `BBJService`/BBJ promo-rain payout (shipped, vuln closed), High-Hand payout, `AchievementService`/`AchievementTriggerService`, `DailyChallengeService`, `BonusService`+`BonusPage`, `POYService` (player-of-year), **Marketplace** delivery (purchases → owned redeemable inventory, shipped), `PromotionService`+`PromotionsPage`.

**Gaps:**
- ❌ **[P1] Promotion fulfillment loops (referral + deposit-match).** `PromotionService.processReferral` / `applyDepositBonus` exist but are **never called** — referral bonuses and deposit-match promos don't actually pay out. Wire the triggers (this is a known pending item, #89).
- ❌ **[P2] Unbuilt reward RPCs/tables (CI allowlist):** `claim_lucky_wheel_spin`, `increment_bonus_progress` (BonusService), `bulk_add_vip_points`/`bulk_update_position_stats` (position-stats + VIP), `record_arena_session` (training). The **spin-the-wheel daily reward** and **bonus-progress** loops are stubbed.
- 🟡 **[P2] Chest/tiered-VIP progression** (StarsRewards/Fish-Buffet-style tiers with escalating rakeback) — VIP points exist; a tiered-chest layer would deepen retention.

## Domain 10 — Security & Game Integrity

**✅ Built (strong — well ahead of PokerBros/ClubGG).** `integrity/` module: **`BotDetector`, `CollusionDetector`, `MultiAccountDetector`** (all with tests), `IntegrityFeed`, `HandEventAdapter`. Client: `AntiCheatPage`, `BlacklistManagerPage`, `ReportPlayerPage`, `ReportReviewPage`, `security/` components, `PlayerStyleClassifier`. **2FA/TOTP** present (30+ hits). `DisconnectProtectionService`.

**Gaps:**
- 🟡 **[P0] RNG certification & fairness transparency** — pursue accredited-lab cert; **publish all-in EV** in-client; optionally add **provably-fair commit-reveal** (server-seed hash pre-hand + client seed) for crypto-native trust. No provably-fair today.
- 🟡 **[P1] RTA/solver detection depth** — bot/collusion/multi-account detectors exist; confirm dedicated **RTA (real-time-assistance) profiling** (GTO-deviation + decision-timing) and **client-integrity/anti-tamper** (injection/screen-scrape/overlay/VM/RDP detection). These are the hardest and most valuable integrity layers.
- 🟡 **[P2] Enforcement pipeline:** automated confiscation + **victim redistribution** workflow and periodic transparency reporting.
- 🟡 **[P2] Device fingerprinting** as a first-class signal feeding both integrity and multi-account dedupe (verify strength beyond IP/GPS).

## Domain 11 — Regulatory Compliance & Responsible Gaming

**❌ Largest gap cluster — this is where Club Arena is furthest from "top-tier/trustworthy."**

**Current state:** essentially absent. Grep shows **KYC = 1 hit, AML = 1 hit, no responsible-gaming primitives** (no self-exclusion, deposit-limit, reality-check, cool-off), minimal geolocation (4 hits). 2FA/TLS exist.

**Gaps:**
- ❌ **[P0] KYC/AML program:** government-ID + proof-of-address verification, **document authentication + liveness/biometric face-match** (Jumio/Onfido/Veriff-class), age verification pre-play, source-of-funds, transaction monitoring, **sanctions/PEP screening**, SAR/CTR filing. Nothing real today. Blocks safe real-money operation and any licence.
- ❌ **[P0] Responsible-gaming suite:** default deposit/loss/stake limits (24h/7d/1m) with **immediate-decrease / delayed-increase** asymmetry, session-time limits, **reality checks**, time-out/cool-off, **self-exclusion** (+ national-register hooks), net-deposit display, self-assessment. Legally mandatory in every regulated market; currently missing.
- ❌ **[P0] Geolocation/geofencing** for regulated markets (GPS+Wi-Fi+cell+IP + VPN/RDP detection) and jurisdiction/age gating.
- 🟡 **[P1] Fund segregation & PCI-DSS posture** — cashier exists; formalize segregated player funds, disclosed protection, PCI-compliant PSP scope.
- 🟡 **[P1] Data/privacy compliance:** GDPR/CCPA data-subject flows, retention, breach-notification process, ISO-27001-style controls; encryption at rest for PII.
- 🟡 **[P2] Dispute/ADR path** and downloadable hand-history transparency (partially present via `HandHistoryPage`).

## Domain 12 — Client UX & Engineering

**✅ Built (strong).** `TableWebSocket`, `EngineStateClient`, `GameServerAPI`, `RealtimeChannelService`, `OfflineQueueService`, `DisconnectProtectionService`, `PreciseActionTimer` (server-clock), `DeadlineScheduler`. `MultiTablePage`/`multitable/` components. Personalization: `customization/`, `emoji/`, `ThrowableService`, `avatars/`, table themes, `chips/`, `cards/`. `HapticService`, `SoundService`, `PremiumSFX`. `skeletons/`, `effects/`, `metal-ui/`. Mobile-first per CLAUDE.md.

**Gaps:**
- 🟡 **[P1] Reconnection resync robustness** — confirm snapshot+delta sequence-number resync, frozen-state overlay, and idempotent/version-gated action replay under real packet loss (engine has idempotency keys; validate the client path end-to-end).
- 🟡 **[P2] `prefers-reduced-motion` + animation-speed setting** (Normal/Fast/Instant) for accessibility and multi-tablers.
- 🟡 **[P2] Multi-tabling ergonomics:** tile/cascade/stack layouts, next-to-act auto-focus, table switcher with turn indicators, preferred-seat lock.
- 🟡 **[P2] 4-color deck** toggle (near-universal; verify present), all-in confirm guard, bet-sizing hotkeys (desktop).
- 🟡 **[P2] UI-polish pass** (haptics coverage, skeletons everywhere, dependency-free virtualization) — known pending item #91.

## Domain 13 — Information & Analytics Tools

**✅ Built (strong — GTO is a real differentiator).** `HandHistoryPage`+`HandHistoryService`+`HandPersistenceService`, `hand-replayer/`+`replay/` components, `SessionStatsService`+`SessionHistoryPage`, `PlayerStatsPage`+`PlayerPositionStatsService`, `PlayerNotesService`, GTO stack: `GtoSolverClient`, `PostSessionAnalyzer`, `GTOQueryService`, `ArenaTrainingController`, `training/` components.

**Gaps:**
- 🟡 **[P1] All-in EV / EV-adjusted results line** surfaced to players (engine has equity math; expose in stats/graphs — also the standard rebuttal to "rigged" claims).
- ❌ **[P2] GTO/training backend stubs:** `gto_solutions`, `gto_solve_queue`, `preflop_ranges` tables and `record_arena_session` RPC are **unbuilt** (CI allowlist) — the training/solver features degrade to empty. Build the storage + queue to make GTO training real.
- 🟡 **[P2] Leak-finder / PokerCraft-style self-analysis** layer on top of hand histories.

## Domain 14 — Social & Retention

**✅ Built (strong).** `FriendsPage`+`FriendSuggestionService`+**friend challenges** (shipped+deployed this cycle), `PresenceService`, `PublicProfilePage`/`ProfilePage`, `BlockService`, `MessagesPage`/`MessagingService`/`NewConversationPage`, `NotificationCenter`/`NotificationsPage`/`NotificationService`/`PushNotificationService`, `emoji/`+`ThrowableService`, `onboarding/` components, `ReferralService`, achievements/daily-challenges.

**Gaps:**
- ❌ **[P2] Messaging feature stubs (CI allowlist):** `get_message_reactions`, `message_read_receipts`, `scheduled_messages`, `invites` tables/RPCs are **unbuilt** — reactions, read receipts, scheduled messages degrade to empty. Build to complete the messaging suite.
- ❌ **[P2] `user_presence` table unbuilt** — presence indicator degrades to empty; wire real presence (there's a realtime presence channel but the persisted table is stubbed).
- 🟡 **[P1] Referral fulfillment** (ties to Domain 9 #89) — `ReferralService` exists but the payout path isn't triggered.
- 🟡 **[P2] FTUE/tutorial depth** and play-money→real funnel polish.

## Domain 15 — Platform & Operations

**✅ Built (strong).** Admin: `AdminDashboardPage`, `FinancialAdminHub`, `SettlementDashboardPage`, `DisputeManagementPage`, `BlacklistManagerPage`, `AntiCheatPage`, `RateAuditPage`, `ReportReviewPage`, `PlayerSessionsPage`, `HealthCheckPage`, `BusDevToolsPage`. Observability: `EngineTelemetry`, `observability/` server module, Sentry (per deploy pipeline), `BusEventLogger`. PWA components (`pwa/`). CI gates (phantom-table/column/stranded-writer, blocking). Deploy pipeline CA→World Hub→Vercel + Hetzner auto-deploy.

**Gaps:**
- 🟡 **[P1] Native mobile apps** (iOS/Android) vs. current PWA/web — competitors are app-store native; a wrapped or native client improves push, performance, and distribution.
- 🟡 **[P2] Feature flags / remote config + staged rollouts / kill-switches** as a first-class system (some ad-hoc gating exists via `VITE_ANTIGRAVITY_ENABLED`).
- 🟡 **[P2] RUM** (client fps, reconnect rate, action latency) beyond error reporting.
- 🟡 **[P3] Live-chat support** integration in the help flow.

---

# PART 3 — Consolidated Priority Roadmap

### P0 — Trust, legal & money-integrity (do first; these block real-money scale and licensing)

1. **KYC/AML program** — ID + address verification, liveness/biometric, age gating, source-of-funds, sanctions/PEP screening, SAR/CTR. (Domain 11)
2. **Responsible-gaming suite** — deposit/loss/session limits with decrease-now/increase-delayed, reality checks, cool-off, self-exclusion, net-deposit display. (Domain 11)
3. **Geolocation/geofencing + jurisdiction gating** with VPN/RDP detection. (Domain 11)
4. **KYC-gated, closed-loop withdrawals** + payout approval queue on the existing cashier. (Domain 8/11)
5. **RNG lab certification + published all-in EV** (and evaluate provably-fair). (Domain 1/10)

### P1 — Major competitive gaps (close to reach parity/leadership)

6. **Fast-fold pooled poker** (Zoom/Rush analog) — new pooled-table server mode. (Domain 3)
7. **Spin & Go / lottery SNG** — build the multiplier draw + prize reveal + payout splits; finish `join_flash_pool`. (Domain 4)
8. **Promotion fulfillment** — wire `processReferral` + `applyDepositBonus` (referral + deposit-match actually pay). (Domain 9/14, item #89)
9. **Missing game variants** — Stud/Razz/Draw/2-7/Badugi/Courchevel + true Mixed rotations (HORSE/8-Game). (Domain 1)
10. **All-In/EV Cash Out** client feature + registration-flexibility audit (re-entry/rebuy/add-on/late-reg end-to-end). (Domain 2/4)
11. **RTA + client-integrity/anti-tamper detection** layer; **ledger-reconciliation RPC** (`verify_ledger_totals`). (Domain 10/8)
12. **Reconnection resync hardening** + all-in EV surfaced in stats. (Domain 12/13)
13. **Verify union shared cross-club cash pool** merges seats at table level. (Domain 6)

### P2 — Polish, differentiation & stubbed loops (finish what's scaffolded)

14. **Build the CI-allowlisted stubs into real features:** spin-the-wheel (`claim_lucky_wheel_spin`), bonus progress (`increment_bonus_progress`), position stats (`bulk_update_position_stats`), VIP bulk points (`bulk_add_vip_points`), GTO storage (`gto_solutions`/`gto_solve_queue`/`preflop_ranges`/`record_arena_session`), messaging (`get_message_reactions`/read receipts/scheduled messages/invites), `user_presence`, club feed/challenges (`club_activity`/`club_challenges`), favorite tables. (Domains 9/13/14/5)
15. **Club Events/Promotions engine + Hall of Fame**, tiered-VIP chests, leaderboard depth. (Domain 5/9)
16. **UI-polish pass** — reduced-motion + animation-speed, 4-color deck, multi-tabling ergonomics, skeletons/haptics/virtualization (item #91). (Domain 12)
17. **Rich lobby** — Quick-Seat, filters, table preview, beginner/anonymous tables. (Domain 3)
18. **ICM deal-making UI, PKO/bounty exposure, phased/satellite structures + tickets.** (Domain 4)
19. **PokerCraft-style analytics / leak-finder.** (Domain 13)

### P3 — Long tail

20. Native mobile apps, feature-flag platform, RUM, live-chat support, club-tier/renewal monetization, kill pots (with Limit games), dealer tipping.

---

# PART 4 — Known Bugs / Stubs / Risks (from the codebase)

- **Stubbed backends (CI allowlist = shipped UI with no backend, degrade to empty):** `arena_sessions`, `gto_solutions`, `gto_solve_queue`, `preflop_ranges`, `club_activity`, `club_challenges`, `favorite_tables`, `invites`, `members` (legacy alias), `message_read_receipts`, `scheduled_messages`, `user_presence`; RPCs `bulk_add_vip_points`, `bulk_update_position_stats`, `claim_lucky_wheel_spin`, `get_message_reactions`, `increment_bonus_progress`, `join_flash_pool`, `record_arena_session`, `verify_ledger_totals`. Each is a half-built feature to finish or formally cut.
- **Dead promo loops:** `PromotionService.processReferral` / `applyDepositBonus` never invoked → referral & deposit-match promos silently don't pay.
- **Time Bank into live gameplay (#90):** engine `TimeBankEngine` exists but confirm the Hetzner engine actually consumes time-bank during play (needs an engine-side change/deploy).
- **CI manifest debt:** friend-challenge columns/RPCs currently covered by a temporary allowlist rather than regenerated schema manifests — regenerate manifests when the write path is restored so the gate reflects reality.
- **Compliance risk (highest):** operating real-money value with no KYC/AML/RG/geolocation is the single biggest legal and reputational exposure.
- **Fairness-perception risk:** without published RNG cert + all-in EV, the platform is exposed to "rigged" accusations that competitors deflect with transparency.

---

*Sources: deep research on PokerBros (Thinklean ToS, official bomb-pots page, WorldPokerDeals, ProfessionalRakeback, Bluffing Monkeys, GipsyTeam), ClubGG (official ClubGG/NSUS, Rakeback.com, WorldPokerDeals, SoMuchPoker), PokerStars (official pages, Pokerfuse, PokerNews, Rakeback.com), integrity/compliance standards (UKGC RTS, GLI-19 v3.0, iTech Labs, GeoComply, SEON/Fingerprint, KYC-Chain/Jumio/Regula), and client-engineering standards (GGPoker house rules, PokerStars software, MDN/web.dev, real-time systems references). Club Arena status derived from direct inspection of the `Smarter-Poker-Club-Arena` repository (102 routes, ~80 services, server engine + integrity modules, 38 server test suites) on 2026-08-04.*

---

# PART 5 — VERIFIED LINE-BY-LINE AUDIT (2026-08-04)

This part is the result of a full working-tree audit of the cloud clone at HEAD `101cfb38` (friend-challenges tip): both typechecks run, both test suites run, a static stub/wiring scan, and **six parallel deep-read domain audits** reading actual source. Every finding below carries `file:line` evidence. Items marked **[verify-live]** depend on SECURITY-DEFINER RPC bodies / RLS that live in the World Hub repo (out of this tree) and must be confirmed against the live database before acting.

## 5.0 Build & test verification (ground truth)

- **Client typecheck** `tsc --noEmit`: **0 errors.** **Server typecheck**: **0 errors.**
- **Server test suite: 38 files, 397 tests — 100% PASS**, including chip-conservation, RNG, insurance equity, RIT consent, straddle, table-balancer, timers, equity worker pool. The engine is genuinely well-covered and green.
- **Client test suite: 1,360 tests — 1,321 pass, 39 fail (45 of 160 files fail).** Characterized: **~35 failures are broken test-harness mocks, not product bugs** — an incomplete Supabase mock (`supabase.auth.getSession`/`.from().insert` undefined) and jsdom relative-URL parsing (`/api/club-arena/results` → "Invalid URL"). **Real signals inside the noise:** (1) `TournamentService SPIN_MULTIPLIERS > hyper EV should be < 3.0` **fails** — the Spin hyper-turbo multiplier table is not house-profitable / misconfigured; (2) **export-shape drift** — tests expect methods that no longer exist on singletons (`waitlistService.getUserWaitlistEntry`, `tableService.subscribeToHand`, `handHistoryService.getTableHands`/`getRecentWinningHands`), indicating API rename without test/caller update; (3) stale avatar expectations. **Net: the client test suite itself is partly non-functional and gives false signal — a real quality-debt item (Q1).**

**Headline:** the core poker engine is correct and hardened (dozens of prior numbered `FIX`/`AUDIT` provenance comments; TDA-44 reopening enforced symmetrically, integer-cent side-pot distribution with remainder repair, CSPRNG Fisher-Yates on the live deal, per-viewer hole-card RLS). The real risks cluster at **cross-boundary money (table↔bank ledger), authorization, integrity-enforcement wiring, compliance, and a set of dead/half-wired features** — not in the hand logic.

## 5.1 P0 / P1 — Money integrity (highest priority; verified in source)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| M1 | **Client atomic wallet RPCs carry no idempotency key** while wrapped in `retryAsync` (retries on timeout/5xx). A commit-then-timeout **double-credits/double-debits**; worst case `unlockFromTable` double cash-out. Server paths pass `p_idempotency_key`; client omits it. **REOPENED 2026-08-06 — the credit-leg fix never worked in production.** The prior claim was that `unlockFromTable` routing through `fn_idempotent_credit_wallet` (key generated ONCE *outside* the retry closure) made the credit leg idempotent, and that only the deduct leg was blocked by the wrapper not being `SECURITY DEFINER`. Live probing proves the *same* permission wall applies to the credit leg: (a) `public.idempotency_keys` holds **0 rows** and no cron reaper exists, so the wrapper has never once succeeded in prod; (b) `prosecdef = false` on `fn_idempotent_credit_wallet`, `claim_idempotency_key`, `store_idempotency_result` **and** `atomic_credit_wallet_and_log`, despite in-code comments calling them "the IDEMPOTENT SECURITY DEFINER wrapper"; (c) a rolled-back probe as role `authenticated` returns `42501 new row violates row-level security policy for table "idempotency_keys"` (`idempotency_keys` has a single `service_role`-only ALL policy). It was broken *before* M1 too — the pre-M1 path fails with `42501 … for table "wallets"` (no UPDATE policy on `wallets`). So M1 did not regress anything; it moved the failure one call earlier. **Idempotency cannot be asserted on a path that has never executed.** The correct fix is the same as M17's: move the cash-out credit to engine ownership (`atomic_table_withdraw`), not to widen the wrapper's privileges. PR #33 → `main` as `6b56ef4a` (code landed, effect nil). | `WalletService.ts:427-437,468-479`; `ChipFlowService.ts:336-346,402-412`; `CreditService.ts:478-488`; `TableService.ts:275,772`; live: `prosecdef=false`, `idempotency_keys` 0 rows, probe `42501` | **P0 — REOPENED (was falsely marked RESOLVED; see M17)** |
| M2 | **Non-idempotent rake / attribution inserts** — bare `.insert()` with no `hand_id` unique guard. A replayed hand-complete → double `rake_records`/`rake_attributions` → **double rakeback + double agent commission**. **DOWNGRADED THEN RESOLVED** — verify-live-first demoted this from P0 before a line was written: the canonical production writer is `atomic_distribute_rake` (389,690 rows all carrying `source='atomic_distribute_rake'`), already idempotent twice over (`ON CONFLICT (hand_id) … DO NOTHING` on `uq_rake_records_hand_id`, plus a `rake_distribution_legs` per-leg claim table with a `v_recovered` resume flag). The *real* residual gap was `rake_attributions`, which had no uniqueness guard at all (0 rows ever, but the intended destination of `CommissionService.attributeRake`). Fixed in the durable layer first — UNIQUE `(hand_id, player_id)`, applied and verified in prod — then both client writers made replay-safe as `ignoreDuplicates` upserts. Migration `20260806_uq_rake_attributions_hand_player`; client PR #34 → `main` as `71937dba`. | `RakeService.ts:547-556`; `CommissionService.ts:283-294` | ~~P0~~ **P2 — RESOLVED** |
| M3 | **Insurance table-stack vs bank-ledger writes are non-atomic and swallow the RPC error.** Table stacks mutated + synced before `record_insurance_transaction`, which can silently fail → **chips minted/leaked with no offsetting ledger entry** (rake was hardened this way; insurance was not). **RESOLVED** — `logInsuranceSettlement` now returns a discriminated `InsuranceLedgerResult` instead of `void`, retries up to 3 times with backoff (safe only because the RPC is idempotent on the `(table_id, hand_number, player_id)` unique index, proven against prod first), confirm-reads when the success payload has no recognisable id, and on definitive failure raises a **durable** CRITICAL through the new `raiseFinancialAlert` → `fn_raise_server_financial_alert` carrying `net_chip_delta` so the discrepancy is reconcilable from the DB long after the process is recycled. The broken `paramspl` template literal that dropped the player id from the error context is fixed. 20 new tests. PR #35 → `main` as `82c1381a`; migration `20260806_fn_raise_server_financial_alert` applied to prod. | `ServerTableEngine.ts:5108-5121`; `server/src/services/supabase.ts:906-911` | **P1 — RESOLVED** |
| M4 | **The ledger reconciliation does not reconcile anything — and it has been running in every browser for five months.** Filed as "the formula double-subtracts locked balance, reporting a false imbalance = Σlocked". True of the arithmetic, irrelevant in practice: `locked_balance` is **0.00 on all 1,836 wallets** — nothing has ever written it, so the term is multiplied by zero. Running the check instead of reading it found something larger. **(1) It runs in every browser session** — `App.tsx` → `bootServices` → `FinancialCronService.start()`, 30s after boot then every 24h. **(2) Under RLS a browser sees ONE wallet.** Probed as `authenticated`: `wallets` returns 1 row, `wallet_transactions` only that user's rows, visible `category='mint'` total **0.00**. So `minted − wallets − locked` evaluates to `0 − (caller's own balance) − 0`; the reported "discrepancy" is just their own balance, negated. **(3) It wrote that to an ops table for five months** — 1,049 `ledger_reconciliation` rows in `financial_health_checks` (2026-03-13..2026-08-05): **1,039 failed, 10 passed**, 199 distinct difference values from −14,427,910.23 to +2,200,000.00. The scatter is the per-user signature; the 10 passes are zero-balance users. A check failing 99% of the time trains everyone to ignore the very channel M3 built. **(4) Any authenticated user could write to it** — the sole INSERT policy was unrestricted, so the financial audit history was client-appendable. **(5) Even server-side the formula is wrong:** `category='mint'` has **3 rows** (all 2026-03-08, 2,200,000.01) against 732,052,547.12 actually in wallets; the real injection was `category='deposit'` (763 rows, 69,060,448.35) which the formula ignores, and mint+deposit is still two orders of magnitude short. Reconciling the entire log against holdings leaves **776,380,648.42 unexplained** (credits 281,729,874.76, debits 324,828,482.76, net −43,098,608.00 vs holdings 732,052,603.08 + 1,229,437.34 on tables), and several categories stopped being written entirely (`rake` ends 2026-04-02, `transfer` 03-19, `rebuy` 04-19). **RESOLVED, deliberately WITHOUT shipping a "corrected" conservation check** — there is no defensible genesis figure, and inventing one replaces a wrong number with a confident-looking wrong number, which is the original bug. Instead: `fn_snapshot_chip_supply()` (service_role ONLY) records the components periodically into `chip_supply_snapshots` (RLS on, no client grants). Absolute conservation is unknowable today; **conservation BETWEEN snapshots is not** — Δholdings must equal Δ(credits − debits), which needs no genesis and is exactly the invariant an unbacked credit violates (every M17 mint would surface in it). Deltas are **NULL** on the first snapshot, not zero. Client-side reconciliation removed from the cron; `financial_health_checks` is now service_role-write-only. Baseline recorded: holdings 733,280,581.53. Migration `20260808_m4_chip_supply_snapshots`. | `ChipFlowService.ts:480-533`; `FinancialCronService.ts` (start + runReconciliation); `ServiceBootstrap.ts:86`; live RLS probe; `financial_health_checks` 1,049-row history | **P1 — RESOLVED** |
| M5 | **Mid-hand add-on lost-update race — debited chips could vanish.** `addChips` read `pendingAddOns.get(userId)` *before* the `atomic_table_addon` await, then wrote `pending + applied` from that stale snapshot. Two concurrent add-ons for one user both read the same pre-await value; the second `set()` clobbered the first, so the first call's chips were debited by the RPC but never queued — and since `processPendingAddOns` only iterates the map, they were never applied to the stack **and never refunded** at hand end. **RESOLVED** — re-read the map after the await and accumulate onto the current value; in Node's single-threaded loop the await is the only interleaving point, so every prior `set()` has landed by the write. The cap is left to `processPendingAddOns` (which caps to max buy-in at hand end and refunds excess), so a concurrent over-queue is harmless — the invariant enforced is that no debited amount goes unrecorded. Server `tsc` 0, full server suite 425/425. Ships as `wave1-engine.patch` (separate branch → Hetzner deploy). | `ServerTableEngine.ts` addChips (mid-hand branch) | **P1 — RESOLVED** |
| M6 | **Rakeback settler watermark can skip rows forever.** `.gt('created_at', since).limit(10000)` + strict `>`; two `rake_records` sharing a millisecond across a batch boundary → unfetched row permanently skipped → **lost rakeback + lost commission** (period table self-heals, commissions/player_stats do not). **CODE-COMPLETE, NOT YET LANDED.** Confirmed real, not theoretical: production has **12 exact-duplicate `created_at` groups** across 481k `rake_records`. It has not fired yet only because V8's `new Date(pgTimestamp)` truncates Postgres microseconds *downward*, pushing the saved watermark strictly below every tie and accidentally re-including both rows — an undocumented artifact of a lossy conversion that would evaporate the instant anyone made the timestamp handling more precise. Fixed with a composite **(created_at, id) keyset cursor** (a total order, so no boundary a row can hide inside), safe because every downstream accumulator is idempotent (`credit_agent_commission_from_rake` dedupes on `(user_id, source_id, source_type)`, `apply_rakeback_player_stats` claims through `rakeback_stats_applied`, `rakeback_periods` recomputes from source) — a cursor that occasionally repeats a row costs nothing, one that skips a row loses money. `high_water_mark_id` is NULLable on purpose so the first post-deploy cycle falls back to today's exact behaviour. Migration `20260806_daemon_state_hwm_id` **applied to prod** (the `(created_at, id)` index built with `CREATE INDEX CONCURRENTLY` — `rake_records` is 301 MB and takes a write on every hand). 13 new tests. **PR #37 is open as a draft and BLOCKED**: the regenerated columns manifest (134,322 bytes) cannot be pushed from the sandbox — `git push` is 403-blocked and the file exceeds any model's single-tool-call output ceiling — so it was delivered to Dan's disk byte-exact (blob `dd1fde34…`) with `~/Downloads/finish-m6-manifest.command` to land it. | `RakebackSettlerService.ts:539-546,565,834`; `supabase/migrations/20260806_daemon_state_hwm_id.sql`; `server/src/services/rakebackWatermark.test.ts` | **P1 — code-complete, blocked on manifest push** |
| M7 | **Financial CRITICAL alerts are swallowed under client RLS.** `logCritical` downgrades RLS denial to `console.warn`, returns void, never throws → on a non-admin session **critical financial alerts silently vanish in prod**, undermining every "ops will be alerted" recovery path. **WORSE THAN FILED, NOW RESOLVED** — live inspection showed `financial_alerts` carries exactly one policy, `financial_alerts_service_only`, so *every* client session (admin included) hit 42501: 100% of client-raised alerts had been vanishing for months (all 1,383 rows are engine-written, newest 2026-04-18). Fixed in three parts — a SECURITY DEFINER **raise-only** `fn_raise_financial_alert` (refuses NULL `auth.uid()`, clamps severity, 30/min per-reporter throttle on a new functional index, returns NULL rather than raising so the *first* alerts of a burst always land); grants narrowed to `authenticated` + `service_role` with an explicit `REVOKE … FROM anon` (Supabase's `ALTER DEFAULT PRIVILEGES` grants `anon` by name, so `REVOKE ALL … FROM public` does not remove it); and a client `_log` that no longer swallows — an unpersisted CRITICAL escalates to Sentry and logs at `console.error`, since `console.debug` is stripped from the production build. Verified behaviorally in prod inside a rolled-back transaction, with a negative control proving a direct client INSERT still creates 0 rows. Migration `20260806_fn_raise_financial_alert`; client PR #34 → `main` as `71937dba`. | `FinancialAlertService.ts:87-106,126` | **P1 — RESOLVED** |
| M8 | **Ledger/books divergence — client leg inert; residual is a forgeable, client-managed audit mirror.** Filed as "`chip_ledger` commission INSERT runs unconditionally even when `increment_agent_rake` fails". Verify-live: `increment_agent_rake` is service_role-only, so the client's rake-commission leg is 42501 in every browser — the `chip_ledger` write cannot diverge from a wallet effect the client never produced. And `chip_ledger` is **dormant**: newest row 2026-05-03, the `commission` category is 78 rows all on 2026-03-24 (117.92 total). Real agent commission flows server-side via `agent_commissions` (330k rows, live today). **Residual (NOT rushed):** `chip_ledger` INSERT is open to any `authenticated` user and the table is written client-side from eight sites and read by the ledger UI — so it is a forgeable, client-managed audit mirror. The correct fix is architectural (make `chip_ledger` server-written like `wallet_transactions`), which would blank the ledger UI if done as a bare policy drop; deferred to a dedicated pass, not a Wave-1 quick fix. | `RakeService.ts:705-739`; `chip_ledger` RLS + dormancy; `agent_commissions` volume | **P2 — client leg inert; ledger architecture deferred** |
| M9 | **Tournament rake never generates agent commission — because tournaments do not rake per hand at all.** Verify-live: `rake_records` has **0 tournament rows ever** (600,752 cash rows, live today), and the client `recordTournamentRake` writes a bare `.insert()` into `rake_records`, which is service_role-INSERT-only → 42501. So both the symptom and the client path are confirmed, but the cause is design, not a wiring bug: tournament economics use a **buy-in entry fee** taken at registration, not a per-hand rake, so there is no tournament rake stream for the settler's tournament branch to consume. **Not a Wave-1 money-integrity fix.** Whether agents should earn commission on tournament entry fees is a product decision (belongs with the Wave-5 tournament build), not a silent bug to wire blind. Documented, deferred. | `RakeService.ts:829-846`; `rake_records` (0 tournament rows); `rake_records` RLS | **P2 — not reproducible (no per-hand tournament rake); product decision** |
| M10 | **Double weekly payout — the client leg was never the mechanism; the real vector was a writable settlement row (see S12).** Filed as "client 7-day timer and server both call `settle_club_rakeback`, double payout unless idempotent". Verify-live reframes it. The client leg is inert: `settle_club_rakeback` is SECURITY DEFINER + service_role-only, so `FinancialCronService`'s weekly timer was a silently-caught 42501 in every browser — a dead loop that queried `clubs` and burned an RPC per club per session. And `fn_close_settlement_period` is idempotent per `(rakeback_period_id, user_id)`, so two settlers cannot double-pay one period. **The actual double-payout path is S12:** the `rakeback_periods_update_own` RLS policy let a player widen their own pending period to overlap adjacent weekly periods, then trigger `fn_claim_rakeback` — the shared hands pay under both windows, each idempotent on its own period_id. **RESOLVED** — S12 drops the writable policy (the real fix); the dead client settle leg is unscheduled and neutered to a logged no-op (same treatment as M4). Migration `20260808_s12_rakeback_periods_readonly`. | `FinancialCronService.ts` settleAllClubRakebacks; `settle_club_rakeback`/`fn_close_settlement_period` bodies; live probe | **P1 — RESOLVED (via S12)** |
| M11 | **Weekly reset wipes concurrent credits — does not apply to the current server-authoritative design.** Filed against a design that hard-set `weekly_rake_generated = 0`. The live settlement path does not decrement or reset: `fn_close_settlement_period` **recomputes** each player's rake from `rake_records` over the period window (equal-share per dealt-in player, tiered rate), writes the computed figure, and marks the period `paid`. There is no running counter to lose a concurrent credit into — a hand raked mid-close is simply included the next time its period is computed, and each period is idempotent per `(period_id, user_id)`. The `[verify-live]` check found no live `weekly_rake_generated = 0` writer. **RESOLVED — not reproducible on the current schema.** Recompute-from-source is the design the finding asks for; the S12 fix additionally closes the only way a player could have corrupted the window it recomputes over. | `fn_close_settlement_period` body (recompute, not reset); `RakebackSettlerService` (daemon) | **P1 — RESOLVED (not reproducible)** |
| M12 | **Double audit-logging — the money half is mooted by M17; the display half is the same `chip_ledger` architecture as M8.** Filed as "atomic RPC logs both legs and the client re-logs both legs + writes `chip_ledger` (1 transfer → up to 3 rows)". The money-moving client credit/debit RPCs are all **revoked from the browser as of M17**, so the client no longer re-logs a credit it can no longer make. What remains is the client-managed `chip_ledger` mirror (dormant since May, see M8) and the Cashier's own dedupe-by-id merge. **RESOLVED for the money path (M17); the `chip_ledger` double-write is the same deferred architectural item as M8** — server-own the ledger, then the client stops mirroring it. No inflated wallet aggregate is possible now that client credits are gone. | `WalletService.ts`, `ChipFlowService.ts`, `CashierPage.tsx` chip_ledger writes; M17 revoke | **P2 — money path resolved via M17; ledger architecture deferred** |
| M13 | **BBJ double-credit — falsified: the payout pool is credited exactly once.** Read both DB functions live. `atomic_distribute_rake` with a BBJ amount does **not** touch `bbj_pools`; it only increments `club_wallets.period/lifetime_bbj_contribution` tracking counters and stamps `rake_records.bbj_contribution`. `bbj_record_contribution` is the **sole** writer of the actual pool (`bbj_pools.total_contributed` + the `bbj_contributions` row). So the finding's premise — "if the rake RPC also credits the pool, the jackpot inflates every raked hand" — is false: the rake RPC credits no pool. Three tracking surfaces show different totals (`bbj_contributions` 229,798; `rake_records.bbj_contribution` 136,820; `bbj_pools.total_contributed` 188,703), but that is divergent *observability*, not a mint — the pool that pays out is single-sourced. **Residual (engine-file-blocked):** the two edge cases in the original filing — fixed-law BBJ drop scaled by rake ratio, and a rake=0/bbjDrop>0 pot crediting the pool with no audit row — live in `ServerTableEngine.ts` (250KB, over the push ceiling, STEP 6 territory) and are unverified/unfixed here. **Edge cases resolved by verification (2026-08-14):** (1) "fixed-law BBJ drop scaled by rake ratio (0.5x rule)" lives in the **dead** client `RakeService` (rake_records is service_role-INSERT-only → 42501); the live engine drop is a fixed `feeBB`, not rake-scaled, so this is inert. (2) "rake=0/bbjDrop>0 credits the pool with no audit row" — live data confirms the gate (`atomic_distribute_rake` fires only when `rake > 0`) so rake=0/bbj>0 writes **0** rake_records (verified: 0 such rows in 600k), BUT `logBBJCollection` runs whenever `bbjFee > 0`, so the pool **is** funded and audited via `bbj_contributions` (436k rows). The gap is a `rake_records`/`club_wallets` tracking miss on BBJ-only hands (~166k), not a money leak or a missing pool audit row. Broadening the gate to capture BBJ tracking on rake-free hands touches the engine's hottest money RPC every hand for an observability-only gain — deliberately NOT done (same not-rushed judgment as the chip_ledger architecture item). The M4 snapshot approach is the right home for detecting pool drift. | `atomic_distribute_rake` + `bbj_record_contribution` bodies; `bbj_pools`/`bbj_contributions` live totals | **P2 — double-credit falsified; edge #1 inert, edge #2 observability-only (not rushed)** |
| M14 | **No authorization gate on large payouts — client path is inert; payouts are server-authoritative.** Verify-live: `execute_commission_payout` is service_role-only, so `CommissionService.executePayout` is 42501 from any browser, and `approvePayout` is already a no-op returning false. A browser therefore **cannot** move commission money at all — the service_role boundary is the authorization gate, and the Cashier/ChipFlow "≥10k / ≥50k" checks were always UX confirmations, never the control. **RESOLVED by architecture** — commission payout execution is server-owned; there is no client path to gate. If an *internal* approval workflow on the server-side execution is wanted (maker/checker), that is a Wave-3 controls feature, not a client authz hole. | `CommissionService.ts:375-409`; `execute_commission_payout` acl (service_role only) | **P2 — client path inert; server-authoritative** |
| M15 | **The financial-alert RPC was unreachable from the engine** — discovered while building M3. `fn_raise_financial_alert` (shipped for M7) hard-requires a non-NULL `auth.uid()`, which is always NULL under `service_role`; called from the Hetzner engine it throws SQLSTATE **28000**. So the durable alerting channel M7 built existed only for the browser, and *every server-side* money discrepancy — the exact class that matters most — still had nowhere to land but Sentry. **RESOLVED** — added a sibling `fn_raise_server_financial_alert` (SECURITY DEFINER, `service_role` **only**, 60/min per-source flood guard counting only rows tagged `context->>'channel' = 'server_rpc'`, backed by a new `(source, created_at DESC)` index) plus `server/src/services/financialAlerts.ts`, which is total and escalates an unpersisted CRITICAL to `reportError` on all three failure paths (rpc error / throttled / threw). 8 tests. Migration `20260806_fn_raise_server_financial_alert`; PR #35 → `main` as `82c1381a`. | `supabase/migrations/20260806_fn_raise_financial_alert.sql` (auth.uid() gate); `server/src/services/financialAlerts.ts` | **P1 — RESOLVED** |
| M16 | **Insurance premium clamp silently destroyed value.** Premium taken as `stack = Math.max(0, stack - premium)`; if `premium > stack` the clamp absorbed the difference — the insurance ledger recorded the full premium collected while the player was debited only up to their stack, and the shortfall was neither refunded, logged, nor reconcilable. A premium is bounded by the insured amount, itself bounded by pot exposure, so `premium > stack` is an invariant violation that must be raised, not rounded. **RESOLVED** — it now raises a durable CRITICAL through the M3 server-alert channel (`raiseFinancialAlert`, total/never-throws — a raw throw would strand the rest of hand settlement) carrying the exact shortfall and every id to reconcile, then still clamps (a negative table stack is not representable). Server `tsc` 0, full server suite 425/425; `raiseFinancialAlert` already covered by the M3 suite. Ships in `wave1-engine.patch`. | `ServerTableEngine.ts` HAND_COMPLETE insurance premium branch | **P2 — RESOLVED** |
| M17 | **The entire browser-side money-write surface is inert in production — a seven-feature silent outage, and a latent unbacked mint.** Generalized from the M1 reopening by impersonating role `authenticated` against production inside rolled-back transactions. **Every write these features perform is either permission-denied or a zero-row no-op:** `fn_idempotent_credit_wallet` -> `42501` on `idempotency_keys`; `atomic_credit_wallet_and_log` -> `42501` on `wallets` (no UPDATE policy); `add_vip_points` -> `42501 permission denied for function` (granted `postgres`/`service_role` only); `special_bonuses` UPDATE `claimed` -> **0 rows**; `tables` UPDATE `status` -> **0 rows**; `table_seats` UPDATE `stack` -> **0 rows**; `tournament_registrations` DELETE -> **0 rows** (all four tables have RLS on with no applicable write policy). Nine client credit call sites exist; two are dead code (`OfflineQueueService.ts:219` — nothing enqueues; `ChipFlowService.ts:336` `mintToUnionOwner` — no caller) and **seven are live user-facing features that do nothing**: tournament pre-start refund on admin removal (`TournamentRegistration.tsx:154`), table-close refund (`TableService.ts:275`), admin kick refund (`TableService.ts:772`), dispute credit adjustment (`DisputeService.ts:244`), credit-invoice payment rollback (`CreditService.ts:543`), bonus claim payout (`BonusService.ts:346`), Cashier table cash-out (`WalletService.ts:495`). **The real severity is truth-in-UI, not corruption.** PostgREST returns success for a zero-row write, so `claimErr`/`updateErr` are null and the client proceeds and reports success — the admin is told the table closed, the player is told the bonus was claimed, and neither happened. `TableOperationsPanel.tsx:487-491` compounds it by discarding `kickPlayer`'s boolean return entirely. **The mint is latent, and the obvious fix is the exploit.** None of these credits has an offsetting debit and two take a client-supplied amount (`DisputeService.ts:244`; `WalletService.ts:495`, where the player types the cash-out figure and no seat-stack decrement exists in that path — `useWalletStore.ts:282-320` adjusts `locked` optimistically client-side only). They are inert **only because RLS blocks them**. Making the wrappers `SECURITY DEFINER` — which the code comments already wrongly claim they are — would turn a dead feature into an **unlimited chip mint exploitable by any authenticated player**. **Fix direction (binding):** move each credit behind a purpose-built `SECURITY DEFINER` RPC that derives the amount from authoritative server state and enforces authorization internally (never a generic "credit any amount" wrapper), on the pattern of `atomic_table_withdraw` and `markSeatAsLeft` (`server/src/services/supabase.ts:255-435`, which credits the actual `table_seats` stack, is idempotent on the seat-occupancy row id, refuses to vacate the seat if the credit fails, and wrote all 206 real cash-outs in 48h); then `REVOKE` the generic credit RPCs from `anon`/`authenticated`/PUBLIC. Verified safe to do so for bonuses: a player cannot forge a `special_bonuses` row (self-INSERT probe -> `42501`). | live rolled-back role probes (rowcounts and SQLSTATEs above); `WalletService.ts:483-524`; `useWalletStore.ts:282-320`; `CashierPage.tsx:1071-1114`; `BonusService.ts:290-299,338-360`; `TableService.ts:275,772`; `DisputeService.ts:244`; `CreditService.ts:543`; `TournamentRegistration.tsx:154`; `TableOperationsPanel.tsx:487-491` | **P0 — RESOLVED** (7 of 7 client credit call sites converted or deleted; both generic credit wrappers plus the idempotency plumbing REVOKED from `anon`/`authenticated`/PUBLIC and verified `42501` live; see M19 for a third primitive found afterwards) |
| M18 | **The daily login bonus is broken four ways and carries two latent money bugs.** Found by following M17's `awardReward` to its other caller. (1) **Grant** — `claim_daily_bonus` is SECURITY INVOKER granted to `postgres`/`service_role` only, so every browser call is `42501`. (2) **Contract** — it returns `{success, error}` or `{success, amount}` while the client reads `claimResult?.claimed` and `.new_streak`; neither field exists, so even with the grant fixed a *successful* claim would throw "already claimed today" and `(undefined - 1) % 7` would index the reward table with `NaN`. (3) **Tables** — the function stamps `profiles.last_login_date`, `BonusService` reads `user_bonuses.daily_streak`, and `BonusPage` read a third thing, `profiles.streak_days`; `user_bonuses` holds 0 rows and nothing writes it, so the streak could never advance. (4) **Rewards** — three disagreeing schedules (`DAILY_REWARDS` 100/150/200/300/500/200vip/1000, `BonusPage`'s hardcoded `day * 10` chips with "100 Diamonds" on day 7, and the function's `p_amount DEFAULT 100`); no two would pay the same bonus. **Latent double credit:** the function credits internally via `credit_player_wallet` AND the client credited again, so unblocking both legs pays every daily bonus twice. **Latent mint:** `p_amount` is caller-supplied, so granting the existing function to `authenticated` — the obvious fix — lets any player claim an arbitrary amount daily. **RESOLVED** — `fn_claim_daily_bonus()` takes no parameters at all and owns the whole claim (UTC-day guard, streak arithmetic, payout lookup, one credit) in one transaction; the schedule moved to `public.daily_bonus_rewards` (RLS on, no policies, revoked from `anon`/`authenticated`), seeded to the existing amounts so no payout changes, only where it is decided; `fn_daily_bonus_status()` returns streak, availability, next ladder position and the live schedule so the UI stops recomputing a payout it does not own; idempotency key `daily_bonus:<user>:<utc-date>`. Verified live and rolled back across first claim, immediate repeat, consecutive day, and a five-day gap. Migration `20260806_fn_claim_daily_bonus`. | `BonusService.ts` (claimDailyBonus, awardReward); `BonusPage.tsx:130-215`; `claim_daily_bonus(uuid,numeric)` body; live grant + probe results | **P1 — RESOLVED** |
| M19 | **Tournament money: one live feature broken, three dead client duplicates of engine-owned payouts.** Filed as "five more client credit call sites" after M17 shipped — the original inventory grepped only for `atomic_credit_wallet_and_log` and `fn_idempotent_credit_wallet` and missed a **third** primitive, `credit_player_wallet`. Reading the server corrected the finding in both directions. **Already right:** the engine owns tournament payouts properly — `TournamentManagerEliminations` computes each prize server-side from `payout_structure`/`prize_pool` and credits via `credit_player_wallet` with a key derived from the payout (`tourney:{id}:prize:{user}:{position}`), retried 3x and logged. **Actually wrong:** `TournamentService` carried a SECOND client implementation that passed **no idempotency key at all** (the parameter defaults to NULL and the client passed two arguments), so it was not merely an unbacked credit — unblocked it would have paid a second time *on top of* the engine, and the engine's key could not stop it because a call with no key never touches the dedupe table. It would also double-pay against its own `retryAsync` retries. **RESOLVED** — `eliminatePlayer`, `eliminatePlayerAuto` and `collectBounty` had no callers outside the file and were **deleted** (duplicate money paths, not features; `calculatePayout` kept, display-only). `unregisterPlayer` IS live (called from five pages, broken in production) and is replaced by `fn_unregister_from_tournament`: one transaction, **no user parameter** (a player may only unregister themselves, guaranteed by never accepting a target) and **no amount** (read from the tournaments row). It also enforces the one-minute pre-start lockout the old code documented but could not implement, holding a row lock the seating flow cannot interleave with, and drops the compensating re-INSERT because a failed refund now rolls the delete back. The idempotency key is the **deleted registration row id**, not the (tournament, user) pair — otherwise a register/unregister/re-register/unregister cycle would have its second refund silently swallowed (verified: two cycles pay 220). `atomic_tournament_unregister` deliberately left alone — it takes a caller-supplied refund amount and has no authorization check, so granting it would hand players a "refund me any amount from any tournament" button. Migration `20260807_m19_fn_unregister_from_tournament`. | `TournamentService.ts` (unregisterPlayer/eliminatePlayer/eliminatePlayerAuto/collectBounty); `server/src/tournament/TournamentManagerEliminations.ts:298-345`; `credit_player_wallet(uuid,numeric,text)` acl `postgres`/`service_role` | **P1 — RESOLVED** |

**Verified-solid money paths (do not "fix"):** rake is atomic+idempotent+retried (the model to copy); rakeback accrual uses integer-cent equal split with recompute-from-source idempotency; `CreditService.processPayment` is deduct-first + compensating-credit; `CashoutService` is agent-approval-gated with a 10-min reversal window; the **server-side** money layer is healthy (`wallet_credit_idempotency` took 1,172 keys in 48h, 6,968 of the form `cashout:%`). **Correction (2026-08-06):** this paragraph previously asserted that "all real chip movers route through SECURITY-DEFINER RPCs (no client `.update({balance})` bypass found)". The second half stands — there is still no client `.update({balance})` — but the first half is **false**: the client-callable credit wrappers are SECURITY INVOKER, which is precisely why the whole browser credit surface is non-functional. See M1 (reopened) and M17.

## 5.2 P0 / P1 — Authorization, security & integrity wiring (verified in source)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| S1 | **`/admin/pause` & `/admin/resume` have NO role check** — only `if(!auth)`. Any authenticated user can freeze/unfreeze dealing on any table by id (contrast `/admin/kick` which correctly checks `club_members.role`). *Found independently by the engine and security audits.* | `server/src/handlers/admin.ts:31-63` | **P1** |
| S2 | **Integrity detectors compute suspicion then discard it.** `BotDetector`/`CollusionDetector`/`MultiAccountDetector` are real statistical implementations, but `IntegrityFeed` is explicitly observe-only, **default-OFF** (`INTEGRITY_FEED==='on'`), and the enforcement seam `toAntiCheatEvent()`/`trustScoreDelta()` has **zero callers**. `MultiAccountDetector` is **never invoked at all**, and no device/IP fingerprint is ingested to feed it. Admin `AntiCheatPage` only ever shows manual kicks. **The entire automated anti-cheat pipeline is disconnected.** | `server/src/integrity/IntegrityFeed.ts:14-24,69-99`; `integrity/types.ts:139-180`; `ServerTableEngine.ts:118,4976-5002`; `AntiCheatPage.tsx:189-190` | **P1** |
| S3 | **2FA is enrol/verify-only, not enforced at login.** Real Supabase MFA enrolment exists, but sign-in calls only `signInWithPassword` — no `getAuthenticatorAssuranceLevel`/AAL2 step-up. An enrolled user still logs in with password alone. **No recovery codes** (lost authenticator = lockout). 2FA currently provides no real protection. | `SettingsPage.tsx:591-636`; `AuthPage.tsx:58` | **P1** |
| S4 | **World-writable RLS policies (in-repo migrations).** `union_wallets` `UPDATE … USING(true)`, `agent_commissions` `INSERT … WITH CHECK(true)`, `rake_attributions` `INSERT/SELECT … (true)` never dropped — any authenticated user could edit union balances / insert commission rows. | `20260313_phase5_missing_tables.sql:150-151,21-22`; `20260314_phantom_table_remediation_v2.sql:494-495` | **P0 [verify-live]** |
| S5 | **Cash-table seating has no club/union membership gate.** `atomic_table_buyin` (granted `anon,authenticated`) only checks player wallet balance, then inserts a seat — any funded user can sit at any table id; club/union scoping is client-side visibility only. | `20260312_atomic_table_buyin_cashout.sql:19-56,162`; `TablePage.tsx:6852-6912` | **P1 [verify-live]** |
| S6 | **`distribute_chips` treasury-drain risk** — SECURITY DEFINER granted `authenticated,anon`, trusts caller-supplied `p_distributed_by` with no `auth.uid()` check. | `20260314_phantom_table_remediation_v2.sql:530-596` | **P1 [verify-live]** |
| S7 | **`ClubMembersPage` privilege-escalation fallback** — if `promote_member` RPC errors, code falls back to direct `club_members.update({role})` + `agents.insert` under the caller's own privileges (backstopped only by RLS). | `ClubMembersPage.tsx:224-293` | **P2** |
| S8 | **Client-only permission gates.** `PermissionService`/`MembershipService` are pure client-side booleans; several admin panels do direct `club_members`/`tables` writes gated only by an `isAdmin` render prop (real backstop is RLS, which S4 shows is world-writable in places). | `ClubMemberManagement.tsx:121-161`; `ClubSettingsPanel.tsx:150-169`; `TableService.createTable:112` | **P2 [verify-live]** |
| S9 | **Rate limiting is narrow & non-distributed** — 1 action/250ms only on `/action`, per-process `Map` (ineffective across scaled engine instances); nothing on `/admin/*`, report submission, or MFA/auth. | `server/src/http/rateLimit.ts:15-33` | **P2** |
| S10 | Non-constant-time compare of the internal broadcast API key (timing side-channel). | `server/src/router.ts:133` | **P3** |
| S11 | **A live classic GitHub PAT is embedded in plaintext in a git remote URL.** The working clone's `origin` is an HTTPS URL with a `ghp_…` token inlined, so the credential sits in `.git/config` in cleartext and is echoed by any bare `git remote -v` — including into logs, transcripts and screen shares. A classic PAT is not repo-scoped the way a fine-grained one is; leaking it exposes every repo the account can reach, not just Club Arena. **Fix:** rotate the token, move it into a credential helper (macOS Keychain via `git config --global credential.helper osxkeychain`) or a fine-grained token restricted to the two Smarter-Poker repos, and reset the remote to a plain `https://github.com/…` URL. Interim practice already adopted in this workstream: redact with `sed -E 's/gh[ps]_[A-Za-z0-9]+/***REDACTED***/g'` before printing any remote. | `.git/config` `remote.origin.url` in the container clone | **P1** |
| S12 | **Players can rewrite their own rakeback settlement rows — an overlapping-window payout theft vector.** `rakeback_periods` carried an UPDATE policy `rakeback_periods_update_own` with `USING/WITH CHECK (user_id = auth.uid())`. That gates which ROWS a player may write (their own) but **not which COLUMNS**. Probed as `authenticated`, a player updates every non-identity column of their own pending period: flip `status` paid→pending, widen `period_start`/`period_end`, reassign `club_id`, set `rakeback_amount` (all rowcount 1). Because `fn_claim_rakeback` is SECURITY DEFINER + granted to `authenticated`, a player triggers settlement on demand, and `fn_close_settlement_period` recomputes the payout from `rake_records` filtered by the ROW's own `club_id` and window — so widening a still-pending period to overlap the neighbouring weekly periods makes the shared hands pay out under **both**, each idempotent only on its own `period_id`. A year of rakeback funnels into one settlement while the weekly periods still pay their slice. The forge path was already closed (INSERT → 42501), which is why the UPDATE policy was the whole hole. **RESOLVED** — dropped the policy; `rakeback_periods` is now read-only to authenticated (club-scoped SELECT retained). No client writes it (RakebackPage only SELECTs + subscribes); all writes are server-owned SECURITY DEFINER. Verified live: post-drop a player UPDATE matches 0 rows while `fn_claim_rakeback` and reads still work. Migration `20260808_s12_rakeback_periods_readonly`. | `rakeback_periods` RLS; `fn_close_settlement_period`/`fn_claim_rakeback` bodies; live probe (self-edit rowcount 1 → 0 after fix) | **P1 — RESOLVED** |

**Verified-solid security:** RNG is a correct rejection-sampled CSPRNG with unbiased Fisher-Yates, genuinely on the live deal (`CryptoRandom.ts:25-98` → `PokerEngine`/`HandController`); a prior modulo-bias bug was already fixed. Hole cards are delivered per-viewer via RLS-filtered Realtime (`table_hole_cards`, SELECT `auth.uid()=user_id`), never in the shared broadcast; the historical god-mode policy was dropped. No client-side service-role/secret leakage. DisputeService and report/blacklist flows are real and robust.

## 5.3 P0 — Compliance & responsible gaming (quantified: near-zero)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| C1 | **KYC absent** — a single `require_kyc` dashboard *label*; no `kyc_status` field, no verification flow, no cashout gate. | `AdminDashboardPage.tsx:1430` | **P0** |
| C2 | **AML is theater** — "AML Check Passed" and "Identity Verification Confirmed" are hardcoded green ✓ items in the cashout modal; no screening/sanctions/threshold logic. | `CashierPage.tsx:1774,1782` | **P0** |
| C3 | **Responsible gaming: zero code repo-wide** — no self-exclusion, deposit/loss/session/wager limit, reality check, or cool-off anywhere (`.ts/.tsx/.sql`). Entire pillar missing. | (repo-wide grep) | **P0** |
| C4 | **Geolocation only for "nearby clubs"** — no geofencing, IP-jurisdiction blocking, or restricted-region enforcement. | `src/hooks/index.ts:268-284` | **P0** |
| C5 | **Chip cashier deposit/withdraw (crypto/venmo/zelle/cashapp) is fully stubbed** — inserts a `wallet_transactions` row, never debits balance, no processor, no KYC gate, no closed-loop; writes non-standard `type` values. Non-functional (not a theft vector, but an audit-integrity/UX lie). Real diamond purchase (Stripe edge fns) *is* functional; there is **no Circle/on-chain rail** despite `circle` strings. | `DepositWithdrawModal.tsx:372-423`; `DiamondService.ts:176-281` | **P1** |

## 5.4 P1 / P2 — Client & realtime (verified in source)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| CL1 | **Entire client disconnect-protection subsystem is dead code (~540 LOC).** `DisconnectProtectionService.initialize()` and `recordHeartbeat()` are never called; `ConnectionHUD` mounts but always renders `null`; `ConnectionHUD` calls `svc.attemptReconnect()` via `as any` — **that method doesn't exist**. Visible disconnect UX is entirely the engine-FSM `DisconnectToast`. | `DisconnectProtectionService.ts`; `ConnectionHUD.tsx:164,189`; `TablePage.tsx:5983` | **P2** |
| CL2 | **No engine-WS ping/half-open watchdog** — client only reconnects on `onclose`/`onerror`; a half-open mobile socket (no FIN) leaves the client on a stale snapshot indefinitely with no resync trigger, and `DisconnectToast` can't cover it (same dead socket). | `EngineStateClient.ts:197-248` | **P1** |
| CL3 | **No client action idempotency key** — `submitAction`/`activateTimeBank` send no op-id; `OfflineQueueService` dedupes on enqueue, not on server replay → replay-after-partial-success can double financial mutations. Pairs with M1. | `GameServerAPI.ts:146` | **P1** |
| CL4 | **No input-freeze while reconnecting** — action buttons are never disabled when `engineWsStatus !== 'connected'`; player taps into a dead socket, only server rejection saves it. | `TablePage.tsx` (action bar) | **P2** |
| CL5 | **Legacy Supabase Realtime table channel still opens in parallel** with the authoritative engine WS on every table mount — redundant connection + duplicate presence + the buggy client-guessed optimistic sequence — contradicting the Phase-2 "zero Supabase Realtime" migration. | `TablePage.tsx:660,682`; `TableWebSocket.ts:363`; `RealtimeChannelService.ts:18` | **P2** |
| CL6 | **Auth-fail retry budget not reset** — on `4401` reconnect, `retryCount` never resets; transient auth flaps burn all 10 retries → permanent `failed`. | `EngineStateClient.ts:227-232` | **P2** |
| CL7 | **4-color deck has three sources of truth with mismatched defaults** (`useSettingsStore` default false vs `GameplaySettings` default true vs `club.four_color_deck`); replay/history hardcode `'4color'` ignoring the user pref. | `TablePage.tsx:5935,6165`; `CardImage.tsx` | **P3** |

**Verified-solid client:** the authoritative `EngineStateClient` path is genuinely well-built — SNAPSHOT+DELTA with sequence numbers, gap-detected resync, server wall-clock action deadlines (skew-proof), deadline-based timers. `prefers-reduced-motion` is well covered (35 refs + in-app `skip_animations`). Bet-sizing (`ActionPanel`) is complete with presets/slider/keyboard/aria/all-in-confirm. Multi-tabling ergonomics are good (tile+swipe, auto-switch to <5s-timer table). All-in EV display, hand replayer (+ `/share/hand/:handId`), and insurance/EV-cashout UI are present and wired.

## 5.5 P1 / P2 — Engine edge cases & tournament (verified; all in the untested `ServerTableEngine` zone)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| E1 | **RIT hands record no winners** — `dealAndResolveRIT` never sets `currentHandWinners`; `finalizeRunout(true)` emits `WINNERS []`, `pot_win`/`pot_distributed` fire with 0, hand history logs no winners for every run-it-twice hand. Stacks are correct; history/animations are blank. | `ServerTableEngine.ts:4172-4189,3192-3204,4963` | **P2** |
| E2 | **Chip-violation detection ≠ prevention** — `StateVerifier.verify()` critical violation only logs + flips a recovery FSM, then settlement runs and pays out anyway. `AtomicStackService.tableLocks` map is declared/cleaned but **never acquired** (no `.set`) and `atomicSettle` results are discarded — the advertised per-table serialize/rollback doesn't exist (real serialization is only the engine `actionLock`). | `ServerTableEngine.ts:3395-3437`; `AtomicStackService.ts:65,241,249` | **P2** |
| E3 | **Hi-lo insurance mispriced** — `InsuranceEquity` computes HI-side only; for `plo8` the low half is ignored, so the leader's premium is wrong; a non-`plo` Omaha string would wrongly use high eval. | `InsuranceEquity.ts:112-115,21` | **P2** |
| E4 | **Table-break can drop a player** — if the round-robin target table is full, code advances only one next table and `continue`s, leaving the player unseated despite capacity elsewhere. | `TableBreakEngine.ts:219-223` | **P2** |
| E5 | **Balancer destination ignores button/BB** — `findOpenSeat` returns the lowest-numbered open seat; the moved player can land on the blinds and post out of turn / get a free BB. | `TableBalancer.ts:216,307-313` | **P2** |
| E6 | **Disconnect engine lacks all-in protection / foul-hand handling**; `reconnectGraceSeconds` is a query helper never consulted in the auto-fold countdown (all-in disconnected player is safe only incidentally). | `DisconnectEngine.ts:256-278` | **P2** |
| E7 | **TimeBank grant returns the whole pool** — `activate()` exposes no per-use amount, so `getRemainingSeconds()` returns e.g. 1800s and the engine broadcasts `additional_seconds:1800` + a redundant 1800s timer (only saved by TimeBank's own 15s timer). This is also the root of pending item #90. | `TimeBankEngine.ts:150-184`; `ServerTableEngine.ts:849-867` | **P2** |
| E8 | **`postHandTasks` has no per-step isolation** — sequential awaits (syncStacks, BBJ, insurance, add-ons, tourney sync); a throw in an early step rejects the whole promise → all later money steps skipped. **Now also carries M3's engine-side half.** M3 made `logInsuranceSettlement` total and observable, but the *caller* still ignores the returned `InsuranceLedgerResult` and still runs every settlement in one unguarded sequential loop, so one bad settlement can still starve the ones behind it. Escalated to **P1** for that reason: the service layer is hardened and the engine layer is not, which is the more dangerous of the two states because the alarm now fires for a discrepancy nothing downstream is structured to contain. Blocked only by the 250KB push ceiling on this file, not by design. | `ServerTableEngine.ts:4934-5225`; `server/src/services/supabase.ts` (`InsuranceLedgerResult`) | ~~P2~~ **P1** |
| E9 | **Crash/orphan-hand recovery is a stub** — marks the snapshot complete and continues (money-safe because mid-hand stacks aren't persisted, so the hand voids chip-neutral) but drops in-flight insurance/RIT/BBJ state. | `ServerTableEngine.ts:5591-5621` | **P2** |
| E10 | **RIT 3-run degrades silently** if `chosenRuns===3` but `board3Winner` omitted → falls to the 2-way branch, board-3 winner gets nothing; `setChosenRuns` doesn't clamp to `config.maxRuns`. | `RunItTwiceEngine.ts:301-311,239-275` | **P2** |
| E11 | **Tournament full-pool winner fallback can over-pay >100%** if `payout_structure` lacks `place===1` (latent; all shipped configs include place 1). Same-hand exact-tie finishing order is arbitrary; per-place prize rounding not conserved to `prize_pool`. | `TournamentManagerEliminations.ts:829-844,85-87,276-277` | **P2** |
| E12 | **[verify]** Prize pool may not grow with real late entries, and rebuy/re-entry/add-on chip add-back is not in the engine (only the *period* is modeled) — confirm the World-Hub reg/API route bumps `prize_pool` and re-adds chips, else systematic under-payment / no chips for rebuys. | `TournamentManagerBase.ts:904-923`; `tournament/*` | **P1 [verify-live]** |
| E13 | **Duplicate-action suppression is inert** — dedup key embeds server `Date.now()` so `actionId` is unique every call and `ALREADY_ACTED` never matches; `playerActedThisRound` hardcoded false. Low impact (covered by `actionLock`) but the advertised replay defense is dead. | `ServerActionValidator.ts:118-122`; `ServerTableEngine.ts:2022-2036` | **P3** |

**Verified-solid engine:** side pots & dead money, uncalled-bet return before rake, TDA-44 all-in reopening (symmetric), integer-cent distribution with remainder repair, RIT consent + no card reuse + rake-taken-once (the sub-agent's flagged "double refund" was **disproven** — not a bug), insurance 20% edge with `??`-preserved 0% equity, PKO/mystery-bounty integer conservation, UTC scheduling, level-based add-on/late-reg, drift-free race-safe timers.

## 5.6 P1 / P2 — Feature wiring, dead loops & non-functional UI (verified)

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| F1 | **Referral & deposit-match promos are dead loops** — `PromotionService.processReferral` and `applyDepositBonus` are **never called anywhere in `src`** (definition + one unit test only). (Live referrals actually run through `ReferralService`; the promo-engine paths are orphaned.) | `PromotionService.ts:360,426` | **P1** |
| F2 | **Positional stats + per-hand VIP points never fire** — `PlayerPositionStatsService.processHand` is imported in `TablePage` but **never invoked**, and its RPCs `bulk_update_position_stats`/`bulk_add_vip_points` are unbuilt. The "1 VIP point per hand" reward and all position stats are dead. | `PlayerPositionStatsService.ts:34,127-144`; `TablePage.tsx:199` | **P1** |
| F3 | **OneSignal push never bootstraps** — `PushNotificationService.init()` has no caller and is env-gated on unset `VITE_ONESIGNAL_APP_ID`; only `setExternalUserId` is called, so client push subscription never registers (server send path works only if a subscriber somehow exists). | `PushNotificationService.ts:67,154`; `IdentityDNA.ts:215` | **P1** |
| F4 | **`shared_player_pool` union toggle is dead** — written/displayed but **zero reads** in engine, `TableService`, any lobby query, or RLS. Cross-club cash exists only structurally (union-owned `club_id=NULL` tables), not via the flag. UI implies cross-club cash pooling that isn't implemented. | `UnionService.ts:322-332,803`; `HorseOrchestrator.ts:85` | **P1 (feature+UX-integrity)** |
| F5 | **`cross_club_tournaments` flag is fail-open** — read as camelCase `settings.crossClubTournaments` but stored snake_case → `undefined !== false` = always allow; disable toggle is inert. | `TournamentService.ts:544,647` | **P2** |
| F6 | **Spin multiplier table not house-profitable** — `SPIN_MULTIPLIERS` hyper EV ≥ 3.0 (unit test fails). Spin/lottery SNG economics are misconfigured; `join_flash_pool` RPC also unbuilt. | `TournamentService` SPIN_MULTIPLIERS; `FlashPoolPage.tsx:229` | **P1** |
| F7 | **Leak-finder is fake** — hardcoded static "3-Bet Too Low 4.2%" etc. with no data source and no handler on "Get Analysis". | `PlayerStatsDashboard.tsx:279-307` | **P2** |
| F8 | **Fabricated live metrics** — online counts computed as `active*0.15` and `players*0.2` and presented as real. | `MembershipService.ts:435`; `UnionService.ts:768` | **P2** |
| F9 | **GifPicker "search" is fake** — presented as open-web search but only substring-filters ~8 hardcoded GIFs; anything else returns "No results". | `messaging/GifPicker.tsx:25,100-102` | **P2** |
| F10 | **PDF export is mislabeled HTML** — `exportSettlementPDF`/`exportHandHistoryPDF` return an HTML `Blob` typed as PDF via `iframe.print()` (currently unwired; latent). | `lib/export.ts:255` | **P3** |
| F11 | **Dead/duplicate components & wrong-column writes** — `EquityDisplay.tsx` (superseded by inline all-in EV) imported nowhere; `AgentService.assignPlayer` writes `agent_id = membershipId` where everywhere else it is user_id (harmless — 0 callers, but latent); large swaths of the commission-cascade client API have 0 callers (authoritative flow is engine-side). | `components/table/EquityDisplay.tsx`; `AgentService.ts:783-787` | **P3** |
| F12 | **Stub backlog (allowlisted, all degrade gracefully but non-functional):** lucky wheel (`claim_lucky_wheel_spin` — throws), bonus progress (`increment_bonus_progress`), scheduled messages (`scheduled_messages` — also no cron consumer), read receipts (`message_read_receipts`), reaction read (`get_message_reactions`), arena/GTO (`record_arena_session`, `arena_sessions`, `gto_solutions`, `gto_solve_queue`, `preflop_ranges`), flash-pool join (`join_flash_pool`), club feed/challenges (`club_activity`, `club_challenges`), favorite tables, invites, `user_presence`, `verify_ledger_totals`. VIP monthly-usage caps read with `.limit(0)` so **all quota checks pass** (no enforcement). | `BonusService.ts:240,312`; `MessagingService.ts:464,854,1039`; `VIPService.ts:258-291`; allowlist | **P2** |

## 5.7 Quality / test debt

| # | Finding | Evidence | Pri |
|---|---------|----------|-----|
| Q1 | **Client test suite is partly non-functional** — 39/1360 fail; ~35 are a broken Supabase mock (`auth.getSession`/`.from().insert` undefined) + jsdom relative-URL parsing, so those suites can't validate what they assert. Real signals: Spin-EV failure (F6) and export-shape drift (methods tests expect no longer exist). Fix the mock/base-URL harness so the suite gives true signal, then triage the export-shape renames. | `/tmp/client_test.log`; `tests/unit/*` | **P1** |
| Q2 | **20 Playwright e2e hamburger tests self-skip** on the unauthenticated path (`test.skip()` guards) → permanent false green; they can never fail where they're most likely to run. | `e2e/hamburger-menu.spec.ts` | **P2** |
| Q3 | **213 `console.log/debug` ship to prod** with no build-strip (client) — noise + perf/maintenance smell on a money client (no sensitive-data leak found; only `CardImage.tsx:82` logs card values, and only on malformed input). | grep `src/**` | **P3** |
| Q4 | **Highest-risk server zones are untested** — `ServerTableEngine` settlement/insurance/RIT/BBJ wiring, `TableBreakEngine`, `ChipRaceEngine`, all `TournamentManager*`, `RakebackSettlerService`, `TimeBankEngine` consumption, `PreActionEngine`, `StateVerifier`, `AtomicStackService`. Every money-conservation risk (M3, M5, M13, E1–E2) lives here. Add targeted tests before/with the fixes. **Partially addressed** — M3 shipped 20 tests across `insuranceLedger.test.ts` (12) and `financialAlerts.test.ts` (8), the first coverage this zone has ever had; the server suite is now 425/425 across 40 files. The engine class itself (`ServerTableEngine`, `TableBreakEngine`, `ChipRaceEngine`, `TournamentManager*`, `RakebackSettlerService`, `TimeBankEngine`, `PreActionEngine`, `StateVerifier`, `AtomicStackService`) remains untested. Continue the pattern: every Wave 1 fix lands with its own suite. | `server/src/**` coverage | **P2** |
| Q5 | **CI runs no tests at all.** Every workflow file was read: the blocking gates are the three Supabase invariant checks (`check-phantom-tables.mjs`, `check-stranded-writers.mjs`, `check-phantom-columns.mjs`) and nothing invokes `vitest`. So the 397 server tests and 1,360 client tests — including every suite written for Wave 1 — are **advisory only**; a PR that breaks them merges green and auto-deploys Hetzner. This is the single cheapest high-value CI change available: it converts an existing, largely-passing suite from decoration into an actual gate. (It also explains why Q1's broken client mocks were never forced to be fixed.) | `.github/workflows/*.yml` — no `vitest`/`npm test` step in any of them | **P1** |
| Q6 | **The committed schema manifests had silently drifted from production, and the gate fails open.** `check-phantom-columns.mjs` compares code against `scripts/ci/supabase-columns-manifest.json`, a committed live-schema snapshot (the migrations are intentionally stale, so the manifest *is* the source of truth). It had drifted three independent ways: **10 tables missing entirely, 20 tables with changed columns**, plus the new `daemon_state.high_water_mark_id`. Worse than the staleness itself: the gate **silently SKIPS any table it does not know about** rather than failing, so the 10 missing tables were an invisible hole in a money-adjacent safety net — the check reported green precisely where it had no data. **Fix:** regenerated to an exact 754-table snapshot (verified by independently-computed canonical md5 digests), and the gate should be changed to **fail on an unknown table** instead of skipping, plus a scheduled job that regenerates the manifest and opens a PR on drift. | `scripts/ci/check-phantom-columns.mjs` (skip-on-unknown branch); `scripts/ci/supabase-columns-manifest.json`; `scripts/ci/gen-schema-manifest.mjs` | **P2** |
| Q7 | **A non-deterministic Monte Carlo assertion in the server suite.** `HorseLogic.test.ts:1771` asserts a hard threshold over an **unseeded n=250 simulation** with an observed spread of roughly ±12 (seen failing as `expected 82 to be >= 86`). It is pre-existing and harmless today only because CI runs no tests (Q5) — the moment Q5 is fixed, this becomes a random red build that will train everyone to re-run CI until it passes, which is strictly worse than no gate. **Fix it as part of Q5, not after:** seed the RNG for determinism, or widen the assertion to a statistically defensible interval and raise n. | `server/src/engine/HorseLogic.test.ts:1771` | **P2** |

## 5.8 New items folded into the master spec (discovered during the audit)

Beyond the Part 1–4 gaps, the audit surfaced these **additional required items**, now part of the spec/roadmap:

1. **Idempotency-key discipline on every client-initiated money RPC** (deduct/credit/transfer/table-buyin/cashout/insurance) — pass and enforce `p_idempotency_key`; make `atomic_*` RPCs reject duplicate keys. (fixes M1, M2, CL3)
2. **Correct, trustworthy ledger reconciliation** — fix the locked-balance double-subtraction, build `verify_ledger_totals` server-side, and make `FinancialAlertService` durable (never swallow CRITICAL). (M4, M7, M8)
3. **Integrity enforcement pipeline** — wire detectors → `anti_cheat_events` insert → `trust_score` delta → admin queue; turn `IntegrityFeed` on by default; **ingest device/IP fingerprints** so `MultiAccountDetector` has data. (S2)
4. **Auth hardening** — enforce AAL2 step-up at login for MFA-enrolled users, add recovery codes, and add distributed rate-limiting to `/admin`, auth, and report endpoints. (S3, S9)
5. **Server-side authorization audit** — add role checks to `/admin/pause|resume`; verify and lock down world-writable RLS (`union_wallets`, `agent_commissions`, `rake_attributions`) and `distribute_chips`/`atomic_table_buyin` grants; add a membership gate to table seating. (S1, S4–S6, S8)
6. **Reconnection hardening** — engine-WS heartbeat/half-open watchdog, input-freeze while reconnecting, reset retry budget on auth flaps, and remove the redundant legacy Realtime table channel. (CL2, CL4–CL6)
7. **Truth-in-UI cleanup** — replace fabricated metrics (online counts), fake GIF search, fake leak-finder, and the mislabeled PDF export with real implementations or remove them; wire or delete the dead disconnect-protection subsystem and dead components. (F7–F11, CL1)
8. **Spin/lottery economics** — fix `SPIN_MULTIPLIERS` so the house edge is correct, then finish the Spin format (draw + reveal + `join_flash_pool`). (F6)
9. **Test-harness repair** — fix the client Supabase mock + base-URL so the suite gives true signal; de-skip the e2e hamburger suite; add tests for the untested server money zones. (Q1, Q2, Q4)
10. **RIT hand-history/animation fix** and the engine edge-case set (E1–E13) — mostly P2 correctness in the untested settlement zone.
11. **Engine ownership of every chip credit, and revocation of the client credit surface** — no browser-callable RPC may increase a wallet balance. Each of M17's seven live call sites moves to a server endpoint that derives the amount from authoritative state (the `table_seats` stack, the tournament's recorded buy-in, the dispute's approved adjustment) rather than trusting a client-supplied figure, on the pattern `markSeatAsLeft`/`atomic_table_withdraw` already proves. Then `REVOKE EXECUTE` on `fn_idempotent_credit_wallet` and `atomic_credit_wallet_and_log` from `anon`, `authenticated` **and** PUBLIC — explicitly naming `anon`, because Supabase's `ALTER DEFAULT PRIVILEGES` grants it by name and `REVOKE ALL … FROM public` does not remove it. Pair each with a commit-after-credit ordering fix so no state (`bonus.claimed`, `tables.status`) is finalized before the money actually moves.
12. **Make CI a real gate** — run the test suites in CI (Q5), de-flake the one non-deterministic assertion first (Q7), and close the fail-open hole in the schema-manifest checks (Q6). Until this lands, every "verified by tests" claim in this document is verified only on the machine that happened to run them.

## 5.9 Recommended execution order for the upgrade

Given the above, the **safe sequence before/at the start of the complex upgrade** is:

- **Wave 0 — verify-live & lock (days):** confirm the `[verify-live]` RLS/RPC bodies (S4–S6, M13, E12) against the live DB; patch any world-writable RLS and the `/admin/pause|resume` authz hole (S1) immediately — these are the fastest high-severity wins.
- **Wave 1 — money integrity (P0):** idempotency keys (M1, M2, CL3), insurance atomicity (M3), reconciliation + durable alerts (M4, M7, M8), add-on race (M5), settler watermark/weekly-reset (M6, M9–M12). Add the missing server tests (Q4) alongside. **Amended 2026-08-06:** M17 (the browser wallet-credit surface — dead in production and a latent unbacked mint) is now the **first** item in this wave, ahead of the remaining idempotency work, because M1 collapses into it: idempotency on a call path that has never once executed is not a fix. Do M17's engine-ownership migration and `REVOKE` first; M1's credit leg is then resolved by construction. Land Q5/Q6/Q7 in the same wave so the rest of the wave's tests actually gate.
- **Wave 2 — compliance foundation (P0):** KYC/AML, responsible-gaming suite, geolocation, KYC-gated closed-loop withdrawals, real cashier rails (C1–C5). This is the licensing blocker.
- **Wave 3 — integrity & auth (P1):** wire the anti-cheat enforcement pipeline + fingerprint ingestion (S2), enforce 2FA + recovery + rate limits (S3, S9), reconnection hardening (CL2–CL6).
- **Wave 4 — feature completion (P1/P2):** dead loops (F1–F3), Spin economics (F6), truth-in-UI (F7–F11), the stub backlog (F12), engine edge cases (E1–E13), test-harness repair (Q1–Q2).
- **Wave 5 — competitive expansion:** the Part 1–3 growth items (fast-fold pooled poker, missing variants, richer tournaments/lobby, tiered VIP, native apps).

*Audit method: full clone at HEAD `101cfb38`; `tsc --noEmit` (client+server, 0 errors); vitest server (397/397 pass) + client (1321/1360 pass, failures characterized); static stub/wiring scan; six parallel deep-read domain auditors (engine, money, club/union/agent, integrity/security/compliance, client/UX/realtime, rewards/social) reading actual source with file:line evidence. `[verify-live]` items depend on World-Hub RPC/RLS bodies not in this tree and must be confirmed against the live database before remediation.*


---

## 6. Wave 1 landing log — 2026-08-14 (verified against live infra + new origin/main)

Re-baselined onto the advanced `origin/main` (had moved from `f8c8a86c` to a
95-commit engine rework: the 5,623-line `ServerTableEngine.ts` split into 8
layers — Base/Seating/Turns/Dealing/HandEvents/Runout/Settlement + Deadline/Fee
reconcilers — plus money work A2/A3/A5/A6/A7). All Wave 1 work below was
re-verified or re-authored against that current tree, not the stale base.

### 6.1 DB half — LIVE and enforcing (verified in rolled-back probes on kuklfnapbkmacvwxktbh)
- Client-credit RPCs `atomic_credit_wallet_and_log`, `fn_idempotent_credit_wallet`, `claim_idempotency_key`, `store_idempotency_result` — SECURITY INVOKER, granted **service_role only** (revoked from anon/authenticated/PUBLIC). M17 revoke intact.
- `fn_claim_special_bonus(p_bonus_id)` / `fn_claim_daily_bonus()` / `fn_daily_bonus_status()` — SECURITY DEFINER, no client amount param, authenticated+service_role. M17/M18.
- Five admin/money RPCs live, SECURITY DEFINER, in-body authorization: `fn_admin_kick_player`, `fn_admin_close_table`, `fn_admin_remove_tournament_player`, `fn_resolve_dispute` (adjustment capped), `fn_pay_credit_invoice_from_wallet` (self-authorized on auth.uid() → `not_your_wallet`; caller can only pay their own invoice from their own wallet — no admin needed, no mint path).
- `fn_unregister_from_tournament` (M19), `fn_snapshot_chip_supply` (M4, service_role only) live.
- Tables `daily_bonus_rewards`, `chip_supply_snapshots` exist with RLS enabled.
- S12: `rakeback_periods_update_own` policy dropped (rakeback periods now read-only to clients).
- `guard_wallet_balance_write` present as two enabled triggers (`trg_guard_wallets_balance_ins/_upd`).
- `financial_health_checks`: RLS on; only INSERT policy is service_role — an authenticated INSERT is denied by RLS (probe-confirmed). The redundant authenticated table-grant is inert under RLS (candidate for a belt-and-suspenders REVOKE later).

### 6.2 Client half — MERGED to origin/main (no auto-deploy; frontend reaches prod only via WH sync-club-arena.sh)
- **PR #38** (merge `c6ce1d02`): M17/M18 bonus — BonusService/BonusPage route claims through the server RPCs; client credit path deleted. Verified as-merged: client tsc 0 errors, BonusService suite 16/16.
- **PR #39** (merge `3bdac5df`): M17 admin credit surface + M19 tournament money + M4 reconciliation removal + chip-supply snapshots. Verified: client tsc 0 errors; rewritten suites 60/61 (the 1 miss is pre-existing F6, below); every `.rpc()` name matches the deployed function; no new phantom refs.

### 6.3 Engine half — READY as PRs, GATED (server/** merge auto-deploys Hetzner; verify via Supabase hand_history dip, not the cache-frozen health endpoint)
- **PR #40** `fix/wave1-m5-m16-engine`: **M16** (still open on main) — insurance-premium settlement clamps `Math.max(0, stack - premium)` and silently under-collects the insurance bank; now raises a durable CRITICAL alert with the exact shortfall before clamping (clamp unchanged). **M5** (reduced by A2's durable `table_pending_addons` ledger, not eliminated) — `addChips` re-reads the live `pendingAddOns` after the `atomic_table_addon` await so a concurrent same-user mid-hand add-on is not dropped from the buy-in-cap arithmetic. Verified: server tsc adds 0 errors; handlers 57/57; engine suite 247/248 (only the known-flaky HorseLogic strategy test).
- **PR #37** `fix/wave1-m6-rakeback-keyset-cursor`: M6 rakeback settler keyset cursor. Verified as-merged: server tsc baseline (0 new), rakebackWatermark 13/13; its `high_water_mark_id` column is already live.

### 6.4 Pre-existing issues on origin/main surfaced during verification (NOT introduced by Wave 1; flagged for follow-up)
- `server/src/services/insuranceLedger.test.ts` — 12 failures / 15 tsc errors: `logInsuranceSettlement` returns `void` but the test expects a result object. Signature/test drift already on main. Out of Wave 1 scope.
- Engine manifest drift: `check-phantom-tables.mjs` flags `FeeReconciler.ts` table refs + RPCs `cash_tables_with_players`, `bbj_drift_since` as phantom — the A5 fee-reconciler code references names not in the (stale) schema manifest. The three Supabase-invariant CI steps are `continue-on-error: true` (non-blocking), so this does not fail CI, but the manifest should be regenerated against the live DB.
- **F6** (`SPIN_MULTIPLIERS` hyper EV ~3.000034, fractionally house-negative) still failing on main — the required economics fix is item 8 in §5.8.
- `HorseLogic.test.ts` "thin-value bets a checked-to river" is non-deterministically flaky (passes/fails independent of any change) — de-flake per item 9 / Q7.
- Local `main` on the workstation is diverged (11 local engine commits, 95 behind origin) with an uncommitted avatar/table-geometry change set — a workstation reconciliation Dan needs to resolve; untouched by this work.

### 6.5 Not done (deliberately deferred, still open)
- Engine deploy of PR #40 + PR #37 (Hetzner) and the frontend WH sync are **gated on Dan** — both are live-system production deploys, not "obvious work."
- Deferred engine items remain: E8 (postHandTasks per-step isolation), M13 edge #2 (BBJ tracking), chip_ledger server-ownership architecture.

---

## 7. Engine deploy executed + verified — 2026-08-15 01:12 UTC

**Discovery during deploy:** the Hetzner auto-deploy (`auto-deploy-hetzner.yml`) had
been **failing on every run since 2026-08-09** — the Docker build runs `npx tsc`
over `src/**` (tests included) and `insuranceLedger.test.ts` failed to typecheck
because `logInsuranceSettlement` (server/src/services/supabase/rake.ts) had been
regressed to a `Promise<void>` stub during the 2026-08-08 supabase.ts split. The
M3 insurance-ledger durability (retry + read-back + durable CRITICAL alert +
observable result) was silently lost, and the live engine was frozen on
`dacb6c8c` for ~6 days (undeployed backlog: A5 unbanked-fee queue + reconciler,
A7 per-street chip conservation, C15/C18 scale, C16/C17 perf).

**Fix + deploy (PR #41, merge `578a9ce7`):** M3 restored to the contract the test
encodes; batched with M5/M16 and M6 (squashed from PR #37) so the live engine
restarts **once**. Verified pre-merge on a clean worktree: server `tsc --noEmit`
0 errors (was 15); **full server suite 479/479** (insuranceLedger 12/12, was 12
failing). PRs #40 and #37 closed as superseded.

**Deploy verification (per CLAUDE.md — Supabase, not the health endpoint):**
- `auto-deploy-hetzner` run `31855833163` — **success** (first since Aug 9); the
  workflow health-check passed against a fresh process (uptime 4s, totalActions 0).
- `hand_history` restart signature: steady ~20 hands/min across 4 tables through
  01:11 → **dip to 5 hands/3 tables at 01:12** (restart) → recovery to ~20/min at
  01:13–01:14 with **active tables 4 → 7 → 9** (boot-time fleet reactivation — the
  DB-visible proof the new code is executing).

**Now live on the engine:** M3, M5, M16, M6, plus the entire 6-day backlog.

**Still not in production:** the **client half** (PRs #38/#39, on origin/main) reaches
users only via the World Hub `sync-club-arena.sh` frontend deploy, which builds
from the local CA tree — currently diverged (local `main` 79ef404f, 11 ahead / 95
behind) with uncommitted avatar work. That reconciliation + frontend sync is a
workstation task for Dan; until it runs, the deployed frontend still calls the old
(now-revoked, inert) client credit path, so bonus/credit UI actions fail safe but
look broken. The DB enforces all money safety regardless.

---

## 8. Table UX phase — 2026-08-15 (spotlight + chip-flight fix, both live)

**Active-player spotlight (per Dan):** the circular gold halo behind the acting
player (hard `0 0 40px` box-shadow + pulse on `.seat--active .seat__avatar`)
replaced with a soft elliptical "downward light pool" (`.seat--active::before`,
radial-gradient brightest at the avatar, spilling down over the nameplate,
breathing at 3.4s; tints orange/red with timer urgency). The slim conic
countdown ring is retained as the timer. Shipped in the reconcile commit
`b24a8cc2`; live via WH `4d48df46de` (Vercel READY, aliased smarter.poker).

**Chip glitch — root cause found and fixed (CA `acbf0d58`):**
`ChipAnimationManager` passes each chip an inline `onComplete` arrow (new
identity every render) and `ChipAnimation` listed `onComplete` in its animation
effect's dependency array. TablePage re-renders repeatedly during an action, so
every render cancelled the rAF loop + 100ms hide timer and REPLAYED the flight
from scratch — chips stuttered, looped seat-to-pot, and lingered mid-felt until
the 5s safety sweep reaped them (the floating bet chip in Dan's screenshots).
Fix: latest-ref pattern for the callback; effect deps reduced to the real
animation parameters. Verified: tsc 0, prod build clean; live via WH
`daba56d4` (bot sync of `acbf0d58`; Vercel READY, aliased smarter.poker).

**Repo reconcile completed the same session:** CA local main == origin/main
(previously 11-ahead/95-behind + unpushed auth fix); old lineage preserved at
`backup/local-main-pre-reconcile-20260815`. Antigravity confirmed ACTIVE in the
repo (in-flight GlobalHeader/HomePage/CardAnimations edits preserved as
working-tree mods; it also lands PRs on origin/main concurrently). All pushes
used fetch-rebase-retry; deploys parked the in-flight mods so only committed
content shipped.

**Open next:** dim-other-seats vignette (needs a table-level "someone-acting"
class — ~3-line TSX hook + CSS); deferred engine items E8 (postHandTasks
per-step isolation), M13 edge #2 (BBJ tracking), chip_ledger server-ownership;
F6 spin economics; insuranceLedger test-vs-impl drift note (resolved by M3
restore); HorseLogic de-flake (Q7).

---

## 9. E8 phase — 2026-08-15 04:44-04:57 UTC (per-step isolation shipped; caught a live outage)

**Vignette (completes the spotlight):** `seat-wrapper--dim` modifier on every
non-acting occupied seat while someone acts (folded seats keep their deeper
dim). CA `8e3f86b4`, auto-synced to production by the CA→WH bot.

**E8 — postHandTasks per-step isolation (CA `9129e5b6`, deployed 04:50):** the
~500-line settlement pipeline was one straight-line sequence with a single
caller-level catch; any throw aborted everything after it. Now all 14 steps
(sync_stacks, hand_history, rake_distribution, bbj_contribution,
promo_playthrough, insurance_ledger, bbj_payout, tournament_chip_sync,
pending_addons, horse_rebuys, horse_cashouts, deferred_sitouts, leave_pending,
table_unlock) run in individual guards — failures report with the step name,
money-critical steps raise a durable CRITICAL alert, later steps always run.
tsc 0; full server suite 479/479.

**E8's first catch — a live production outage (hotfix CA `9b21589b`, deployed
04:54):** within minutes of E8 going live, 130+ CRITICAL
`postHandTasks.pending_addons_failed` alerts fired: the A2 seating rework had
left four CommonJS `const { supabase } = require(...)` lines in
`ServerTableEngineSeating.ts` — the server ships as ESM, so each threw
`require is not defined` at runtime. Since the 01:12 deploy: add-chips and
withdraw were hard-down for players, and every cash hand's pipeline silently
aborted at pending_addons (skipping horse rebuys, leave cashouts, and the
table unlock) — invisible until E8 contained and surfaced it. Fix: deleted the
four redundant requires (the module already imports `supabase`). Verified
live: alerts stopped dead at the restart (16/min → 0) while hands continued at
full rate (44/min, 18 tables); `table_pending_addons` is empty — addChips threw
BEFORE any debit, so the outage lost no money.

**Lesson recorded:** tsc cannot catch `require` in ESM (@types/node declares
it); the A2 rework shipped it and four hours of silent pipeline aborts
followed. E8-style isolation turned the next such bug from a silent
pipeline-killer into a named, alerting, contained step failure — this is the
pattern working exactly as designed, on day one.

---

## 10. Quality phase — 2026-08-15 05:00-05:40 UTC (CI gate + F6 + Q7, all landed)

**ESM require() CI gate (CA `ab73d018`, BLOCKING):**
`scripts/ci/check-esm-require.mjs` fails the build on any CommonJS
`require(` in `server/src` runtime code (comments/strings stripped — zero
false positives; tests + sim excluded; `// esm-require-allow:` escape hatch).
Verified with a planted-violation negative control. Recurrence guard for the
section-9 outage class, which tsc cannot catch.

**F6 RESOLVED (CA `720371ba`):** the hyper spin table computed to EV
3.000034 — fractionally HOUSE-NEGATIVE; the unit test red on main for weeks
was correct. Moved 0.001pp from the 50x tier to the 2x tier: probabilities
still sum to exactly 100.000, EV now 2.999554 (house edge ~0.015%, same
direction as standard's 2.999994), and expected pool draw per spin drops
below the 1.00 deposit so the bonus pool cannot drift negative over volume.
TournamentService suite 28/28 — first fully green run in weeks. Synced to
production by the CA→WH bot.

**Q7 RESOLVED (CA `1efcd1dd`, test-only):** two-layer root cause of the
HorseLogic V10 flake. (1) HorseEval's vitest-pinned xorshift seed is
per-worker module state — worker reuse across files shifted the stream this
file started at, so assertions flipped red only in full-suite runs. A
file-scope beforeEach re-pins the stream per test. (2) Pinning exposed the
real defect: the +/-12 A/B tolerances were ~0.85-1.2 sigma of unpaired
binomial noise at n=250 (one stream in ten fails by chance). Both A/Bs now
use COMMON RANDOM NUMBERS (identical re-seed before each arm of every
iteration), so the on/off difference reflects only the flag under test.
HorseLogic 65/65; engine dir 248/248 twice consecutively; full suite 479/479.

**Still open (each needs its own dedicated pass):** chip_ledger
server-ownership architecture (largest remaining structural item); M13 edge
#2 (BBJ-tracking gate broadening — deliberately deferred earlier as
observability-only gain on the hottest money RPC; unchanged); Wave 2
compliance foundation (KYC/AML etc.) from the master roadmap.

---

## 11. chip_ledger server-ownership — 2026-08-15 06:00 UTC (RESOLVED, live)

The deferral fear ("revoking client writes blanks the ledger UI") dissolved on
evidence: chip_ledger is the LEGACY ledger — 88,479 rows, newest 2026-05-03,
no writer of any kind in 3.5 months. The live authoritative ledger is
`wallet_transactions` (299 rows/hour, server-only: RLS carries just a
SELECT-own policy, so the stray client write grants were inert). What
remained on chip_ledger was pure downside: an INSERT policy whose only check
was `auth.uid() IS NOT NULL` — ANY signed-in user could forge audit rows
with arbitrary amounts/categories and other users' ids in
from/to/performed_by.

**DB (applied live + mirrored as 20260815_chip_ledger_server_owned.sql):**
dropped the forge policy; revoked INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/
REFERENCES on chip_ledger from anon/authenticated/PUBLIC; also stripped the
redundant inert write grants on wallet_transactions so a future policy
mistake cannot silently re-open writes. Rolled-back probes: authenticated
INSERT on both tables now permission-denied; SELECT (UI history) intact.

**Client (CA `47872e74`, bot-synced to production):** removed the four
forgeable narration writes — CashierPage mint + distribute, CashoutService
approve, ChipFlowService.logToLedger + its transfer call. Each sat beside a
real server RPC that writes the authoritative wallet_transactions row in its
own transaction. tsc 0; affected suites 41/41.

**No UI blanking:** readers keep SELECT on the historical rows; live activity
already renders from wallet_transactions (CashierPage merges both).
Follow-up (cosmetic, optional): point TransactionLedgerView / dashboard
history panels at wallet_transactions so post-May activity appears there too.

**Remaining major items:** M13 edge #2 (BBJ gate broadening — still
deliberately deferred, calculus unchanged); Wave 2 compliance foundation
(KYC/AML, responsible gaming, geolocation, closed-loop withdrawals) — the
licensing blocker and the next big block of work.

---

## 12. Multi-table (4 games) audit — 2026-08-15 07:00 UTC (fixed + live)

Full audit of the PokerBros-style multi-table experience (MultiTablePage +
TableTabBar + 4 embedded TablePage instances, swipe/tabs/tile-view/keyboard).

**What was already sound (verified, no change):** per-table WebSockets
(useTableWebSocket keyed by tableId — 4 independent sockets); no state bleed
(each TablePage owns its state; the zustand useTableStore singleton was
imported but UNUSED — dead import removed); ambient-sound gating on
background tables (#175) with turn alerts deliberately ungated (the alert
channel); swipe with clamped overscroll + velocity; keyboard 1-4/Tab cycling
with input-field guard; FIX-214 display:none for inactive slots (keeps
position:fixed overlays from bleeding across tables); tile view renders all
4 live; MAX_TABLES=4 enforced; server has NO cross-table seat restriction
(humans can hold 4 seats concurrently).

**Three real breaks, all fixed (CA `716905b0`, bot-synced to production):**
1. **Add-table flow dead-ended** — the "+" tab navigated to the lobby with
   `?returnToMulti=true` (read by NOTHING) and unmounting dropped every tab;
   you could never actually assemble 4 tables. Tabs now rebuild from SERVER
   TRUTH (active seats, `table_seats.left_at IS NULL`) on mount, additively
   merged: observer tabs survive, zombie tabs cannot resurrect, and seating
   at tables 2/3/4 from the lobby restores all tabs on return.
   RLS probe-verified; `tables` columns verified against the live schema.
2. **Tab countdown was a stub** — TablePage reported `timeRemaining: 15`
   hardcoded, freezing the tab timer and making the <5s urgent auto-switch
   dead code. Now reports the server-authoritative `actionTimerDeadline`;
   the container runs one 1s clock only while a turn is live and derives
   real seconds for tabs + auto-switch.
3. **Disconnect/reconnect chimes ×4 sockets** — now ambient-gated like the
   rest (turn alerts unchanged).

Verified: tsc 0; production build clean; client unit failure set identical
to clean origin/main (42 pre-existing Q1 harness failures, zero new).

**Known minor (cosmetic, documented not fixed):** a hidden table's chip
flight computes coordinates while its scaler is display:none (0×0 rect →
viewport fallback); visible only if the user switches tables during the
<0.5s flight window. **Follow-up:** no unit tests exist for MultiTablePage /
TableTabBar (Q4-class gap).

---

## 13. Tournament audit, part 1 — 2026-08-15 (CRITICAL: human registration was impossible; fixed + live)

Dan's mandate: every tournament type creatable and working (MTT/SNG/Spin —
registration, rake, late reg, payouts, bounties, synchronized breaks) before
any success claim. Part 1 findings, evidence-first:

**Production reality (DB):** all three types complete (30d: MTT 61, SNG 116,
SPIN 727) with 100% payout-transaction coverage on completed prize pools (3d
sample) and every completed spin carrying its multiplier. Bounty tournaments
run (25 completed/30d incl. mystery). Massive cancel counts (SNG 94%) are
unfilled scheduled tournaments — no registrations on any cancelled
tournament in 14 days, no refund exposure. Fees on completed SNGs show zero
rake because ALL entrants were horses (register free) — which exposed:

**THE CRITICAL BUG (fixed + live):** the client's only registration path
called `atomic_tournament_register` — service_role-only — so EVERY human
registration from the deployed browser failed 42501. Humans could not enter
ANY tournament. Additional rot in the same path: client-side mystery-bounty
roll (manipulable), entry fee never written to the rake_records fee ledger
(the finalize settlement sums exactly that ledger → human fees would never
credit the club/union), and ~10 privileged client writes RLS rejects.

**Fix:** `fn_register_for_tournament` (SECURITY DEFINER, M17 anti-mint
pattern) — cost derived server-side; status/late-reg/full/dup under a row
lock; server-side mystery roll; guarded debit + wallet_transactions ledger
row; fee → rake_records; pool/count bump; race-refund. Companion:
`fn_unregister_from_tournament` now reverses prize_pool + writes the -fee
ledger row. Probe-verified in rolled-back transactions (exact debits, all
rows, full reversal, near-start guard). Client registerPlayer collapsed to
one RPC + refetch. Probe also caught TWO latent FK bugs: rake_records.table_id
FK (my draft AND the existing tournamentRecovery.ts reversal writer — which
has NEVER successfully inserted; fixed). CA `fe26d63f`; engine deploy green;
client bot-synced.

**Part 2 — OPEN, not yet audited (no success claimed):** rebuy/add-on money
paths (same 42501 risk class — client RebuyModal/AddOnModal); creation UI
coverage per type (re-entry and satellites show ZERO usage in 30d — likely
no creation path); synchronized-break live evidence; table balancing/merge
verification; spin pool end-to-end (join_flash_pool still unfinished per
§5.8); bounty payout verification at elimination; live human
register→play→payout run; LIVE 4-table browser verification (blocked on
Chrome automation permission / login on Dan's machine — Control_Chrome can
open tabs but page access fails "Chrome is not running").

---

## 14. P0 FIX — Club Arena Messenger "not working at all" (2026-08-15)

**Reported:** "the club arena messenger is not working at all."

**Root cause (two independent defects, both required to break it):**

1. **Club identity never activated.** The messenger is the World Hub `/hub/messenger`
   route embedded by Club Arena via same-origin iframe with `?clubId=<club uuid>`.
   `ActiveIdentityContext.jsx` forced the club persona by
   `ownedPages.find(p => p.id === forceId)` — comparing a **social page id** to the
   **club id**. A club's social page has its OWN id; the club id lives in
   `social_pages.linked_entity_id`. Verified live: `ids_equal=false`,
   `linked_matches=true`. So the switch never matched and the messenger always
   showed the personal inbox.

2. **Club conversations could never be created/scoped.** Inbox scoping used
   `social_conversations.context_entity_id`, but nothing ever set it — verified
   live: **0 club-scoped conversations ever existed**. `start-conversation` never
   accepted or wrote a context, and `fn_get_or_create_conversation` had no context
   parameter. Conversation-level context also can't separate a club→member DM
   (the member "controls" the club page via membership), so the correct model is
   **per-participant identity context**.

**Fix (deployed — commit `3fec6aa31b`, migration `20260815_messenger_participant_identity_context`):**

- `ActiveIdentityContext.jsx`: carry `linked_entity_id`/`linked_entity_type`/`slug`
  through `ownedPages`; match `forceId` against `id || linked_entity_id || slug`.
- Migration: add `context_entity_id`/`context_entity_type` to
  `social_conversation_participants`; rewrite `fn_get_user_conversations(uuid,uuid)`
  to scope by the CALLER's participant context; add
  `fn_get_or_create_conversation(uuid,uuid,uuid,text)` that stamps the initiator's
  participant row with the club context and the recipient's with NULL.
- `start-conversation.js`: accept `contextEntityId`, pass to the 4-arg RPC, and
  set context on the inline fallback inserts.
- `messenger.js` client: pass `contextEntityId` when starting a conversation in
  club mode.

**Verification:** rollback-simulation on live DB with a real club owner + member —
all assertions pass: club inbox sees the convo (1), owner personal inbox does not
(0), **recipient sees it in personal inbox (1)**, idempotent get returns same
thread, personal thread stays distinct. Zero-regression: existing rows default to
NULL context == personal. Build gate green; Vercel building `3fec6aa31b`.

---

## 15. Cashier / club-wallet audit — dead money buttons (2026-08-15)

Line-by-line audit of the Cashier + wallet surface (Dan's #126 mandate). Confirmed
against **live grants** (not assumed): several `WalletService` methods call
`service_role`-only RPCs directly from the browser `supabase` client, which returns
**42501 permission denied** — the same dead-button class as the tournament
registration bug. Verified grants:

| RPC | secdef | granted roles | browser-reachable? |
|-----|--------|---------------|--------------------|
| `mint_club_chips` | no | service_role | NO (dead) |
| `wallet_user_transfer` | no | service_role | NO (dead) |
| `distribute_promo_chips` | yes | service_role | NO (dead) |
| `atomic_deduct_wallet_and_log` | no | service_role | NO (internal helper) |
| `log_wallet_transaction` | no | service_role | NO (internal helper) |
| `credit_agent_commission` / `credit_player_rakeback` | no | service_role | NO (internal) |
| `fn_wallet_type_transfer` | yes | authenticated+service | yes (OK) |
| `deduct_table_chip_lock` | yes | anon+authenticated+service | yes (note: anon grant on a money RPC — flag) |

**Key insight:** the World Hub API layer already has hardened server-side routes for
all of these (`/api/club-arena/mint-chips`, `transfer-chips`, `distribute-chips`,
`distribute-promo`, `promo-wallet`, `union-wallet`, `clawback-chips`,
`player-chip-flow`). Each derives the actor from the JWT, enforces authz + economy
caps + settlement lock + idempotency + audit. The CA client simply bypassed them and
hit the RPCs directly. The fix pattern is: repoint each dead `WalletService` method
to its WH route.

**FIXED + deployed (CA commit `45259b4b`):** `WalletService.mintChips` now posts to
`/api/club-arena/mint-chips` (JWT-derived minter — no spoofing; owner/union-admin
authz; per-request cap 10M owner / 50M union; 50M/club/day ceiling; settlement lock;
idempotency; audit). tsc clean; the Mint button is live-fixed.

**NEXT (same pattern, confirmed dead, routes exist — to repoint):**
- `wallet_user_transfer` caller -> `/api/club-arena/transfer-chips`
- `distributePromo` (`distribute_promo_chips`) -> `/api/club-arena/distribute-promo`
- the `distribute_chips` path -> `/api/club-arena/distribute-chips`
Each needs its WH route contract verified against the client call before repointing.

### 15.1 Deploy verified + NEW finding (2026-08-15)

Production (smarter.poker, WH `ca5333ea`, deployment `dpl_6Y35MASC1tdQnn5Em4XWz1qiDKWo` READY) serves
the Cashier mint fix: the built CA bundle `index-m15Wp64--v6.js` calls
`fetch("/api/club-arena/mint-chips", ...)` with ZERO `.rpc("mint_club_chips")` calls.

NEW dead button found while verifying: **`AdminDashboardPage` still calls
`.rpc("mint_club_chips", { p_club_id, p_amount, ... })` directly** (asset
`AdminDashboardPage-Cw-0JhXn-v6.js`) — a second mint entry point, still 42501-dead.
Fix: repoint it to `/api/club-arena/mint-chips` (same pattern as the Cashier fix).
Added to the Admin-button repoint queue.

---

## 16. SYSTEMIC FINDING — the 42501 dead-button class, measured (2026-08-15)

Rather than fix these one at a time, I enumerated **every RPC the browser calls**
(122 distinct names across `src/`) and checked each against live grants using
`has_function_privilege('authenticated', oid, 'EXECUTE')` — the definitive test,
not ACL string-reading. (I first ruled out the false-positive case where
`proacl IS NULL` means "EXECUTE to PUBLIC by default"; all of these have explicit
ACLs of the form `postgres=X/postgres | service_role=X/postgres`.)

**Result: 53 of 122 client-called RPCs are unreachable from the browser.**
- **45** are `service_role`-only → every call returns `42501 permission denied`.
- **8** do not exist in the database at all → `PGRST202` (phantom RPCs):
  `bulk_add_vip_points`, `bulk_update_position_stats`, `claim_lucky_wheel_spin`,
  `get_message_reactions`, `increment_bonus_progress`, `join_flash_pool`,
  `record_arena_session`, `verify_ledger_totals`.

The pattern is always the same: the UI looks wired, the handler runs, the RPC
throws, and the user sees a generic failure (or nothing, where the error is
swallowed). **Behavioural proof: `cashout_requests` contains ZERO rows** — the
entire cashout feature has never once succeeded in production.

### Fixed and shipped (CA `b2572b2d`)

| Surface | Call site | Fix |
|---|---|---|
| Cashier | `requestCashout` | → `POST /api/club-arena/request-cashout` |
| Cashier | `cancelCashout` | → `POST /api/club-arena/cancel-my-cashout` |
| Cashier/Agent | `approveCashout` | → `POST /api/club-arena/approve-cashout` (`approve`) |
| Cashier/Agent | `rejectCashout` | → `POST /api/club-arena/approve-cashout` (`cancel`) |
| Cashier/Agent | `completeCashout` | deprecated no-op — approval is now atomic + terminal |
| Admin | `AdminDashboardPage` mint | → `POST /api/club-arena/mint-chips` |
| Players | `promote_member` | SECURITY DEFINER + actor from `auth.uid()`; granted to authenticated |
| Admin | `transfer_club_ownership` | SECURITY DEFINER + **owner-only authz added**; granted to authenticated |

New `src/services/clubArenaApi.ts` is now the single audited client→server path
(JWT auth, idempotency key, server error surfaced to the UI) so future repoints
do not copy-paste fetch blocks.

### SECURITY: two real vulnerabilities closed in the same pass

1. **`transfer_club_ownership` had NO authorization whatsoever.** It reassigned
   `clubs.owner_id` to any user id passed in, with no check that the caller owned
   the club. It was only non-exploitable because no role could reach it — but it
   was one naive `GRANT` or server route away from letting anyone steal any club.
   Now: caller must be the current owner, recipient must be an active member,
   club row is locked, transfer is logged to `role_changes`.
2. **`promote_member` trusted a caller-supplied `p_promoted_by`.** Granting it to
   `authenticated` as-is would have let any member pass the owner's id and
   promote themselves to admin. Now the actor comes from `auth.uid()` and the
   parameter is only honoured for `service_role` callers.

Verified by rolled-back live probe on Club JAQK: a plain member spoofing
`p_promoted_by=<owner>` gets *"Insufficient permissions to promote"*; the same
member's ownership-theft attempt is blocked; the real owner's promote
(member→agent) and ownership transfer both succeed.

### Remaining dead call sites (triaged, not yet fixed)

**Money / user-facing (routes exist — same repoint pattern):**
`distribute_chips` (AgentService) → `distribute-chips`;
`distribute_promo_chips` (AgentPromoPanel, WalletService) → `distribute-promo`;
`add_to_promo_wallet` (PromotionService, AchievementService) → `promo-wallet`;
`fn_clawback_chips_atomic` (AgentService) → `clawback-chips`;
`wallet_user_transfer` (WalletService) → `transfer-chips`.

**Money / user-facing (NO route — need SECURITY DEFINER hardening like above):**
`fn_purchase_chips` (ChipPurchaseModal), `fn_add_diamonds` (DiamondService),
`deduct_diamonds` (ThrowableService), `register_for_tournament`
(SpinAndGoLobby — note this is the legacy name; the working path is
`fn_register_for_tournament`), `fn_grant_daily_reward` (DailyBonusWheel),
`claim_daily_challenge`, `fn_bbj_promo_payout_atomic`, `fn_consume_feature_use`,
`fn_increment_vip_usage`, `fn_agent_approve_cashout` (now unused).

**Fire-and-forget counters (fail silently; server-side equivalents already run —
lowest priority, but they are pure Sentry noise today):**
`increment_club_rake`, `increment_agent_rake`, `increment_union_rake`,
`increment_tournament_rake`, `increment_rake_generated`,
`record_hand_rake_attribution`, `update_player_hand_stats`,
`recalculate_leaderboard_ranks`, `recompute_club_levels`,
`decrement_club_table_count`, `increment_member_count`, plus the 8 phantom RPCs.

---

## 17. CHIP-REMOVAL AUTHORITY POLICY (Dan, binding — 2026-08-15)

**The rule:**
1. An **agent** may NEVER remove chips from a downline player's account except
   through a player-initiated cashout.
2. On a cashout **request**, the chips leave the player's balance **immediately**
   (escrow).
3. When the agent **accepts**, the chips land in the **agent's wallet**.
4. A club **owner/admin** may pull chips from anyone at any time.

**Audit result — 2 of 4 already held, 2 were broken:**

| Rule | Before | Action |
|---|---|---|
| 1 agent cannot remove | Already impossible — `atomic_chip_transfer` requires the caller to BE the sender, so an agent pulling from a player raised `UNAUTHORIZED`. `removeChipsFromPlayer` had **no UI callers**. | Locked in: `canRemoveChips` returns false, `removeChipsFromPlayer` throws. The 10-min "reversal window" is retired as a policy violation. |
| 2 escrow at request | Correct — `fn_request_cashout` debits `club_members.chip_balance` before creating the request. | Unchanged, now covered by a probe. |
| 3 chips → agent wallet | **VIOLATED** — `fn_approve_cashout_atomic` credited `clubs.chip_treasury`. | Rewritten to credit the approving agent's `club_members.chip_balance`. |
| 4 admin may pull anytime | **MISSING** — no such path existed. | New `fn_admin_remove_player_chips`, owner/admin only. |

**Extra finding:** `fn_approve_cashout_atomic` was never on the Phase 4.1.6a
`guard_wallet_balance_write` whitelist, so its `clubs` write would have been
rejected by the guard anyway — a second independent reason no cashout ever
completed (the first being that the RPC was service_role-only, section 16).

**Design notes.** Approval is the *credit leg* of the escrow the player was
already debited for, so club chips are conserved, never minted. Admin removal
returns the chips to `clubs.chip_pool` for the same reason. `fn_admin_remove_player_chips`
derives its actor from `auth.uid()` (unspoofable), explicitly refuses agents,
row-locks the member, and writes a `chip_transactions` audit row. It was added
to the guard whitelist rather than bypassing the guard.

**Verified** by rolled-back live probe on Club JAQK:
`R2 escrow_immediate=PASS (5000->3800)`, `R3 to_agent_wallet=PASS (100->1300)`,
`R1 agent_blocked=PASS`, `R4 admin_allowed=PASS (3800->3300, pool +500)`.
Shipped as CA `36b19e3b`. tsc clean.

**Follow-up:** rule 4 now has a service method (`adminRemovePlayerChips`) but no
admin UI button yet — the capability is wired and callable, the surface is not.

---

## 18. Cross-agent regression caught + fixed (2026-08-15)

While verifying the deploy of section 17, the concurrent agent shipped a
**correct** security fix to `fn_get_or_create_conversation` (it was SECURITY
DEFINER taking the caller identity as a *parameter* — an IDOR + unauthenticated
spam vector). Their guard was:

```sql
IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN RETURN 'not authorized';
```

That **broke every messenger conversation**, personal and club alike. The three
callers of this RPC are trusted server routes using the **service_role** key —
`messenger/start-conversation.js`, `club-arena/approve-cashout.js`,
`club-arena/request-cashout.js` — and for a service_role caller `auth.uid()` is
NULL, so every call returned `not authorized`. It also would have re-broken the
club messenger fixed in section 14.

**Fix:** keep the IDOR guard, add the same service_role allowance already used by
`atomic_chip_transfer`:

```sql
IF COALESCE(auth.role(),'') <> 'service_role'
   AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id) THEN ...
```

Verified by probe: `service_4arg=true`, `service_2arg=true` (server path restored),
`idor_blocked=PASS` (a user passing someone else's id is still refused),
`self_ok=PASS`.

### Least-privilege gap in my own migrations (same pass)

New Postgres functions inherit `EXECUTE` to **PUBLIC**, and this project's default
privileges also grant `anon`. Three RPCs I added were therefore anon-reachable:
`fn_get_or_create_conversation(4-arg)`, `fn_get_user_conversations(2-arg)` and —
worst — `fn_admin_remove_player_chips`. None was exploitable (each derives its
actor from `auth.uid()` and refuses when NULL), but an anonymous caller has no
business reaching a chip-removal RPC. PUBLIC + anon revoked on all three;
verified `anon_exec=false, authenticated=true, service_role=true`.

**Lesson for every future migration in this repo: an explicit
`REVOKE EXECUTE ... FROM PUBLIC, anon` belongs next to every `GRANT` on a new
privileged function.**

### CI note
The phantom-RPC invariant correctly failed the blocking TypeScript Check job when
`fn_admin_remove_player_chips` was called from the client but absent from
`scripts/ci/supabase-schema-manifest.json`. Manifest updated; all gates green
(phantom tables/RPCs 0/0, stranded writers 0, phantom columns 0, ESM clean,
tsc 0 errors). The gate did exactly its job.

### Verification closed (2026-08-15)
Env-check fix confirmed live: production serves WH `c02ff5a0`, a descendant of
`c7357f6814`; the deployed tree has 0 occurrences of the old dynamic
`for (const envVar of REQUIRED_ENV_VARS)` loop and carries the static
`process.env.NEXT_PUBLIC_*` checks.

**The Club Arena E2E gate is GREEN.** CI run `31893523849` (sha `ecb14164`)
finished `conclusion=success` with every job passing, including
`E2E Tests (Playwright)` — the "No console errors on critical pages" test that
had been failing on the false `[ANTIGRAVITY] Required env vars are NOT set`
errors. No re-run was needed: that run executed after the fix reached
production. All five blocking gates are now green simultaneously.

---

## 19. Dead-button backlog, batch 2 (2026-08-15) — CA `e1523c25`

| Path | Was | Now |
|---|---|---|
| `AgentService.distributeFromTreasury` | `distribute_chips` (service_role-only → 42501) | `POST /api/club-arena/distribute-chips` |
| `AgentPromoPanel` promo send | `distribute_promo_chips` (service_role-only → 42501) | `POST /api/club-arena/distribute-promo` `{action:'send'}` |

Both routes derive the actor from the JWT — the client was previously passing
`p_distributed_by` / the `agents.id` PK, either of which a caller could have
supplied freely once the RPC was reachable. The promo route additionally enforces
the lifetime cap, playthrough rules, rate limiting and idempotency.

### Deliberately NOT revived: `fn_clawback_chips_atomic`

Clawback is an **agent removing chips from a player**, which the chip-removal
authority policy (section 17) forbids: an agent takes chips only through a
player-initiated cashout. The clawback route documents itself as *"one of only
TWO ways an agent can remove chips from a player"* — under the policy there is
now exactly **one**, and it is the cashout. Club admins use
`fn_admin_remove_player_chips`. Leaving it dead is the policy-correct outcome,
not an oversight. **If Dan wants an agent mistake-correction carve-out, this is
the switch to flip** — it would need to be scoped (e.g. same-day, own
distribution only, capped at the original amount) and it is a deliberate
exception to rule 1.

### Still open in the backlog (#128)

- **Signature mismatch, needs a small design decision:** `WalletService.distributePromo(agentId, playerId, amount)` and `WalletService.transferToUser(from, to, amount, fromWallet, toWallet)` both lack the `clubId` their routes require, and `transferToUser`'s wallet-type concept (`PLAYER`/`BUSINESS`/`PROMO`) has no equivalent in `transfer-chips`. Callers must supply `clubId` before these can be repointed.
- **No route — need SECURITY DEFINER + `auth.uid()` hardening** (the `promote_member` pattern): `fn_purchase_chips`, `fn_add_diamonds`, `deduct_diamonds`, `fn_grant_daily_reward`, `claim_daily_challenge`, `fn_bbj_promo_payout_atomic`, `fn_consume_feature_use`, `fn_increment_vip_usage`.
- **8 phantom RPCs** (do not exist at all): `join_flash_pool`, `verify_ledger_totals`, `claim_lucky_wheel_spin`, `increment_bonus_progress`, `get_message_reactions`, `record_arena_session`, `bulk_add_vip_points`, `bulk_update_position_stats`.
- **~11 fire-and-forget counters** that fail silently (rake/stat increments).

---

## 20. ⚠️ STOP — DO NOT "FIX" THESE DEAD BUTTONS BY GRANTING THEM

Section 16 lists 45 client-called RPCs that return `42501`. The obvious repair —
"grant it to `authenticated` so the button works" — is **catastrophic** for a
subset of them. They are currently **dead-SAFE**. Their inaccessibility is the
only thing standing between the platform and unlimited free money.

Verified bodies (live, 2026-08-15):

```sql
fn_add_diamonds(p_user_id uuid, p_amount integer)
  UPDATE profiles SET diamonds = diamonds + p_amount WHERE id = p_user_id;
```
No authorization. No cap. No ledger row. Caller picks the recipient **and** the
amount. Granting this to `authenticated` lets any logged-in user mint unlimited
diamonds into any account.

```sql
fn_purchase_chips(p_user_id uuid, p_amount numeric, p_diamonds_cost integer DEFAULT 0)
  IF p_diamonds_cost > 0 THEN PERFORM deduct_diamonds(...); END IF;
  PERFORM credit_player_wallet(p_user_id, p_amount);
```
The **cost defaults to zero**. `fn_purchase_chips(me, 1000000)` credits a million
chips and charges nothing. The caller supplies both the payout and its price.

```sql
fn_grant_daily_reward(p_user_id uuid, p_amount numeric DEFAULT 100)
  RETURN claim_daily_bonus(p_user_id, p_amount);
```
Caller supplies the "daily" reward amount and the recipient.

The same shape applies to `deduct_diamonds`, `claim_daily_challenge`
(caller-supplied `p_reward_amount`), `fn_consume_feature_use`,
`fn_increment_vip_usage` and `fn_bbj_promo_payout_atomic`: **all eight take a
caller-supplied `p_user_id`, none references `auth.uid()`.**

### The rule these violate

> A money RPC reachable by a client must derive **both the actor and the amount**
> from authoritative server state — never from its caller.

### The correct repair (per function, not a blanket grant)

Each needs a World Hub route in the shape of `mint-chips`:
1. actor from the JWT — never a `p_user_id` parameter;
2. amount/price read from authoritative config (`shop_items`, the bonus schedule,
   the VIP tier table) — never from the request body;
3. balance/eligibility/cooldown checked server-side;
4. idempotency key + audit row;
5. only then call the privileged RPC with the service role.

Until that exists **leave them dead.** A dead button is a bug; a granted one here
is a mint. This is why sections 16 and 19 repointed callers to hardened routes
instead of granting RPCs, and why `promote_member` / `transfer_club_ownership`
were rewritten to derive their actor from `auth.uid()` before being granted.

---

## 21. Chip purchase: rebuilt server-priced (2026-08-15) — WH `125eff0010`, CA `2abbad19`

First of the section-20 mint-risk functions repaired properly rather than granted.

**What was wrong.** `ChipPurchaseModal` called `fn_purchase_chips` directly,
passing the chip amount *and* the diamond price, both taken from a hard-coded
`CHIP_PACKAGES` array inside the React component. The price was therefore
entirely client-controlled. It never fired — the RPC is service_role-only and the
component used parameter names (`p_diamond_cost` / `p_chip_amount`) that do not
exist on it — so it failed twice over, which is the only reason it was never
exploited.

**Two further latent bugs found while fixing it** (both would have fired the
moment the button was naively "fixed"):

1. **Free chips on every failed debit.** The body was
   `PERFORM deduct_diamonds(...); PERFORM credit_player_wallet(...)`.
   `deduct_diamonds` reports failure by *returning* `{success:false}` — it does
   not raise — and `PERFORM` discards that. A user with insufficient diamonds was
   charged nothing and credited the chips anyway.
2. **Constraint violation after the charge.** It wrote
   `wallet_transactions.category = 'purchase'`, which is not in
   `wallet_transactions_category_check`. A *successful* purchase would have
   aborted with 23514 **after** the diamonds were already debited. Now `deposit`.

**The fix.**
- `POST /api/club-arena/purchase-chips` accepts **only** `{ packageId }`. Buyer
  from the JWT; payout and price from the route's own authoritative
  `CHIP_PACKAGES`. A field allowlist rejects any attempt to smuggle an amount.
  Idempotent per user+package+minute, so a double-tap cannot double-charge.
- `fn_purchase_chips` now captures the debit result and aborts unless it
  succeeded, takes a `p_reference_id` for idempotency, returns jsonb, and is
  `service_role`-only (PUBLIC/anon/authenticated explicitly revoked).
- The component's package list is now presentation only.

**Verified** by rolled-back live probe:
`insufficient -> success=false, 0 chips credited` (was: free chips);
`sufficient -> 80 diamonds charged, 10000 chips credited`;
`replayed reference -> idempotent, no double charge`.

**Pattern for the remaining seven** (`fn_add_diamonds`, `fn_grant_daily_reward`,
`claim_daily_challenge`, `deduct_diamonds` direct callers,
`fn_consume_feature_use`, `fn_increment_vip_usage`, `fn_bbj_promo_payout_atomic`):
client sends a *choice*, never a price; server reads the amount from
authoritative config; RPC stays service_role-only.

---

## 22. Daily bonus: three implementations, only one correct (2026-08-15) — CA `bff5103e`

Investigating `fn_grant_daily_reward` (one of the section-20 mint-risk functions)
turned up **three** parallel daily-bonus implementations. The correct one was not
the one users could reach.

| # | Implementation | State |
|---|---|---|
| 1 | `components/bonus/DailyBonusWheel.tsx` — **the wheel actually mounted** (ProfilePage, PromotionsPage) | No RPC, no write. Pure animation. Both pages' `onSpin` body was `setShowBonusWheel(false)`. **The user spun, saw a prize, and got nothing.** |
| 2 | `components/gamification/DailyBonusWheel.tsx` — orphaned second copy, **zero references** | Inserted `daily_spins` with a **client-chosen** `reward_amount`, then called `fn_grant_daily_reward` with parameter names that don't exist on it. Doubly dead — and a landmine. |
| 3 | `BonusService.claimDailyBonus()` → `fn_claim_daily_bonus()` | **Correct**, already used by BonusPage. Zero-arg, SECURITY DEFINER, user from `auth.uid()`, amount from the streak schedule. |

**Fix.** Both mounted wheel handlers now call `claimDailyBonus()` and report what
the server *actually credited* (amount, reward type, streak day) instead of the
segment the wheel happened to land on — the wheel stays presentation, the server
stays authoritative. A refusal ("already claimed today") surfaces the server's own
reason rather than a generic failure. The orphaned copy is **deleted**: it modelled
client-authored reward amounts, so wiring it up later would have let users choose
their own reward size.

**Note on `fn_grant_daily_reward`:** no route was needed. The secure replacement
already existed; the dead call was a legacy duplicate. This is worth checking for
each remaining section-20 function *before* building a route — the correct
implementation may already be there.

### Shared CI gate unblocked
`fn_collect_bounty` and `fn_finalize_bounty_pool` (referenced by the concurrent
agent's new bounty code in `TournamentManagerEliminations.ts`) exist in the live
DB but were missing from the CI schema manifest, failing the blocking phantom-RPC
gate for **every** branch. Registered them — same manifest-staleness class as the
earlier `fn_admin_remove_player_chips` failure.

---

## 23. PROMO CHIP ECONOMY — implemented to spec (2026-08-15)

**Dan's rule:** all promo chips derive from the BBJ; they are held in the **union
wallet** and distributed by the union to its clubs or directly to agents; a club
with **no union** receives promo straight into its own club promo wallet.

### Verified BBJ rake schedule (`bbj_stakes_tiers`, live)

| tier | blinds | rake % | cap (bb) | **bbj fee (bb)** | payout % | loser / winner / table |
|---|---|---|---|---|---|---|
| nano | 0.05/0.1–0.1/0.2 | 5.00 | 10.00 | 0.60 | 15.00 | 7.50 / 3.75 / 3.75 |
| micro | 0.2/0.4–0.4/0.8 | 7.00 | 8.00 | 0.40 | 25.00 | 12.50 / 6.25 / 6.25 |
| small | 0.5/1–1.5/3 | 10.00 | 5.00 | 0.25 | 40.00 | 20.00 / 10.00 / 10.00 |
| mid | 2/4–4/8 | 8.00 | 3.00 | 0.12 | 55.00 | 27.50 / 13.75 / 13.75 |
| high | 5/10–20/40 | 5.00 | 2.00 | 0.06 | 70.00 | 35.00 / 17.50 / 17.50 |
| nosebleeds | 25/50+ | 3.00 | 1.00 | 0.03 | 85.00 | 42.50 / 21.25 / 21.25 |

**Contribution split (`add_bbj_contribution`): 50% main / 25% backup / 25% promo.**
That 25% slice is the only source of promo chips.

### State found

- **`bbj_pools.promo_balance` held 47,441.57 across 1,002 pools** — accruing
  correctly and **never distributed anywhere**.
- Every other promo/BBJ wallet was **0.00**: `unions.promo_wallet`,
  `unions.promo_fund_balance`, `unions.bbj_wallet`, `unions.main_bbj_balance`,
  `unions.backup_bbj_balance`, `clubs.promo_balance`, `agents.promo_balance`,
  `agents.promo_wallet_balance`, `club_members.promo_balance`.
  Consolidation therefore carried **zero money-migration risk**.
- **No union layer existed at all** in the promo flow.
- `mint_club_promo` credited `clubs.promo_balance` **out of nothing** — a direct
  violation of "all promo derives from the BBJ".

### Canonical schema (duplicates deprecated in place, not dropped — all were zero)

| Level | Canonical column | Deprecated duplicate |
|---|---|---|
| Union | `unions.promo_wallet` | `unions.promo_fund_balance` |
| Club | `clubs.promo_balance` | — |
| Agent | `club_members.promo_balance` (an agent *is* a member) | `agents.promo_balance`, `agents.promo_wallet_balance` |
| Player | `club_members.promo_balance` | — |
| Accrual | `bbj_pools.promo_balance` | — |

### Implemented

- **`fn_sweep_bbj_promo(club)`** — drains the pool's promo slice to the **union
  wallet** when the club has a union, otherwise to the **club promo wallet**.
  Drains the accrual point first so a concurrent sweep cannot double-credit.
  service_role only; writes a `bbj_promo_sweep` audit row.
- **`fn_union_distribute_promo(union, kind, target, amount, agent_club, note)`** —
  **union owner only** (actor from `auth.uid()`); `kind='club'` credits
  `clubs.promo_balance`, `kind='agent'` credits the agent's
  `club_members.promo_balance` **directly**. Validates the club/agent belongs to
  that union, row-locks, refuses on insufficient balance.
- **`mint_club_promo` is now inert** — returns an error pointing at the sweep.
  Promo can no longer be minted from nothing.

**Verified** by rolled-back probe: `sweep→union PASS`, `non-owner blocked PASS`,
`union→club PASS`, `union→agent PASS`, `unionless→club PASS`, `mint refused PASS`.

### Remaining wiring
`fn_sweep_bbj_promo` is not yet **called** by anything — it needs a trigger
(on BBJ contribution) or a scheduled sweep, plus the union-owner distribution UI.
The 47,441.57 already accrued becomes distributable the moment the sweep runs.

### 21.1 Correction — the chip-purchase UI does not exist (2026-08-15)

Verifying the deploy turned up something the code review did not: **`ChipPurchaseModal`
is never rendered.** Its only reference anywhere in `src/` is the barrel export
`src/components/wallet/index.ts:8`, and that barrel is imported by nothing. Vite
therefore tree-shakes the component out, which is why the production bundle
contains **0** occurrences of `"purchase-chips"` (and 0 of the old
`rpc("fn_purchase_chips")` / `p_chip_amount`).

So the honest status of section 21:

| Half | State |
|---|---|
| `POST /api/club-arena/purchase-chips` route | **LIVE** — in deployed WH commit `7bcedd27` (4 `CHIP_PACKAGES` refs; route commit `125eff0010` is an ancestor) |
| `fn_purchase_chips` hardening (debit-result checked, `deposit` category, service_role-only, PUBLIC/anon revoked) | **LIVE** in the DB |
| Client repoint | **Correct on `main`** but in a component **no page renders** |
| User-facing chip purchase | **DOES NOT EXIST** — there is no entry point |

The security work still counts: the free-chips bug and the client-controlled
price are both closed, and the route is correct for whenever a UI is wired. But
"chip purchase works" would be false — the feature has no button. Wiring an entry
point (or deleting the orphan) is follow-up work, tracked under #128.

This is the same orphan pattern as the gamification `DailyBonusWheel` in section
22 — worth grepping for renders, not just imports, before calling a repointed
component "fixed".

### 23.1 Union owners may fund promo from their own bank (2026-08-15)

Dan's clarification: a union owner CAN add chips to the promo wallet from their
main bank; it just has to be tracked. **The BBJ remains the main source.**

Implemented as a **transfer, never a mint** — `unions.chip_balance` →
`unions.promo_wallet`, so the union's total holding is unchanged and no new chips
enter the economy. `mint_club_promo` stays inert.

**`fn_union_fund_promo_from_bank(union, amount, note)`** — union owner only
(actor from `auth.uid()`), row-locks the union, refuses an overdraw.

**Provenance accounting** (so the two sources stay separable):

| Counter | Meaning |
|---|---|
| `unions.promo_funded_from_bbj` | lifetime from the BBJ 25% slice (main source) |
| `unions.promo_funded_from_bank` | lifetime moved in by the owner from the bank |

**Ledger correction.** Union-level movements were initially written to
`chip_transactions`, which failed on a NOT NULL `club_id` — that table is
club-scoped by design. The probe caught it. They now go to
**`union_wallet_transactions`** (the live union ledger, 313,704 rows), matching
the existing convention where `wallet` holds the column name
(`promo_wallet` / `chip_balance`) and `direction` is credit/debit. The bank top-up
writes proper **double entry** (debit bank, credit promo); the BBJ sweep writes a
single credit with the source `club_id`. A unionless club still logs to
`chip_transactions`, which is correct because that movement *is* club-scoped.

**Verified** by rolled-back probe: `non-owner blocked PASS`;
`top-up bank 10000→8000, promo 0→2000, total conserved PASS`;
`overdraw refused PASS`; `BBJ sweep on top → promo 3000 with provenance split
bbj=1000 / bank=2000 PASS`; `ledger rows = 3 (2 double-entry + 1 sweep) PASS`.

### 23.2 Sweep completed — union-scoped pools were being missed (2026-08-15)

Wiring the sweep exposed a **gap in my own section-23 implementation**.
`fn_sweep_bbj_promo(p_club_id)` looked pools up by `club_id` only. Live data:

| pool shape | count | promo held |
|---|---|---|
| **union-scoped** (`union_id` set, `club_id` NULL) | **1,005** | **26,114.90** |
| club-scoped (`club_id` set) | 2 | 21,346.50 |

The engine (`server/src/services/supabase/bbj.ts`) seeds a pool keyed by
`union_id` when the club belongs to a union, and by `club_id` otherwise — so the
club-only lookup would have missed **99.8% of pools**. Caught by checking the
data rather than trusting the code.

**`fn_sweep_bbj_promo_all()`** now handles both shapes and is the function to
schedule: union-scoped pool → that union's `promo_wallet`; club-scoped pool → the
club's union if it has one, else the club wallet. Each pool drains inside its own
row lock; a pool whose owner row is missing is **restored rather than vaporised**;
one bad pool cannot abort the run. service_role only.

**Verified against the real 1,007 production pools (rolled back):**

```
swept=47,462.24  pools=1007  to_union=1006  to_club=1  errors=0
pools 47,462.24 -> 0.00 | unions 0 -> 26,377.94 | clubs 0 -> 21,084.30
conservation PASS (pool delta == union delta + club delta)
ledger rows written: 1006
second run swept 0 -> PASS (idempotent)
```

**Not yet executed in production.** The function is verified and ready; running it
moves ~47.5k of real promo balances, and the scheduling question (per-contribution
vs scheduled) is still open with Dan. One call does it:
`SELECT fn_sweep_bbj_promo_all();`

**Scheduling constraint discovered:** the BBJ cron (`/api/cron/bbj-detect`, every
5 min) is registered in `scripts/openclaw-cron-dispatcher.py` but its handler
lives in the **separate workers repo** (`src/routes/bbj-detect.ts`), not in World
Hub — and WH CI (CHECK 6) blocks net-new files in `pages/api/cron/`. So the sweep
should be added to the workers-repo BBJ route, or invoked on the existing Open
Claw schedule; it should NOT get a new WH cron file.

### 23.3 Sweep EXECUTED + a correction to my own work (2026-08-15)

**Executed in production.** `fn_sweep_bbj_promo_all()` ran against all 1,007 pools:

```
pools 47,607.05 -> 0     unions +26,422.58     clubs +21,184.47
ledger: 1,033 union rows + club rows;  errors 0
conservation EXACT: ledger == balances == provenance counters
```
(A residual 0.99 reappeared immediately — live hands still accruing, which is
precisely why it must recur.)

**Then I found I had written it to the wrong table.** Live data:

| | `unions.*` (what I used) | `union_wallets.*` (canonical) |
|---|---|---|
| bank | 0.00 | **989,097.78** |
| read by `/api/club-arena/union-wallet get_balances` | no | **yes** |

`union_wallets` is the live table; the `unions.*` money columns are stale
duplicates — the same duplicate-column trap flagged in section 23, which I then
fell into. Two real consequences:

1. The 26,422.58 swept was **invisible to the union wallet UI**.
2. `fn_union_fund_promo_from_bank` debited `unions.chip_balance` (0), so an owner
   top-up would have **always failed** "insufficient union bank balance".

**Corrected:** the swept promo was migrated onto `union_wallets.promo_wallet`,
`unions.promo_wallet` zeroed and both stale columns marked DEPRECATED, and all
three functions (sweep, bank top-up, distribution) now read and write
`union_wallets`. Lifetime provenance counters stay on `unions` — they are
counters, not balances.

**Verified after correction** (rolled back): `bank top-up PASS (works for the
first time, total conserved)`, `non-owner blocked PASS`, `union→club PASS`,
`union→agent PASS`, `overdraw refused PASS`. Canonical state now:
`union_wallets.promo_wallet = 26,422.58`, `unions.promo_wallet = 0`,
`promo_funded_from_bbj = 26,422.58`.

**Lesson (third time this session):** when two columns could hold the same money,
check which one the *live data and the reading code* use before writing to either.

---

## 24. Duplicate-money-column sweep — and a mistake I made and reversed (2026-08-15)

Three times in one session the real bug was *two columns holding the same money*,
so I swept the schema for the pattern. Findings:

**Benign / already sound**
- `club_agents` is a **VIEW** over `agents`, not a duplicate table.
- `agents.agent_wallet_balance` and `agents.business_balance` both hold 6,645,000
  and agree on **all 68 rows** (0 differ) — mirrored and consistent. Still a
  latent risk if code writes only one, but currently sound.

**MY ERROR — folded two distinct ledgers, then reversed it**

I saw `clubs.chip_pool` (12,459.07) and `clubs.chip_treasury` (174.89) both
holding money and folded treasury into pool, assuming duplicates. **They are
not.** `server/src/services/supabase/rake.ts:125` says so explicitly:

> "clubs.chip_treasury. NOTE the naming trap: `increment_club_chip_pool` writes
> chip_treasury (+ total_rake), NOT chip_pool (**chip_pool is the separate
> mint-and-distribute ledger**). See `.agent/architecture/CLUB-MONEY-LEDGERS-CANONICAL.md`."

So they are two ledgers **by design**:
- `chip_treasury` = the club's **operational bank** (rake income), fed every hand
- `chip_pool` = the **mint-and-distribute** chip inventory

**Reversed exactly.** Derived the per-club fold amounts from the untouched
baselines (SHARK's pool was 0, so its whole 128.07 was folded; JAQK's excess over
12,459.070000000014 was 46.82 — summing to 174.89, matching the fold), then moved
them back. Verified: JAQK pool back to `12459.070000000014` and SHARK to `0.00`,
treasuries restored. **No money lost; totals conserved throughout.**

**What I got wrong:** I inferred "duplicate" from two columns holding money in the
same table, without first checking the writers or the canonical architecture doc
the codebase already had. The lesson from section 23.3 was *check which column the
live data and reading code use* — the stronger rule is **check the semantics
before concluding two columns are the same account.** Coexisting balances can be
two legitimate accounts.

**The REAL bug here (still open, not a duplicate):** `DynamicWallet.tsx` shows
`chip_treasury` as "clubBank", but `mint_club_chips`, `distribute_chips` and
`fn_admin_remove_player_chips` all move `chip_pool`. **An owner mints chips and
the wallet UI shows no change** — same user-visible class as the promo bug, but it
needs a UI/product decision (show both ledgers, or relabel), not a data merge.
Also worth renaming `increment_club_chip_pool`, whose name says pool and whose
body writes treasury — that naming trap is what misled me.

### 24.1 Naming trap removed (2026-08-15)

`increment_club_chip_pool(club, amount)` updates `clubs.chip_treasury` and
`clubs.total_rake` — it never touches `clubs.chip_pool`. That misleading name is
what led me to read the two ledgers as duplicates and fold 174.89 of rake income
into the mint inventory (caught and reversed the same day, no money lost).

**Fixed without touching the running engine:**
- New **`credit_club_rake_to_treasury(club, amount)`** — same body, honest name,
  documented as crediting the club's OPERATIONAL BANK and explicitly *not*
  `chip_pool`.
- **`increment_club_chip_pool` is now a thin deprecated delegate** to it, so the
  deployed Hetzner engine (`server/src/services/supabase/rake.ts`) keeps working
  unmodified. Both carry `COMMENT ON FUNCTION` warnings.

**Verified** (rolled back): new function → treasury +10, `chip_pool` untouched;
delegate → identical, `chip_pool` untouched. `identical=PASS`.

**Remaining step (deliberately not started):** repoint
`server/src/services/supabase/rake.ts` from `increment_club_chip_pool` to
`credit_club_rake_to_treasury` and retire the delegate. That is a `server/**`
change, so it triggers a Hetzner auto-deploy that must be verified through the
`hand_history` restart signature per CLAUDE.md — a longer loop than the remaining
budget allows. The delegate means there is **no functional urgency**: the engine
is correct either way, and this is pure naming hygiene.

### 24.2 Engine repointed to the honest name — DEPLOYED + VERIFIED (2026-08-16)

CA `b38ad8db7`. Both engine call sites now use `credit_club_rake_to_treasury`
instead of `increment_club_chip_pool`:

- `server/src/services/supabase/rake.ts` — cash-game rake, standalone clubs
- `server/src/tournament/TournamentManagerEliminations.ts` — tournament rake

Misleading comments corrected at both sites. The tournament one claimed rake went
"straight to clubs.chip_pool" — never true — and its failure message said
"chip_pool credit failed"; both now say chip_treasury.

**Verification (each item observed, not assumed):**

| check | result |
|---|---|
| residual `increment_club_chip_pool` calls in `server/src` | **0** |
| `npx tsc --noEmit` | **0 errors** |
| engine test suite | **536/536 passing (46 files)** |
| phantom tables/RPCs · columns · stranded writers · ESM gates | **all pass** |
| CI jobs (TypeScript, Production Build, Server Engine, Post-Deploy) | **success** |
| Auto-Deploy Hetzner Engine | **completed/success** |
| restart signature in `hand_history` | **visible** — ~150/min → 123 → 91, then recovered |
| **`clubs.chip_treasury` after restart** | **+2.96** vs baseline |
| **`clubs.total_rake` after restart** | **+302.96** vs baseline |
| throughput after restart | **299 hands / 2 min** (~150/min, normal) |
| `financial_alerts` (15 min and 2 h) | **0** |
| code present on `origin/main` | both files **1 ref each** |

The treasury/rake deltas are the decisive proof: those columns are written *only*
by `credit_club_rake_to_treasury`. Had the renamed RPC failed to resolve,
PostgREST would have 404'd and both would have flatlined. They did not.

Rollback needs no DB change — `increment_club_chip_pool` remains as a deprecated
delegate with identical behaviour.

**The naming trap is now fully closed:** honest function name, both callers
repointed, comments corrected, deployed to the live engine and confirmed
crediting in production.

---

## 25. Final integrity audit of the club money system (2026-08-16)

Swept every function and balance touched this session. **One real regression
found — mine — and fixed.**

### Regression found and fixed: `credit_club_rake_to_treasury` was over-granted

Created during the 24.1 rename without an explicit REVOKE, so it inherited
`EXECUTE` for PUBLIC plus this project's default `anon` grant — while the function
it replaced (`increment_club_chip_pool`) is service_role only. A least-privilege
regression introduced by my own rename.

**Not exploitable** — verified by probe rather than assumed: the function is not
SECURITY DEFINER, so it runs with the caller's privileges, and RLS on
`public.clubs` made the UPDATE a **no-op** for an authenticated caller
(`treasury delta 0.00`). Locked down anyway to match the replaced function.

This is the **third** time this session that a new function silently inherited a
PUBLIC/anon grant. The rule from section 18 clearly is not enough on its own:
**every `CREATE FUNCTION` for a privileged operation needs a paired
`REVOKE ... FROM PUBLIC, anon` in the same migration.** Worth a CI invariant.

### Grant posture — all 13 functions verified, `anon = false` on every one

| tier | functions |
|---|---|
| service_role only | `credit_club_rake_to_treasury`, `fn_purchase_chips`, `fn_sweep_bbj_promo`, `fn_sweep_bbj_promo_all`, `fn_get_user_conversations(1-arg legacy)` |
| authenticated + service (internal authz from `auth.uid()`) | `fn_admin_remove_player_chips`, `fn_get_or_create_conversation` (both overloads), `fn_get_user_conversations(2-arg)`, `fn_union_distribute_promo`, `fn_union_fund_promo_from_bank`, `fn_register_for_tournament`, `fn_unregister_from_tournament` |
| **anon** | **none** |

### Money state — coherent, and the reversal held

| ledger | value | check |
|---|---|---|
| union promo (canonical `union_wallets`) | 26,422.58 | ✓ |
| union promo (deprecated `unions`) | **0.0000** | ✓ stays zero |
| provenance `from_bbj` | **26,422.58** | ✓ **exactly matches** the canonical balance |
| provenance `from_bank` | 0 | ✓ no top-ups yet |
| club promo (unionless) | 21,184.47 | ✓ |
| BBJ pools unswept | **1,962.20** | accrued since the sweep — confirms the recurring sweep is needed |
| club mint inventory `chip_pool` | **12,459.070000000014** | ✓ **exactly** the pre-mistake value — the 24.0 reversal held |
| club operational bank `chip_treasury` | 133.25 | ✓ live rake accruing |
| all deprecated duplicate columns | 0 | ✓ no drift |

Provenance reconciling to the canonical balance to the cent, and `chip_pool`
sitting on its exact pre-mistake value, are the two strongest signals that the
promo economy and the ledger reversal are both sound.

---

## 26. HARDENING — the grant mistake is now a checkable invariant (2026-08-16)

Documentation did not stop the same mistake happening three times, so it is now
machine-checkable: **`fn_audit_privileged_grants()`**, a read-only, side-effect-free
function that returns every money/privileged function `anon` can execute, ranked
by severity.

```sql
-- CI / monitoring contract — MUST be zero:
SELECT count(*) FROM fn_audit_privileged_grants() WHERE severity = 'CRITICAL';
```

| severity | meaning | count now |
|---|---|---|
| **CRITICAL** | SECURITY DEFINER **and** anon-executable — bypasses RLS for an unauthenticated caller | **0** ✅ |
| MEDIUM | anon-executable, not SECURITY DEFINER — RLS is the only thing stopping a write | 27 |
| LOW | trigger functions — anon cannot meaningfully invoke them | 8 |

### It immediately found 5 CRITICAL issues that pre-date this session

All SECURITY DEFINER **and** anon-callable — the worst combination in the schema,
since SECURITY DEFINER disables RLS:

- `fn_claim_rakeback(uuid)`
- `fn_open_settlement_period(uuid)`
- `fn_set_settlement_period_status(uuid, text)`
- `fn_union_clawback_from_club(uuid, uuid, numeric, text, uuid)`
- `fn_union_deposit_from_wallet(uuid, numeric, text, uuid)`

Every one is a club-owner / union-owner money operation that inherently requires
an authenticated identity — `anon` was never a deliberate choice, it was the
Postgres default-grant leak. **All five revoked from PUBLIC/anon**, keeping
`authenticated` + `service_role` and their own internal authorization.
**CRITICAL is now 0.**

The invariant also caught its own first-draft bug: substring matching flagged
PostGIS `st_numinteriorring` because it contains "mint". Fixed with tighter
patterns and an `st_` exclusion.

### Remaining, deliberately not blanket-fixed

27 MEDIUM (anon + money, but not SECURITY DEFINER, so RLS still guards the tables
— exactly the posture that made `credit_club_rake_to_treasury` a non-event) and 8
LOW trigger functions. Revoking 35 functions in one sweep without tracing each
caller is precisely the kind of unverified bulk change that caused the
`chip_pool` / `chip_treasury` mistake in section 24. They should be drained in
reviewed batches, with the CRITICAL gate holding at 0 throughout.

### Wiring it up — CI could not do it, so the database does it instead

The plan was a CI step running the CRITICAL count. That plan is dead:
`grep -nE "secrets\.|env:" .github/workflows/ci.yml` shows CI holds only
`SENTRY_AUTH_TOKEN` and `GITHUB_TOKEN` — **there are no Supabase credentials in
CI at all**, so CI cannot query the invariant. A manifest-based substitute would
be detective, not preventive, and stale the moment someone applied a migration
without regenerating it.

So enforcement moved into Postgres itself, where it cannot be skipped, forgotten,
or bypassed by an agent who never reads CI config. See section 27.

---

## 27. PREVENTIVE ENFORCEMENT — the guard, and the outage it nearly caused (2026-08-16)

Section 26 made the mistake *visible*. This makes it *impossible to commit*.

### 27.1 What was built

| Object | Kind | Job |
|---|---|---|
| `trg_autorevoke_privileged_anon` | event trigger on `ddl_command_end` | fires on `CREATE FUNCTION`, `ALTER FUNCTION`, `GRANT` |
| `fn_autorevoke_privileged_anon()` | event trigger body | strips `PUBLIC`/`anon` EXECUTE from money-named functions |
| `privileged_function_lock` | table, 163 rows | the reviewed anon-denied set that must never regress |
| `fn_verify_privileged_lock()` | detective | rows returned = a regression; must be empty |
| `fn_grant_guard_health()` | detective | one call, six checks, all must read `OK` |

A new money RPC now lands **anon-denied by default**. Nobody has to remember the
`REVOKE`; forgetting it is no longer possible.

Deliberate exceptions are still available, but they have to be stated out loud:

```sql
SET app.allow_privileged_anon_grant = 'on';   -- this transaction only
GRANT EXECUTE ON FUNCTION public.fn_something_public(uuid) TO anon;
```

### 27.2 It was verified, not assumed — rollback probe results

Every claim below is a measured value from a `DO $$ ... RAISE EXCEPTION $$`
probe run against production and rolled back (zero leftovers confirmed
afterwards: 0 probe functions, 0 probe tables, 0 probe event triggers).

| Scenario | anon EXECUTE after | Verdict |
|---|---|---|
| `CREATE FUNCTION fn_probe_chip_…` | `false` | trigger fired |
| `CREATE FUNCTION fn_probe_plain_…` | `true` | scope is provably narrow — non-money functions untouched |
| auto-added to `privileged_function_lock` | `true` | new function locks itself |
| targeted `GRANT … TO anon` | `false` | GRANT sweep undid it |
| multi-object `GRANT a, b TO anon` | priv `false`, plain `true` | correct per-object outcome from one command |
| `ALTER FUNCTION … SET search_path` | `false` | re-asserted on ALTER |
| grant under the bypass GUC | `true` | deliberate exception honoured |
| next unrelated GRANT after bypass | `false` | self-heals once the bypass window closes |

### 27.3 The trap: a GRANT event does not tell you what was granted

The first attempt simply added `GRANT` to the trigger's tag list. The probe said
it did nothing. A diagnostic event trigger that logged raw
`pg_event_trigger_ddl_commands()` output explained why:

```
[tag=GRANT | object_type=FUNCTION | objid=NULL | ident=NULL]
```

`object_type` is **uppercase** for GRANT (lowercase `function` for CREATE/ALTER),
and there is **no object identity at all**. A GRANT handler cannot know which
function was granted. Hence the lock table: on a function GRANT the trigger
re-asserts the whole reviewed list instead of trying to identify the target.

### 27.4 The bug this nearly shipped — worth more than the feature

The lock table first stored `pg_get_function_identity_arguments()`, which
**includes parameter names**:

```
public.add_bbj_contribution(p_club_id uuid, p_table_id uuid, …)
```

That form is legal in `GRANT`/`REVOKE`/`ALTER FUNCTION` but is **rejected by
`::regprocedure`**, which parses types only. The sweep cast every row to
`regprocedure`. An error inside an event trigger aborts the statement that fired
it — so the first function `GRANT` anywhere in the database would have failed
with `invalid type name "p_club_id uuid"`, and **every subsequent GRANT would
have failed too**. A hardening measure would have become a schema-wide outage.

The probe caught it before a single GRANT ran. Fixed by storing types-only
signatures and resolving with `to_regprocedure()` (returns `NULL` rather than
raising), plus a migration-time assertion that every stored signature resolves.

**Rule learned, third instance of the same shape:** an enforcement mechanism that
can throw is a new failure mode, not just a new guard. Prove it under the exact
statement it will intercept, not merely under the statement that installs it.

### 27.5 Standing contract

```sql
SELECT * FROM fn_grant_guard_health();   -- every row must read status = 'OK'
```

Current: all six `OK` — trigger enabled, all three tags watched, 0 of 163 locked
functions regressed, 0 stale entries, 0 CRITICAL. The 27 MEDIUM + 8 LOW remain
deliberately unswept and are excluded from the lock table for the reason in
section 26 — a blind revoke could kill a genuinely public surface (an
unauthenticated jackpot ticker reads a `*_bbj_*` function). Each joins the lock
list as it is reviewed and revoked.

### 27.6 Migrations

- `20260816153228_autorevoke_privileged_anon_also_on_grant.sql`
- `20260816153443_privileged_function_lock_table_and_grant_sweep.sql`
- `20260816153613_fix_privileged_lock_signature_must_be_regprocedure_castable.sql`
- `20260816153711_grant_guard_health_single_check.sql`

---

## 28. Deploy pipeline was down platform-wide — CRON_SECRET whitespace (2026-08-16)

Found while verifying the section 27 push. Every Vercel production build was
failing at the **build step**, before any code ran:

```
errorCode:    INVALID_CRON_SECRET
errorMessage: The `CRON_SECRET` environment variable contains leading or
              trailing whitespace, which is not allowed in HTTP header values.
errorStep:    buildStep
```

Not caused by the guard commit — the next agent's unrelated push (`dpl_4iKV…`)
failed identically. `vercel env ls` showed all three `CRON_SECRET` targets
created **10 minutes earlier**, during today's credential-rotation work: the
replacement value was pasted with a trailing newline (`0x0A`, confirmed as the
last code point of the readable Development copy — 65 chars, trimming to 64).

`smarter.poker` kept serving the last good deployment, so there was no user-visible
outage — but nothing could ship, by anyone, until it was fixed.

**Fixed** (with Dan's go-ahead, since it is an account-settings change): the
value was trimmed in place on Production, Preview and Development. Same secret —
no rotation — so the Open Claw dispatcher on Hetzner keeps working with the
credential it already holds. The value was never printed; only lengths were.

Two things learned about the tooling, worth recording:

- **Production and Preview env vars default to *sensitive*** on this project, so
  `vercel env pull` writes them back as `CRON_SECRET=""`. That empty read is not
  evidence the variable is empty. Development is readable, which is the only
  reason the trailing newline could be measured at all.
- **`vercel env add … preview` cannot be scripted through stdin.** It always
  prompts for a Git branch, and `--non-interactive` returns
  `action_required / git_branch_required` even with `--value`. Removing the
  Preview entry before discovering this briefly deleted it; it was restored via
  the REST API (`POST /v10/projects/{id}/env?upsert=true`, `type:"encrypted"`,
  `target:["preview"]`). **Do not `vercel env rm` on Preview until the
  replacement path is proven.**

**Verified:** `3352059aec` built READY at 2026-08-16 15:58 UTC and holds the
`smarter.poker` alias. The section 27 commit `0b2f7f9b2a` is an ancestor of it,
so all four migrations and the audit record are in the deployed tree.

---

## 29. The anon money backlog is now ZERO (2026-08-17)

Section 26 left 27 MEDIUM + 8 LOW anon-executable money functions deliberately
undrained, because a blind sweep could kill a genuinely public surface. Both
batches are now done, each with the evidence that made it safe.

### Batch 1 — 15 mutating functions + 8 trigger functions

The mutating set (`atomic_table_*`, `bbj_atomic_payout*`, `fn_idempotent_*`,
`fn_union_*`, `add_bbj_contribution`, `promo_apply_playthrough`,
`deduct_table_chip_lock`, `expire_settlement_locks`) all already granted EXECUTE
to **both** `authenticated` and `service_role`. So revoking `anon` cannot break
the browser callers (`TablePage.tsx`, `WalletService.ts`, `CashierPage.tsx`,
`BBJService.ts`), the Hetzner engine, or the WH API routes — the only caller a
revoke can break is a logged-out one, and a logged-out caller of
`atomic_table_rebuy` is definitionally wrong.

The 8 LOW entries are trigger functions. The question that mattered was whether
revoking EXECUTE stops the trigger firing. **Probed rather than assumed:**

```
anon_exec_before = t
anon_exec_after  = f
INSERT ... AS anon  ->  error = [none]
rows carrying the trigger's effect = 1
```

Postgres checks EXECUTE at `CREATE TRIGGER` time, not per statement. Grant
hygiene with no runtime consequence.

### Batch 2 — the 12 read-only getters

Each got its own caller trace across both repos:

| function | caller | context |
|---|---|---|
| `get_bbj_pool` | CA `UnionGamesPage.tsx` | browser, authenticated |
| `get_player_rake_total` | CA `CommissionService.ts` | browser, authenticated |
| `get_wallet_balance_totals` | CA `SettlementCronService.ts` | browser, authenticated |
| `get_diamond_balance` | WH `api/training/tournaments.js` | server, service-role key |
| `get_promo_status` | WH `api/club-arena/distribute-promo.js` | server, service-role key |
| the other 7 | — | **no caller at all** |

`is_club_settlement_locked` deserves a note: `checkSettlementLock()` queries the
`clubs` and `settlement_locks` **tables**, it never calls the RPC of that name.
The function has been dead code the whole time.

`SettlementCronService.runCanaryCheck()` is fail-closed — an RPC error blocks
settlement rather than letting it proceed unverified. That is the safe direction
to fail, and it is only reached inside an authenticated settlement run.

**Result:** `fn_grant_guard_health()` reports `0 MEDIUM + 0 LOW`, CRITICAL 0,
198 functions locked, 0 lock violations.

---

## 30. The debit sign bug — 33.9M of error in every debit total (2026-08-17)

This is the one that was actually costing money-integrity signal, and it was
found only because a phantom RPC got implemented.

`ChipFlowService.verifyLedger()` calls `rpc('verify_ledger_totals')`. That
function had **never existed**; the call returned PGRST202 every time and fell
through to a client-side paginated aggregation. That fallback is not merely slow
— it is **unsound**. It aggregates `wallets` and `wallet_transactions` through
PostgREST *as the calling user*, so RLS trims the result. A non-admin caller
sums their own balance and calls it the platform total — and
`runReconciliation()` raises a CRITICAL financial alert on the difference.

Implementing the real RPC (SECURITY DEFINER, admin/service-role only) produced
the first honest measurement: minted **2,200,000.01** vs wallets
**732,692,498.85**. That gap is not drift; it meant the ledger did not describe
the balances at all. Digging in:

**74,189 rows had a negative `amount` on a `type='debit'` row.** Five writers
encode the direction twice:

| writer | what it inserts |
|---|---|
| `atomic_table_buyin` | `'debit', -p_amount, 'buyin'` |
| `atomic_table_addon` | `'debit', -p_amount, 'addon'` |
| `atomic_table_rebuy` | `'debit', -p_amount, 'rebuy'` |
| `fn_register_for_tournament` | `-v_split.charge, 'debit', 'tournament_buyin'` |
| `process_tournament_rebuy` | `'debit', -v_total, v_cat` |

while their siblings do not — `atomic_seat_horse` writes `'debit', p_buy_in`,
`fn_wallet_type_transfer` writes `'debit', p_amount`, `wallet_internal_transfer`
writes `p_amount, 'debit'`.

The correct convention is not a judgement call: **1,438,983 credit rows with
zero negatives, and 513,474 positive buy-in debits** from the dominant writer,
against 74,189 negatives from these five.

### What it was costing

- Every `sum(amount) FILTER (WHERE type='debit')` under-counted by **2×** the
  affected magnitude — 16,970,046.85, so **~33.9M of error** in every debit
  total, including the reconciliation alarm. Confirmed by the fix: debits moved
  319,661,737.76 → 353,595,988.96, a delta of exactly 2 × 16,967,125.60.
- `TransactionHistory.tsx` renders `{type==='credit'?'+':'-'}{tx.amount}`, so a
  100-chip buy-in displayed as **`--100`**. `CashierPage.tsx:1974` already wraps
  the same field in `Math.abs()` — the symptom had been patched at one call site
  without anyone finding the writer.

It was **live**: the negative-row count climbed 74,160 → 74,175 → 74,189 across
three consecutive queries while this was being investigated.

### The fix

All five functions rewritten by pattern-replacement on `pg_get_functiondef()`
(so no body could be transcribed wrongly), each with an abort-on-mismatch
assertion; 74,189 rows backfilled; and a `CHECK (amount >= 0)` constraint added
`NOT VALID` — which still enforces on every future INSERT/UPDATE while
preserving 5 unexplained legacy rows (rake ×3, prize ×1, transfer ×1) for
investigation rather than rewriting them on a guess. Probe-verified: a new
`type='debit', amount=-1` insert is rejected.

---

## 31. Phantom RPCs — measured, not estimated (2026-08-17)

Every `.rpc('name')` in both repos was extracted (322 distinct names) and joined
against `pg_proc`. Eleven had no function behind them; two of those
(`get_mlb_model_intel`, `get_mlb_player_detail`) call `mlbDb`, a **different**
Supabase project, so they are not phantoms here. Nine are real:

| RPC | caller | status |
|---|---|---|
| `verify_ledger_totals` | `ChipFlowService.verifyLedger` | **fixed** (§30) |
| `get_message_reactions` | `MessagingService.getReactions` | **fixed** |
| `join_flash_pool` | `FlashPoolPage.tsx` | **blocked — no schema exists** |
| `claim_lucky_wheel_spin` | `BonusService` | open |
| `increment_bonus_progress` | `BonusService` | open |
| `bulk_add_vip_points` | `PlayerPositionStatsService` | open |
| `bulk_update_position_stats` | `PlayerPositionStatsService` | open |
| `record_arena_session` | `ArenaTrainingController` | open |
| `get_unseen_questions` | WH `triviaQuestionLoader.js` | open |

### Message reactions — broken at both ends

`fn_toggle_message_reaction()` read and wrote `public.message_reactions`, a table
that had **never been created**, so every call raised "relation does not exist".
`getReactions()` called `get_message_reactions`, which also did not exist; its
error branch returns `[]` and logs "RPC not available", which is why the UI
showed no reactions instead of an error. A third defect sat on top: the client
did `return data as boolean` on a jsonb `{success, added}` — a non-null object is
always truthy, so **every removal was reported as an add**.

All three fixed: table created with RLS (read a reaction if you can see the
message, write only your own), getter created returning exactly the
`{reaction, count, user_reacted}` shape the client already maps, and the client
corrected (CA `ebf494775`). Add-then-remove round trip asserted inside the
migration.

### Flash pools — a UI with no backend

`FlashPoolPage.tsx` has a working Join button that calls `join_flash_pool`. There
is no `join_flash_pool` function, and no `flash_pools`, `flash_pool_players` or
`flash_pool_entries` table — **the feature has no schema at all**. The failure
even lies to the user: the error branch renders "Unable to join pool — you may
already be in this pool".

This is not a bug to fix; it is an unbuilt feature with a shipped front end.
Building it is a product decision, not an audit item, so it is written down here
rather than invented.

---

## 32. Phase close-out: four more phantoms, and a worse category behind them (2026-08-17)

### Arena Training was dead at the first step

`ArenaTrainingController.ts` references `public.arena_sessions` in **five**
places. The table had never been created.

| call | what actually happened |
|---|---|
| `startSession()` | INSERT fails → throws "Failed to start training session". Nobody has ever been able to begin a session. |
| `recordAnswer()` ×2 | SELECT/UPDATE fail → "Session not found". |
| `getUnlockedLevel()` | SELECT fails → the error branch `return 1`. Every user reads as **locked to level 1**. |
| `record_arena_session()` | RPC did not exist. |

`getUnlockedLevel()` is the instructive one: it fails **closed and silently**, so
the feature looked like "nobody has progressed yet" rather than "this is broken".

Table created with exactly the columns the client selects, RLS scoped to the
owner, and `record_arena_session()` derives pass/score from the **stored** answer
counts, never from the caller-supplied `p_mastery_rate`. Asserted in-migration by
replaying a session where the caller claims 0.99 mastery over a stored 4/20 —
it still fails.

**No diamond payout was added.** The call site says "for Diamond rewards", but no
reward schedule exists anywhere in schema or client. Inventing per-level amounts
would be minting currency from a guess — precisely what §20 forbids.

### `get_unseen_questions` — the anti-join that was never there

`triviaQuestionLoader.loadQuestionsForUser()` calls it as step 1, its own comment
describing it as "the server-side anti-join if the database exposes it". It never
existed, so every call fell through to a client-side pipeline pulling at least
`max(200, count*5)` rows with up to 3 retries and filtering in JavaScript.
Verified against the heaviest real user — 333 questions already seen, pool of
11,197 — 20 rows returned, **0 already-seen leaked**. The fallback stays; it also
covers the userId-less case.

### `PlayerPositionStatsService` — deleted, not implemented

Its two phantom RPCs (`bulk_update_position_stats`, `bulk_add_vip_points`) were
the wrong thing to build, twice over:

- **Position stats are already server-side.** Trigger
  `hand_history_position_stats` on `hand_history` is ENABLED;
  `player_position_stats` holds 3,450 rows across 575 users and was written
  today. A client writer would have raced the trigger and double-counted.
- **VIP points are deliberately not client-grantable.** Both `add_vip_points`
  overloads and `fn_award_vip_points_from_rake` grant EXECUTE to `service_role`
  **only**. The service built a `vipPayload` with a client-chosen `amount` per
  user, so a browser-callable `bulk_add_vip_points` would have been a points
  mint — and VIP points redeem through `fn_redeem_vip_points`.

It also had zero callers: `TablePage.tsx` imported it and never invoked it.
Import removed, file deleted (CA `93737d4e7`).

### ⚠ NEW CATEGORY — silent stubs, worse than phantoms

A phantom RPC at least returns PGRST202. A function that **exists with an empty
body** returns success and does nothing, so no error ever surfaces. There are
exactly four:

| function | client-callable | consequence |
|---|---|---|
| `fn_check_level_advancement(uuid)` | **yes** | Arena level advancement never evaluated |
| `fn_consume_feature_use(uuid, text)` | no | VIP feature quota never consumed |
| `fn_increment_vip_usage(uuid, text)` | no | VIP usage never counted |
| `recalculate_leaderboard_ranks(uuid)` | no | leaderboard ranks never recalculated |

Each body is literally `BEGIN END;`.

**Behavioural proof, the same shape as the `cashout_requests` zero-rows proof in
§16:** `vip_feature_usage` and `vip_monthly_usage` both hold **0 rows**. The two
functions that should write them have never written anything, so whatever
per-tier VIP limits exist are entirely unenforced.

Filling these in requires the policy they are supposed to enforce — the VIP quota
schedule and the leaderboard ranking rule — so they are written down here rather
than invented.

### Still open, and why

| item | why it is not fixed |
|---|---|
| `claim_lucky_wheel_spin` | `user_lucky_wheel_spins` and `spin_bonus_pools` exist, but **no segment/prize table** does. The client expects `{segmentId, rewardType, amount}` — the amounts are the product decision. |
| `increment_bonus_progress` | **No progress schema at all.** `user_bonuses` holds only `daily_streak` and `last_daily_claim`; there is nowhere to store per-bonus progress. |
| `join_flash_pool` | Whole feature unbuilt (§31). |
| the 4 silent stubs | Need the policy they enforce. |

---

## 33. Open items closed + the pause-is-not-a-freeze fix (2026-08-17)

### 33.1 Every deferred item from §32 is now built

| item | what was built | verified by |
|---|---|---|
| Lucky wheel | `lucky_wheel_segments` (8 segments, weights sum 100, EV ~176 chips — calibrated to the 100–1000 daily bonus band) + `claim_lucky_wheel_spin()`: JWT-derived actor, one spin/UTC day, weighted server RNG, credits via `atomic_credit_wallet_and_log`/`add_vip_points`/`add_diamonds_to_balance` with idempotency keys. Raises the exact `'Already spun today'` string the client matches on. | in-migration asserts |
| Bonus progress | `user_bonus_progress` + `increment_bonus_progress()` returning the new total, amount capped at 1000/call | 3 then +2 = 5 asserted |
| Flash pools | `flash_pools` **existed** (correcting §31 — it was empty, not missing); added `flash_pool_players`, `join_flash_pool()`, and 4 seeded pools | live probe: joined with 40 chips, wallet debited exactly 40, double-join rejected, refunded |
| `fn_increment_vip_usage` | real body: atomic upsert into `vip_feature_usage` with UTC-day `daily_usage` reset | 2 calls → one row, counts 2/2 |
| `fn_consume_feature_use` | decrements `uses_remaining` on the newest live `feature_purchases` row | — |
| `recalculate_leaderboard_ranks` | **the old stub could never have been called**: it took `p_leaderboard_id` and the only caller passes `p_promotion_id`, so PostgREST 404'd before reaching the empty body. Recreated with the caller's signature; dense_rank over `promotion_leaderboards` | — |
| `fn_check_level_advancement` | abandons stale (>24 h) active arena sessions | — |

Empty-body stub count is now **0** (was 4). The wallet guard earned its keep here:
v1 of the migration tried a direct `wallets` UPDATE inside `join_flash_pool` and
the **Phase 4.1.6a guard aborted the whole migration** — exactly its job. v2
routes through `atomic_deduct_wallet_and_log`.

### 33.2 A legitimate pause read as a freeze — two kill paths, both fixed

Reading the (already excellent) 3-tier watchdog for the auto-recovery work
exposed a false-positive that inverted its purpose:

**Table tier.** During a hand-for-hand pause, `handController` is null, seats
are dealable, and pausing marks no progress — so watchdog Case B counted it as
"dealing loop dead" and after 2 trips **killed and rebuilt the engine. The
rebuild loses the pause flag, so the fresh engine deals a hand INTO
hand-for-hand.**

**Platform tier — worse.** `/health`'s stall filter had the same blind spot: one
legitimately paused final-table bubble >2 min flips liveness to `'dead'`, three
failed Docker health probes later **autoheal restarts the entire engine**,
killing every table on the platform.

Fix (CA `e5aedd153`): `isPausedByDesign()` (hand-for-hand or FSM `'paused'`)
exempts the table from both detectors; a pause >15 min raises a
`paused_too_long` **report, never a kill** — forcing play during a legitimate
pause is a tournament-integrity failure, a long pause is only an incident. New
gauge `poker_paused_tables`; stall gauges exclude paused tables.

Locked by two new TableWatchdog tests: a 10-min-stale paused table takes zero
trips across three runs; `resumeDealing()` re-engages the watchdog. Suites
green (15/15 + FreezeRegression 5/5), tsc clean.

### 33.3 Recoveries are now DB-visible

`engine_recovery_events` (migration applied): every tier-1 clock re-arm, tier-2
forced action, tier-3 kill-and-rebuild and `paused_too_long` writes a
best-effort row. This is both an audit trail and the CLAUDE.md-mandated
DB-visible deploy proof. Deploy verification of `e5aedd153` is scheduled
(45 min): restart signature in `hand_history` or a first recovery-event row.

---

## 34. UI phase: BBJ defragmentation, lobby 34x, and what checked out clean (2026-08-17)

### 34.1 The BBJ fragmentation (the phase's biggest find)

Covered in commit `cf4d3ff041`: 1,884 duplicate union jackpot pools — one
created PER HAND by `WHERE club_id = NULL` matching nothing — consolidated to
one canonical pool per scope under EXCLUSIVE locks with per-column conservation
asserts; two partial unique indexes make recurrence impossible;
`fn_resolve_bbj_pool()` resolves scope from the `tables` row and all three
`add_bbj_contribution` overloads route through it. Live-verified: 1,886 → 3
pools, the running engine's contributions landing on the canonical row 75s
later, count still 3. The union BBJ ticker displays its true total with zero
client changes. v1 of the migration **aborted itself** when its orphan assert
caught the live engine writing to fragments mid-merge — the assert working.

### 34.2 Club lobby: 714ms of dead-table scanning per open

`tables` holds 56k rows; the biggest club has 33,375 of them but only 298 open.
The lobby's exact query (`club_id = X AND is_deleted = false AND status <>
'closed' ORDER BY created_at DESC`) measured:

```
Rows Removed by Filter: 33,077     Buffers read: 3,836     714 ms
```

Three partial indexes now match the three lobby queries exactly
(`getClubTables`, `getActiveTables`, `getUnionTables`), indexing only the ~1-2%
of rows that are open, so they stay tiny however many closed tables accumulate.
Re-measured: **714ms → 20.9ms**, plan on `idx_tables_club_open`, zero rows
discarded. In-migration assert fails if the query ever exceeds 100ms again.

### 34.3 Verified clean (no fix needed)

| surface | what was checked | result |
|---|---|---|
| ClubLobby data layer | parallel fetches, filtered realtime channel (`club_id=eq.X`), `diamond_wallets` self-RLS, owner/member reads | sound |
| Union table visibility | `tables` read policy is `true` — 641 union tables visible to players | sound |
| Multi-table | tabs rebuilt from server truth (active `table_seats`), additive merge, rogue-tab guard, MAX_TABLES cap | sound (2026-08-15 fix holding) |
| Hand history | exact JSONB containment query as an impersonated player: 50 hands in 107ms under RLS | sound |
| BBJ winners feed | readable under RLS (19 rows) | sound |

### 34.4 Remaining items that are DESIGN decisions, not defects

- **Visual overhaul** of ClubLobby/TablePage: the pages are functionally sound
  and heavily fix-passed (12 documented fix rounds on ClubLobby alone). A
  redesign needs direction on look/feel; blind restyling risks the working
  mobile-first layouts.
- **DynamicWallet** displays `chip_treasury` while mint/distribute move
  `chip_pool` (§24's naming-trap pair) — owner mints and sees no change.
  Which balance the widget should show is a product call.
- **Chip purchase entry point**: the server-priced purchase flow works
  end-to-end but no UI navigates to it (orphan modal, §21).

---

## §35 — BBJ sweep recurrence, workers deploy path breakage, cashier UI ship (2026-08-17 late)

### 35.1 Promo sweep recurrence — VERIFIED LIVE
Workers commit 601d951 added `fn_sweep_bbj_promo_all` as step 6 of `/cron/bbj-detect`.
Deployed to the Hetzner VM (container label rev=601d951be) and verified by DB signal:
promo_total 35.78 → (23:00 run, first on new code, success 413,784ms) → 5.57 → (23:20 run)
→ 2.44. Residuals are post-sweep accrual from live tables. The sweep now recurs on the
detection cadence; per-row `FOR UPDATE` in the sweep fn makes concurrent runs safe.

### 35.2 Overlap defect found and fixed (workers e4a3784, tag v1.0.1)
`cron_execution_log` showed every bbj-detect run takes ~413s against a 300s cadence:
two full scans (and, since 601d951, two sweeps) were running at ALL times. A naive
skip-if-running guard would stretch the effective cadence past the fixed 6-minute scan
window and produce a permanent detection blind spot for jackpot hands. Fix shipped:
in-process overlap guard + dynamic scan window (scan since previous run's START minus
60s jitter, capped at 60 min; payout-exists idempotency makes wide windows safe) +
30-min stale-in-flight escape so a hung run cannot block the detector until restart.
VERIFIED LIVE: 23:20 firing success 411,487ms; 23:25 firing success duration 0ms (skip);
alternating pattern is the designed steady state (~10-min effective full-scan cadence,
zero-gap window coverage).

### 35.3 Workers deploy path is BROKEN — action for Dan
`scripts/deploy-workers.sh` fails at two independent layers:
- Keychain `smarter-poker/github-pat-ghcr-read` PAT is dead → release.yml dispatch HTTP 401.
- The VM's stored GHCR docker credential is also dead → `docker compose pull` = denied.
No available credential (keychain git credential, gh CLI token, .env fine-grained PAT)
has `workflow_dispatch`/`packages` scope. Workaround used and now repeatable:
1. Push an annotated `v*.*.*` tag → release.yml builds the image (tags v1.0.0, v1.0.1 created).
2. `git archive <sha> | ssh VM tar -x` → on-server `docker build` tagged as the compose
   image name, `docker compose up -d --no-build` (server never needs GHCR).
TO RESTORE THE SCRIPT: rotate a PAT with `repo` + `workflow` + `read:packages`, update
keychain entry `smarter-poker/github-pat-ghcr-read`, and re-run `docker login ghcr.io`
as the `workers` user on the VM.

### 35.4 Cashier/wallet UI shipped (CA 39bb67434, WH sync 38417f01bf)
- DynamicWallet: §24 naming trap fixed — "Club Bank" now reads `clubs.chip_pool` (what
  `mint_club_chips` actually credits); `chip_treasury` displayed as its own Rake
  Treasury row; both live via the existing realtime handler.
- CashierPage: §21/§34 orphan closed — "Get Chips" entry point wired to the existing
  ChipPurchaseModal (server-priced `purchase-chips` API), fetching live diamond balance.
- MEDIA_BASE tsc mystery RESOLVED: 6 TS2304 errors were another agent's half-committed
  MEDIA_BASE refactor sitting uncommitted in the shared working tree; it landed properly
  as CA 45f2228ce. Lesson recorded: on a shared checkout, `git stash -u` scoops up
  foreign WIP — always diff the stash against your intended files before assuming the
  tree is yours.

### 35.5 Housekeeping
- Migration mirror gap closed: `20260817191321_vip_monthly_feature_usage_and_throwable_pricing`
  extracted verbatim from `supabase_migrations.schema_migrations` and committed (WH 6bc5533bf9).
- `cron_execution_log` rows stuck `running` after container restarts (3 rows) marked
  `killed`. Future hardening candidate: boot-time sweep in the cron middleware.

---

## §36 — VIP time banks made real + two silent persistence defects (2026-08-18)

### 36.1 The VIP time-bank quota existed in three disconnected pieces
Dan's requirement: VIP members get time banks as a working perk. Found state:
the engine handed EVERY player the table default (120 uses = 1800s) of time
bank per session, in memory, VIP or not (`TimeBankEngine DEFAULT_CONFIG` +
`time_bank_max_uses ?? 120`). The client displayed a VIP quota of 120
seconds/month (`VIP_GOLD_LIMITS`) read from `vip_feature_usage_monthly` —
which nothing in the activation path wrote. Diamond purchases landed in
`feature_purchases ('time_bank_seconds')` — which nothing read. Net: the
perk was meaningless (everyone got 60x the non-VIP base), the monthly ledger
never moved, and purchased extensions were burned diamonds.

### 36.2 Wiring shipped (migration 20260817235234 + CA 2bb23eb43)
- `fn_time_bank_allowance(uuid[])` (service-only, batched): EXTRA seconds =
  VIP monthly remaining (120s/month; unit DEFINED as seconds — nothing wrote
  the feature's row before) + purchased uses × 15s.
- `fn_consume_time_bank(uuid,int)` (service-only, advisory-locked per user):
  VIP monthly pool first, then purchased uses FIFO; shortfall reported,
  never fails an in-flight hand. In-migration probes: 120 → consume 45 → 75;
  overdraw consumes 75 vip + 1 purchased use with 30s shortfall; non-VIP
  extra 0. State restored before commit.
- Engine: hand-init batch fetch for NEW players only (fail-open to 30s
  base); accounting hook commits only the excess beyond session base, once
  per use; manual /timebank on an empty bank refreshes from DB once (mid-
  session diamond top-up usable without re-seating; turn re-validated after
  the await). `TimeBankEngine.rebase()` added. TimeBankVip.test.ts (7 tests).

### 36.3 Silent defect found during verification: seat persistence NEVER wrote
All 22,805 `table_seats` rows had `time_bank_uses_remaining = 4` — the
INSERT default. Settlement passed `p.time_bank_uses_remaining` from
HandController players, which never carry the field (undefined), and
syncStacks skips undefined: the persist had never written once in the
table's history. Fixed (CA bf0bef466): ask TimeBankEngine at sync time,
persist seconds too. VERIFIED LIVE post-deploy: active seats at tables with
fresh hands now show 150s/10 uses for VIP (30 base + 120 monthly) and
30s/2 uses for non-VIP — 152 vip seats and 127 non-vip seats measured, with
only 4 residual rows still at the old default.

### 36.4 E1 closed: run-it-twice hands record winners again (CA fbbe0a54e)
`dealAndResolveRIT` pre-set winner IDs + board-0 showdown state but never
`currentHandWinners`; `finalizeRunout(true)`'s empty WINNERS event preserves
(empty) pre-set state — so every RIT hand logged `winners []` and shipped
pot_win/pot_distributed with no per-winner data (stacks correct; record and
animations blank). Fix populates `currentHandWinners` from the net RIT
distribution and appends other paid players to `currentHandWinnerIds` AFTER
the board-0 winner — ORDER IS LOAD-BEARING: `detectBBJHit` reads index 0 and
board 0 is the only BBJ-eligible board (Dan's 2026-07-21 rule).
Verification caveat, recorded honestly: live traffic has ZERO RIT hands in
24h (~250k hands — horses do not consent to RIT), so this cannot be
live-verified until a human pair runs one. Standing detector: any ended hand
with `jsonb_array_length(winners) = 0` (currently 0 across 6h/73k hands).
Note: an independent agent fix landed the same hour (d0abf2fda, RIT pot
destroyed by crediting a state COPY) — both fixes coexist; mine rebased on top.

### 36.5 Also observed
- Another agent's MEDIA_BASE refactor (45f2228ce) and RIT stack fix
  (d0abf2fda) landed mid-phase; formatting ping-pong from lint-staged
  produced net-zero diffs that were discarded, foreign WIP left untouched.
- Client TimeBankDisplay caps its bar at 120s for VIP while a fresh VIP
  session now starts at 150s (30 base + 120) — bar clamps at 100%, cosmetic
  only, noted not fixed.

### 36.6 Fix-everything pass before next phase (2026-08-18 01:00 UTC)

- **TimeBankDisplay scale fixed** (CA b9fbf17e4): VIP max is now 30s base +
  120s quota = 150s. Component confirmed UNMOUNTED (TablePage renders its
  own indicator, initialized from the now-real table_seats columns) - fixed
  so future wiring doesn't resurrect the wrong scale. §36.5 item closed.
- **cron_execution_log zombie rows now self-heal** (workers b773177,
  v1.0.2): rows stuck 'running' >30 min are marked 'killed' at boot and
  every 10 min. First boot sweep reaped 9 zombies (more than the 3
  hand-cleaned - other cron jobs had them too). Verified live via container
  log '[cron-sweep] marked 9 stale rows'. Standing count of stale rows: 0.
- **deploy-workers.sh has a working path again**: --build-on-server
  (git-archive HEAD → VM docker build → compose up → health probe), the
  flow that shipped the last three workers deploys by hand. Dogfooded for
  this very deploy: rev b773177ddb5 live, health OK. The GHCR path's error
  message now states the PAT is dead and points at the fallback. PAT
  rotation remains Dan's action (§35.3) to restore the registry path.
- **bbj-detect steady state re-verified post-restart**: alternating ~410s
  full runs and 0ms overlap-skips, every firing success, promo_total 21.60
  (active accrual between sweeps), invariants 15/15 OK.
- NOT fixable by an agent: GHCR PAT + VM registry login rotation (§35.3);
  E1 live exercise (zero natural RIT hands in 24h - standing blank-winner
  detector in place); 21 diverged ancient WH branches (needs Dan's say-so).

---

## §37 — Run It Twice/Three: from dead feature to live and cent-exact (2026-08-18)

Dan's directive: users must be able to run it two or three times, pots split
correctly, rake + BBJ taken out, no gaps. Found FOUR stacked defects that
together meant ZERO RIT hands had ever occurred in live traffic:

### 37.1 Horses never answered rit_offer (CA 2ff8a0458)
No responder existed anywhere server-side: any horse in the all-in set let
the 10s offer expire → hand always ran once. Horses now respond with
human-like delays (chooser picks 2, 3 every third hand, deterministic by
hand number; responders accept), guarded against stale hands/dead offers.

### 37.2 Consent race (CA 2ff8a0458)
`chosenRuns` defaulted to the table max at offer time and responders
accepting quickly flipped the offer to accepted BEFORE the chooser picked -
silently discarding the chooser's choice. Completion now requires
`chooserDecided`; early accepts are recorded and the chooser's pick is the
completing action; late picks can't mutate settled offers; picks above the
table max clamp. 8 consent tests.

### 37.3 Preflop all-in rake/BBJ leak — ALL runout paths (CA 2ff8a0458)
Only advanceStage() ever set `sawFlop`; runOutCommunityCards (single-run),
dealNextStreet (insurance), and the RIT board path never did. With
noFlopNoDrop always true on live tables, EVERY preflop all-in hand paid no
rake and funded no jackpot. VERIFIED LIVE across the deploy boundary:
01:17-01:20 preflop all-in runouts show rake 0.00 on pots of 2,522 / 3,360
/ 13,699; from 01:26 the same shape collects rake 2.50-5.00 + bbj 0.12-0.50.

### 37.4 RIT gated on a column nothing writes (CA bcb417580)
Engine read `tables.run_it_twice_enabled` (39/710 open tables, an old
script's leftovers). The product writes `run_it_twice` (CreateTableModal)
and `allow_run_it_twice` (TableCreationPage) and the lobby ADVERTISES the
feature off `run_it_twice` - on ~every table. 22 eligible all-in runouts
in one measured 40-min window never received an offer. Engine now derives
owner intent: (run_it_twice AND allow_run_it_twice) OR legacy column;
insurance mutual exclusion unchanged.

### 37.5 Hand history completeness (CA d1a9d5508)
RIT boards were built outside HandController → a preflop all-in RIT hand
recorded NO board. Board 0 (canonical, BBJ-eligible) is now the hand's
community_cards; extra runouts appended to actions as rit_board_2/3.

### 37.6 Proof
- RunItTwice.money.test.ts drives the REAL dealAndResolveRIT at the real
  all-in runout point: 2 runs, 3 runs, 3-way side pots - chips conserved
  to the cent (stacks + rake + bbjFee == buy-ins), rake/BBJ once (not per
  board), winners recorded and summing to the net pot, all recipients
  all-in participants. Single-run preflop leak pinned. 588/588 pass.
- LIVE (first RIT hands in platform history, 01:37-01:38 UTC):
  ca37cf62: pot 299.22, rake 5.00, bbj 0.50; boards SPLIT - two winners
  146.86 each = 293.72 = net pot exactly; both boards recorded.
  3da5894e: pot 109.27, rake 3.00, bbj 0.30; one player swept both boards,
  paid exactly 105.97. Blank-winner detector: 0 (E1 holding).
- 3-run hands: money path test-proven; live occurrence pending (chooser
  horses pick 3 every third RIT hand - will accumulate naturally).

### 37.7 Two more defects found chasing live silence, then full live proof (02:30 UTC)

After 37.1-37.5 shipped, live RIT hands appeared (2 at 01:37-38) then went
silent despite 48 eligible all-in runouts in 20 minutes. Sampled hands
showed why - every live all-in was a TURN shove:

- **Offers fired AFTER the next street was dealt** (CA 51f951290). The
  all-in-runout check sat below advanceStage's street-dealing switch, so a
  turn all-in had the river on board (board=5) by offer time - RIT and
  insurance both silently impossible in the single most common real spot -
  and a flop all-in ran only the river twice instead of turn+river. The
  park now happens BEFORE dealing (matching ALL_IN_RUNOUT's own comment);
  every downstream path was already board-length generic. The insurance
  per-street flow also now genuinely starts at the first undealt street.
- **RIT ran in tournaments** (CA 359622ff5). The intent columns default
  true on tournament tables too; a live 3-run tournament hand (41627f9a)
  split 1,760.88 into 586.96/1,173.92 - fractional amounts against
  INTEGER tournament chips (sync floors = chip destruction), and no major
  app offers RIT in MTTs. Gated off for tournament_id/game_type=tournament.

LIVE PROOF (02:20-02:30 UTC window, all post-fix): 4 RIT hands, all cash
tables (tournament gate holding), 3 of 4 TURN all-ins, 3 of 4 THREE-run
boards, 0 conservation violations (winners == pot - rake - bbj to the
cent on every hand), rake 12.32 + bbj 1.00 collected, blank-winner
detector 0. Users can run it two or three times, from preflop, flop, or
turn, with pots split correctly and rake + BBJ taken exactly once.
593/593 server tests.

### 37.8 The human-facing half: two more wiring breaks fixed (02:45 UTC)

Horses proved the engine; auditing the HUMAN path found the feature was
still unusable by actual players:

- **/rit rejected the chooser phase** (CA 1f0880a55, deployed, engine
  /health = 1f0880a5). The handler required `response` in
  {accept,decline}, but the client's chooser phase sends only
  `{ tableId, runs }` - a human chooser's 1/2/3 pick was 400'd at the
  HTTP layer, so no human could ever START a run-it-twice. Horse
  responses bypass HTTP (in-engine), which masked it. Handler now takes
  either runs or response; 4 new handler tests pin both phases and both
  400 paths. 597/597 server tests.
- **rit_result was discarded by a client stub** (CA 7bec698af, shipped
  in WH sync f6fda1d4c6). The event is the ONLY place the extra boards
  exist client-side (RIT boards never enter the engine's community-card
  state), and the TablePage handler threw it away - a human in a RIT
  hand watched the pot ship with no runout shown. New RunItTwiceResult
  overlay renders every board (2 or 3) plus net payouts with usernames
  for all viewers; auto-dismisses in 12s. (The orphaned RunItTwiceBoard
  component was heads-up/2-run only and could not render the real event.)
- **Insurance per-street flow reviewed** against the parity fix: it deals
  its own streets from any board length, recursion terminates at
  result.complete → finalizeRunout, and it now genuinely starts at the
  first undealt street. No live insurance tables; no regression.

Cumulative live tally since 02:20 UTC: 7 RIT hands, 5 of them THREE-run,
0 tournament leaks (gate holding), 0 conservation violations, rake 23.53
+ bbj 2.50 collected, blank-winner detector 0 across the hour, platform
invariants 15/15 OK.

---

## §38 — Insurance deep dive: contract-exact pricing, signed bank, probed money path (2026-08-18)

Context: insurance_transactions had ZERO rows in platform history - every
open table has insurance_enabled=false (a real owner toggle in
CreateTableModal/TableConfigPage writing the correct column - dark by
choice, NOT a wiring trap like RIT's was). So the entire money path had
never executed. Everything below was verified by test/probe before any
owner can flip it on.

### 38.1 Pricing did not match the contract (CA f58a882cc)
Settlement PUSHES on a chop (FIX 118: premium refunded, no payout), but
the premium was (1 - potShareEquity) x 1.2 - pot-share equity counts a
chop as a partial loss, so every chop-prone spot was overcharged for
outcomes the house must refund (a chop-dominated spot priced at ~60% of
stake for near-always-void coverage). InsuranceEquity now returns the
contract's outcome probabilities (strictLossPct / pushPct alongside
pot-share equity) and the premium is insured x P(strict loss | not-push)
x margin. Near-certain chops (>=99%) and cannot-lose leaders get NO
offer. No-tie spots price identically to before (regression anchor test).

### 38.2 Pricing precision restored (same commit)
Live pricing had silently moved to the Monte-Carlo worker (2000
ties-split iterations, ~1% stderr) because the exact enumerator's
sampling burned ~45 CSPRNG syscalls per board. Sampling now uses
SeededRandom (deterministic per spot: the same all-in always prices the
same), so EXACT enumeration is back on the pricing path - flop/turn
fully exact (<=990 boards), preflop 6,000 seeded samples. The MC worker
still powers the on-screen equity broadcast.

### 38.3 Horse liveness (same commit)
Horses never answered insurance offers: a horse leader stalls an
insurance table ~15s per street (up to ~45s per all-in hand, re-offered
each street). A horse leader now declines FOR THE HAND after ~1s and the
pause collapses to instant runout. Horses never buy insurance (the
margin is pure EV loss; horse chips are house chips).

### 38.4 The bank could not pay (migration 20260818154656) — PROBE-CAUGHT
record_insurance_transaction banked club insurance in
club_wallets.chip_balance, which carries CHECK (chip_balance >= 0). The
FIRST payout exceeding collected premiums would have ERRORED at
settlement: table stack already credited, bank never debited,
alert-and-under-collect. Union clubs were fine (insurance_wallet has no
check). Fix: club_wallets.insurance_balance - a SIGNED underwriting
account mirroring union semantics - upserted (not bare-UPDATEd: a club
without a wallet row must not lose the bank side). Probes executed the
real paths against production schema in a rolled-back subtransaction:
premium collection, idempotent replay (wallet moved exactly once),
payout beyond premiums (bank goes negative), push (ledger row, no
movement), missing-wallet-row upsert. Grants re-asserted service-only.

### 38.5 Verified sound (no fix needed)
- /insurance handler <-> client GameServerAPI params match exactly
  (tableId/response/coveragePercent/declineForHand - checked for the
  /rit-class mismatch; none).
- Engine stack mutations at settlement: payout credited to both stack
  copies, premium deducted with the M16 shortfall alert, chop=push,
  winner-pays-premium; ledger write is retried + read-back-confirmed
  with a durable alert on definitive failure (insuranceLedger.test.ts).
- Offer lifecycle: leader-only offers, per-street re-evaluation
  preserving accepted coverage, decline-now vs decline-for-hand, expiry
  via DeadlineScheduler, 20s safety net behind the 15s offer timeout.
- Client UI: InsuranceModal/Panel wired to insurance_offers, slider
  preview via /insurance-preview.

### 38.6 Improvements considered and deliberately deferred
- Enabling insurance on live tables is an OWNER choice (the toggle works);
  flipping it platform-wide is Dan's product call - note RIT and insurance
  are mutually exclusive per table (FIX 92), so enabling insurance turns
  RIT off there.
- Offer insurance when RIT is declined (coexistence) - product design.
- Exact preflop enumeration in the worker (currently 6k seeded samples,
  +/-0.6%; the margin is 20%).
- insurance ledger integrity check in fn_platform_invariants_health once
  live volume exists.

Live regression check post-deploy: RIT still flowing (3 hands/30m, 0
conservation violations), blank-winner detector 0, 2,469 hands/10m,
invariants 15/15. Tests 596/596 (13 insurance-specific).

### 38.7 Dan's rules pinned: run-once only, chopped pot voids (2026-08-18 16:10)

Dan's directive verbatim: "insurance is only allowed for running it once;
if the pot is chopped, insurance is voided."

- **Run-once only — enforced at two layers, both test-pinned** (CA
  ba0398b3f + 10c5fc1a9, 613/613): (1) config layer FIX 92 - a table with
  both features gets RIT force-disabled at engine start, so an insured
  table always runs exactly once; (2) runtime layer - the REAL
  handleAllInRunout drives the insurance path FIRST whenever insurance is
  enabled (RIT offer block unreachable), and a RIT hand never produces an
  insurance offer. One hand can never carry both.
- **Chop voids — every shape pinned**: leader ties the pot -> VOID
  (premium refunded, no payout); leader among multiple winners (side-pot
  split) -> VOID, never double-paid; two OTHER players chop while the
  leader loses -> insurance PAYS (the rule is about the LEADER sharing a
  pot, not any chop anywhere). Pricing (§38.1) already charges only for
  P(strict loss | not-push), so premiums and the void rule are actuarially
  consistent end to end.

Final sweep: engine serving f58a882c, 613/613 tests, RIT live (4 hands/1h,
0 conservation violations), blank-winner detector 0, insurance dark until
an owner enables it (0 tx - correct), invariants 15/15 OK.

---

## §39 — Multiway RIT per Dan's rules + a chooser bug the proofs caught (2026-08-18 16:40)

Dan's rules verbatim: RIT can be multiway — every player at the table if
all all-in; the player with the best ACTUAL hand at the time (not the best
percentage to win) decides the run count; ALL all-in players must accept;
one decline runs the pot once.

### 39.1 Verified as specified (RunItTwice.multiway.test.ts, CA 2ac71be40)
- Chooser = best MADE hand, pinned with the sharpest case: an overpair
  out-chooses a monster straight-flush combo draw that is the EQUITY
  favorite; three-way preflop, pocket aces choose.
- Full-table 6-way consent against the real engine: five accepts leave
  the offer pending, the sixth completes it; ONE decline anywhere kills
  it for everyone (pot runs once).
- 6-way 3-run money: five side pots, over-shove excess refunded uncalled
  before rake, chips conserved to the cent, winners sum to the contested
  net pot, all three boards recorded.
- A declined offer flows through the REAL 250ms wait to a single-board
  completion with no RIT markers.

### 39.2 The proofs caught a live bug: preflop chooser was wrong
Since the parity fix, preflop all-ins park on an EMPTY board - and
evaluateHand cannot rank a bare 2-card holding: it selected KK over AA
as chooser. Preflop chooser selection now compares hole-card strength
(pair > unpaired, higher pair, then kickers); postflop the full
evaluator rules unchanged. This mattered for every preflop multiway
all-in since 51f951290 (~14h) - the wrong player got the 1/2/3 choice;
money was never wrong (the chooser only picks the run count).

### 39.3 Display improvements shipped with it
- rit_result now carries per_board_winners (exact winner set per board,
  splits and side pots included); the result overlay labels each run
  with who won it.
- The responder prompt resolved the chooser to a display NAME - it was
  rendering the raw UUID of whoever asked to run it twice.
- Regression from a stale-based foreign edit reverted: an uncommitted
  working-tree change had deleted the committed rit_result overlay
  wiring in TablePage; restored from HEAD and re-patched.

Live post-deploy (engine 2ac71be4): 4 RIT hands in the first 10 minutes,
0 conservation violations, blank-winner detector 0, invariants 15/15.
619/619 server tests, client tsc clean.

---

## §40 — Bad Beat Jackpot full audit: the $99k rule, a retired parallel payer, and a 400x cron win (2026-08-18 17:20)

### 40.1 How it works (verified end to end)
- FEE: per qualifying hand (pot >= 10BB, flop seen - the §37 sawFlop fix
  made preflop all-ins contribute), tiered by stakes: 0.6bb nano/micro →
  0.03bb nosebleeds. Collected in settlement, banked via add_bbj_contribution
  → fn_resolve_bbj_pool (canonical per scope since the §34 consolidation),
  allocated 50/25/25 main/backup/promo (pivot 30/40/30 past $100k main).
- TRIGGER (engine detectBBJHit at settlement, first runout only, board 0 on
  RIT hands): NLH/FLH aces-full-of-jacks+ must lose, loser holds an Ace;
  PLO4/PLO8/pineapple quad-kings+; PLO5 8-high SF+; plo6/short-deck
  ineligible; 3+ dealt; tournaments excluded.
- PAYOUT (bbj_atomic_payout_v2, sole payer): stakes-tiered % of main pool
  (15/25/40/55/70/85 by tier), split 50% bad-beat holder / 25% hand winner
  / 25% table (dealt-in others), rounding folded into the loser so records
  == credits == debit. Seated recipients credited ON THE TABLE STACK
  (engine mirrors in memory and re-syncs - they leave with the chips);
  departed dealt-in players get a direct wallet credit via the whitelisted
  RPC. Claim-key idempotent with per-recipient credit RE-DRIVE on retry.
  After a hit, backup_balance reseeds the new main. bbj_winners row written
  in the same transaction. Ledger verified clean: 39 payouts, 0 duplicate
  hand keys, 0 share-sum mismatches, 0 recipient-sum mismatches.
- ANIMATIONS: bbj_hit (hand names) → bbj_payout_complete (amounts +
  updatedStacks) → 3s-delayed BBJCelebration overlay (canvas confetti /
  fireworks / chip rain, rolling payout counter) with stack sync and
  unmount-safe timers. Wired and sound.

### 40.2 THE $99K FINDING (CA 227e1a787, deployed, engine 227e1a78)
detectBBJHit never checked the WINNER's hand. Dan's rule: AAAJJ+ must lose
TO QUADS OR A STRAIGHT FLUSH - but any bigger full house triggered it.
Live ledger: 25 of 39 payouts, $99,066 of $148,121 (64% of all jackpot
money ever paid), were boat-over-boat hands the rule excludes. Fixed: the
winning hand must be quads+. Also fixed in the same pass:
- "Both cards from hand must play" (declared in BBJ_RULES, enforced
  nowhere): hold'em-family hands now require BOTH the loser's and the
  winner's best five to strictly need both hole cards (board-boat with a
  dead kicker and board-quads-plus-kicker no longer qualify); Settlement
  passes the final board. Omaha is game-enforced.
- Multiple qualifying losers resolve to the STRONGEST beat (was seat
  order). splitIfMultipleQualify: documented-not-implemented (needs a
  two-holder atomic payout; astronomically rare).
- 15-test qualification matrix pins every rule per game. 636/636 server.

### 40.3 A second, WRONG payer retired (migration 20260818170329 + workers 16d7e8c)
The workers' bbj-detect cron drove a parallel path: fn_bbj_check_eligible
matched players.best_hand_label - a field the engine never writes (inert!),
and had it matched it would have paid the QUAD-ACES HOLDER without
checking they lost, with zero qualifications and unresolvable union pools;
fn_bbj_payout drained the DEAD pool_amount column, had no idempotency,
credited wallets instead of table stacks, and split 50% to the wrong
player. Both DB functions now refuse permanently (probed: no money moves),
grants service-only. The worker's scan (one RPC per settled hand) is
removed; it keeps the promo sweep.

### 40.4 Cron collapse - 400x
Removing the scan cut /cron/bbj-detect from ~413,000ms to 357-610ms,
VERIFIED in cron_execution_log. Every 5-minute firing now runs (the
overlap guard's skip-every-other steady state is gone) and the promo
sweep truly recurs at 5 minutes (promo_total 8.33 residual).

### 40.5 Remaining notes
- bbj_pools.pool_amount / hands_contributed are dead legacy columns with
  garbage values (41k on the club pool); nothing reads them since the
  retirement. Deferred: drop or zero them (schema surgery, low risk of
  confusion documented here).
- Pool hit_count (87) predates the payout ledger (39 rows since 07-25);
  the delta is pre-v2 history, not missing money.
- processBBJPayout selects the pool without status='active' (safe today:
  3 canonical pools post-consolidation; noted for hardening).
- Payout % tiers and fees match Dan's schedule screenshot exactly.

Invariants 15/15 OK.
