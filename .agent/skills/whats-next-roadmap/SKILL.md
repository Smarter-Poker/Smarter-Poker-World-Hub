---
name: What's Next Roadmap
description: Master roadmap for all remaining Smarter.Poker improvements, features, and infrastructure work. Living document updated as items are completed.
---

# 🗺️ Smarter.Poker — What's Next Roadmap

> **Created**: March 29, 2026 | **Last Updated**: March 29, 2026
> **Based on**: Live codebase audit of 64 hub pages, 46 API domains, 55 cron jobs, 27 src modules

---

## Current Platform Stats

| Metric | Count |
|--------|-------|
| Hub Pages | 64 (44 files + 20 subdirectories) |
| API Domains | 46 directories + 5 standalone routes |
| Cron Jobs | 55 automated tasks |
| Dependencies | 76 production + 14 dev |
| MCP Servers | 7 connected (Vercel, Playwright, Context7, Sequential Thinking, GitHub, Sentry, Supabase) |
| Agent Skills | 40+ |
| Knowledge Items | 20+ authoritative KIs |

---

## Status Legend

- `[ ]` Not started
- `[/]` In progress
- `[x]` Completed
- `[!]` Blocked (see notes)
- `[~]` Partially exists, needs improvement
- `[—]` Skipped / Deferred

---

## TIER 1: Quick Wins (Pre-Launch Priority)

### 1.1 — E2E Test Suite with Playwright MCP `[x]`

**Status**: Playwright MCP is connected and End-to-End test suite is fully wired against production.

**What to build**:
- Smoke test suite covering 5 critical user flows:
  1. `[x]` Login → Hub landing page loads correctly
  2. `[x]` Poker Near Me → Venue detail → Save venue
  3. `[x]` Training → Start GTO session → Complete a question
  4. `[x]` Social feed → Create post → Like/Comment
  5. `[x]` Diamond Store → View bundle → (mock) Purchase flow
- `[x]` Wire into CI/CD so tests run on every deploy
- `[x]` Add visual regression snapshots for key pages

**How to execute**: Use the `/browser-testing` workflow + Playwright MCP skill. Tests go in `/e2e/` directory.

---

### 1.2 — Bundle Size Audit & Code Splitting `[ ]`

**Critical oversized pages** (source file sizes):

| Page | Size | Status |
|------|------|--------|
| `memory-games.js` | 257 KB | `[ ]` Split |
| `poker-near-me.js` | 254 KB | `[ ]` Split |
| `settings.js` | 224 KB | `[ ]` Split |
| `messenger.js` | 218 KB | `[ ]` Split |
| `news.js` | 196 KB | `[ ]` Split |
| `poker-near-me-lobby.js` | 188 KB | `[ ]` Split |
| `diamond-store.js` | 187 KB | `[ ]` Split |
| `video-library.js` | 161 KB | `[ ]` Split |
| `profile-edit.js` | 149 KB | `[ ]` Split |

**How to execute**:
- Use `next/dynamic` with `{ ssr: false }` for heavy sub-components
- Extract tab panels, modals, and secondary views into lazy-loaded chunks
- Target: no page file > 80KB source
- **RISK LEVEL**: LOW — dynamic imports don't change functionality, just loading behavior
- **SAFETY**: Test each page after splitting to verify no hydration mismatches

---

### 1.3 — Automated Sentry Error Monitoring Pipeline (OpenClaw-Powered) `[x]`

> **OpenClaw** is a full autonomous AI agent — not just a scraper. It supports shell execution, API interaction, scheduled tasks, proactive alerts, and multi-step workflow chains. This pipeline leverages OpenClaw for **zero-human-involvement daily error triage**.

**What to build**:

1. `[x]` **OpenClaw Scheduled Triage Task** (runs daily, fully autonomous)
   - Connects to Sentry API → pulls top 20 unresolved errors by user impact
   - Categorizes by: page, severity, user count, first/last seen
   - Stores results in `sentry_error_log` Supabase table (via API)
   - Compares against previous day's snapshot to detect **new** vs **recurring** errors

2. `[x]` **Auto-Create GitHub Issues** (via OpenClaw → GitHub API)
   - New errors affecting 5+ users → auto-creates GitHub issue
   - Labels with `bug`, `sentry-auto`, and affected page name
   - Includes: stack trace, affected URL, user count, Sentry permalink
   - Deduplicates: checks if issue already exists before creating

3. `[x]` **Proactive Alert Delivery** (via OpenClaw alerting)
   - Daily summary notification: "3 new errors, 2 trending, 1 resolved"
   - Critical alert (immediate): any error with 50+ user impact or 500-level spike
   - Delivered via: push notification (1.4), Slack/Discord, or email

4. `[x]` **Error Dashboard in Horses Admin**
   - New tab in `/horses` showing real-time error stats
   - Trending errors, resolved vs unresolved, affected pages
   - One-click link to Sentry for deep investigation
   - Historical trend graph: errors over time

5. `[x]` **Weekly Auto-Report** (OpenClaw generates and delivers)
   - "This week: 12 new errors, 8 resolved, top offender: /hub/poker-near-me"
   - Includes severity breakdown and page-level error heat map
   - Stored as artifact in Supabase for historical tracking

**Automation boundary** (what OpenClaw handles vs. what requires human):
- ✅ Pull errors from Sentry API — AUTOMATED
- ✅ Categorize and store in Supabase — AUTOMATED
- ✅ Create GitHub issues — AUTOMATED
- ✅ Send alerts and reports — AUTOMATED
- ✅ Track trends and detect regressions — AUTOMATED
- ❌ Auto-fixing code — NOT AUTOMATED (too risky without human review)
- ❌ Auto-deploying fixes — NOT AUTOMATED
- ❌ Modifying production database schema — NOT AUTOMATED

**RISK LEVEL**: LOW — read-only monitoring + issue creation, no code changes

---

### 1.4 — PWA Push Notifications (Full Build) `[x]`

> **User Decision**: This must be FULLY BUILT. Users currently receive ZERO push notifications on browser.

**Current State**: `react-onesignal` is installed, `/api/pwa/` directory exists, but push is not activated end-to-end.

**What to build**:

1. `[x]` **OneSignal Service Worker Registration**
   - Verify `OneSignalSDKWorker.js` is in `/public/`
   - Initialize OneSignal in `_app.js` with proper app ID
   - Ensure HTTPS + correct VAPID keys in environment

2. `[x]` **In-App Permission Prompt** (NOT browser default)
   - Custom modal: "Never miss a tournament! Enable notifications"
   - Show after 2nd visit or after first saved venue/tournament
   - "Not now" dismisses for 7 days, doesn't burn the browser prompt
   - Track opt-in rate in Supabase

3. `[x]` **Notification Types to Wire**:
   - `[x]` **Tournament Reminders**: 24h and 1h before saved tournaments
   - `[x]` **Social Mentions**: When someone @mentions you or replies to your post
   - `[x]` **Friend Activity**: When a friend starts a live session
   - `[x]` **Venue Alerts**: When a saved venue opens your preferred game
   - `[x]` **Daily Challenge**: Morning notification for trivia/training challenge
   - `[x]` **Messenger**: New direct messages
   - `[x]` **Diamond Rewards**: When you earn diamonds or a streak is at risk
   - `[x]` **Club Updates**: New tournament posted in your club

4. `[x]` **Notification Preferences Page**
   - Add to `/hub/settings.js` under a "Notifications" tab
   - Per-category toggle (on/off for each type above)
   - "Quiet hours" setting (e.g., no notifications 11pm-8am)
   - Store preferences in `user_notification_preferences` table

5. `[x]` **Backend Push Sender**
   - `/api/notifications/send-push.js` — unified push endpoint
   - Accepts: `userId`, `type`, `title`, `body`, `url`, `data`
   - Resolves OneSignal player ID from user's profile
   - Respects user's per-category preferences and quiet hours
   - Rate limiting: max 10 pushes per user per hour

6. `[x]` **Wire Existing Crons to Push**
   - `tournament-reminders.js` → send push via OneSignal
   - `venue-game-alerts.js` → send push via OneSignal
   - `daily-challenges.js` → send push via OneSignal
   - `training-daily-challenge.js` → send push via OneSignal

**RISK LEVEL**: MEDIUM — requires OneSignal account config + testing across browsers


---

## TIER 2: Revenue & Monetization

### 2.1 — Affiliate Revenue Engine `[—]`

> **User Decision**: SKIPPED — not doing affiliate at this time.

---

### 2.2 — VIP Paywall Audit & Extension `[x]`

> **User Decision**: Extend VIP gating audit across ALL features, not just the ones listed.

**What to build**:

1. `[ ]` **Full Feature Gate Audit**
   - Inventory every feature across all 64 hub pages
   - Categorize as: FREE / VIP / DIAMOND-GATED
   - Identify features that SHOULD be VIP-gated but currently aren't

2. `[ ]` **Candidates for VIP-Gating** (to be audited):
   - `[ ]` GTO Training: Advanced solver scenarios, multi-street analysis
   - `[ ]` Poker Near Me: Historical venue trends, peak hour predictions, venue comparison
   - `[ ]` Social Feed: Ad-free experience, priority post visibility
   - `[ ]` Jarvis AI: Extended conversation depth, post-session analysis
   - `[ ]` Bankroll Manager: Advanced analytics, leak detection, PDF exports
   - `[ ]` Hand History: Unlimited hand storage, AI analysis
   - `[ ]` Video Library: Premium content, early access
   - `[ ]` Personal Assistant: Full sandbox features
   - `[ ]` Trivia: Tournament entry, extended daily challenges
   - `[ ]` Messenger: Read receipts, message reactions, voice messages
   - `[ ]` Profile: Premium badges, custom themes, enhanced visibility
   - `[ ]` Geeves: Priority support, extended AI coaching

3. `[ ]` **Deliverable**: Feature gate matrix document with FREE vs VIP breakdown
4. `[ ]` **Implementation**: Wire `useVIPStatus()` hook to all gated features

**RISK LEVEL**: LOW — adding gates doesn't break existing functionality

---

### 2.3 — Club Commander Stripe Subscription Integration `[~]`

> **User Decision**: Commander is ALREADY BUILT as a monthly subscription for clubs, casinos, charity games, and home games. Stripe integration needs to be FINISHED and fully functional.

**What needs to be done**:

1. `[ ]` **Audit Current Stripe Integration**
   - Verify `stripe` package wiring in `/api/store/` and `/api/commander/`
   - Check webhook endpoint (`/api/store/webhook.js`) handles subscription events
   - Verify customer portal for self-service cancellation

2. `[ ]` **Subscription Lifecycle**:
   - `[ ]` Trial period handling (if applicable)
   - `[ ]` Monthly recurring charge automation
   - `[ ]` Failed payment retry logic
   - `[ ]` Grace period before access revocation
   - `[ ]` Cancellation flow → downgrade to free tier
   - `[ ]` Upgrade/downgrade between Commander tiers

3. `[ ]` **Stripe Events to Handle**:
   - `invoice.payment_succeeded` → extend access
   - `invoice.payment_failed` → notify + retry
   - `customer.subscription.deleted` → revoke Commander access
   - `customer.subscription.updated` → tier change

4. `[ ]` **Testing**:
   - Full end-to-end test with Stripe test keys
   - Simulate: subscribe → use for month → auto-renew → cancel

**RISK LEVEL**: MEDIUM — payment processing must be bulletproof

---

### 2.4 — Sponsored Tournament Series `[—]`

> **User Decision**: Deferred to POST-LAUNCH.

---

## TIER 3: Intelligence & AI

### 3.1 — AI Hand History Reader (Camera/Screenshot) `[ ]`

> **User Decision**: Needs to be FULLY BUILT and integrated.

**What to build**:

1. `[ ]` **Image Capture Interface**
   - Camera button in Hand History page
   - Accept: photo from camera, screenshot upload, paste from clipboard
   - Crop/rotate tool for alignment

2. `[ ]` **AI Vision Pipeline**
   - Send image to OpenAI Vision API (GPT-4o)
   - Prompt engineering to extract:
     - Table type (cash/tournament), stakes, number of players
     - Player positions and stack sizes
     - Hole cards (if visible)
     - Community cards (board)
     - Action sequence (preflop/flop/turn/river)
     - Pot size at each street
   - Confidence scoring on extracted data

3. `[ ]` **Hand Import Flow**
   - Parsed data → review/edit modal → confirm → save to hand history
   - Auto-link to venue (if detectable from screenshot context)
   - Option to "Analyze with Jarvis" immediately

4. `[ ]` **Supported Formats**:
   - `[ ]` Physical table photos
   - `[ ]` PokerStars screenshots
   - `[ ]` GGPoker screenshots
   - `[ ]` WPT Global screenshots
   - `[ ]` ACR screenshots
   - `[ ]` Generic online poker table

5. `[ ]` **API Endpoint**: `/api/hands/parse-image.js`

**RISK LEVEL**: LOW — new feature, doesn't touch existing code

---

### 3.2 — Live Game ETA Predictor (Enhance Existing) `[~]`

> **User Decision**: Partially exists in Poker Near Me for saved venues. Needs significant improvement.

**What to improve**:

1. `[ ]` **Historical Pattern Analysis**
   - Track game open/close times over weeks/months
   - Build per-venue, per-game-type activity profiles
   - "This $1/3 NLH game typically opens at 4:30 PM on Fridays"

2. `[ ]` **Predictive Notifications**
   - "Your saved $2/5 game at Bellagio usually opens in ~45 min"
   - "Unusual: $1/3 running at [venue] on a Tuesday morning"
   - Wire to push notifications (Tier 1.4)

3. `[ ]` **"Best Time to Go" Widget**
   - Heatmap on venue detail page showing historical activity by hour/day
   - "Peak hours: Fri 7-11 PM" badge
   - "Quiet hours: Mon-Wed before 4 PM"

4. `[ ]` **Waitlist Intelligence**
   - If scraping waitlist data: "Average wait: 23 min for $1/3"
   - "Tip: Arrive by 6 PM to avoid the rush"

**RISK LEVEL**: LOW — enhances existing Poker Near Me features

---

### 3.3 — Player Tendency Profiling `[ ]`

**What to build**:

1. `[ ]` Player notes enhancement with structured tags
2. `[ ]` VPIP/3-bet/aggression frequency tracking (manual input)
3. `[ ]` "Scouting report" auto-generation from accumulated notes
4. `[ ]` Privacy-first: all data stays private to the user

**RISK LEVEL**: LOW — new feature, no existing code impact

---

### 3.4 — Jarvis Post-Session Debrief `[!]`

> **User Decision**: Build AFTER Club Arena is fully functional.
> **Blocked by**: Club Arena completion

**What to build (when unblocked)**:

1. `[ ]` Auto-trigger after bankroll session is logged
2. `[ ]` Jarvis analyzes: win/loss, session length, game type performance
3. `[ ]` Identifies leaks: "Lost 3 BI at $2/5, +2 BI at $1/3 — consider..."
4. `[ ]` Generates session "report card" with letter grade
5. `[ ]` Connects to GTO trainer: "Practice these 3 spots"
6. `[ ]` Stores debrief in session history for trend tracking

**RISK LEVEL**: LOW — new feature, plugs into existing Jarvis + Bankroll Manager

---

## TIER 4: Social & Viral Growth (ALL NEED FULL BUILD)

> **User Decision**: ALL of Tier 4 needs to be fully built and integrated.

### 4.1 — Shareable Hand Cards (OG Image Generation) `[ ]`

**What to build**:
1. `[ ]` OG image template using `@vercel/og` (already installed)
2. `[ ]` Beautiful card design: hand, board, result, player avatar
3. `[ ]` `/api/og/hand/[handId].js` → generates image on-demand
4. `[ ]` One-tap share to Twitter, Facebook, Instagram Stories
5. `[ ]` Each shared card links back to smarter.poker (free marketing)
6. `[ ]` Tournament result cards: "I finished 3rd in the $500 Main Event!"

**RISK LEVEL**: LOW — new API route + UI buttons

---

### 4.2 — Referral & Crew System `[ ]`

**What to build**:
1. `[ ]` Referral code generation per user
2. `[ ]` "Invite your crew" share flow (SMS, link, QR code)
3. `[ ]` Diamond reward: both referrer and referee get bonus
4. `[ ]` Referral tracking dashboard in profile
5. `[ ]` Crew creation: group of friends with shared leaderboard
6. `[ ]` Crew stats: combined win rate, total sessions, etc.
7. `[ ]` Database: `referrals` table, `crews` table, `crew_members` table

**RISK LEVEL**: LOW — new feature, new tables

---

### 4.3 — Live Session Broadcasting `[x]`

**What to build** (LiveKit is already installed):
1. `[x]` "I'm at the table" status toggle
2. `[x]` Friends can see who's currently playing and where
3. `[x]` Optional live stream from the rail (LiveKit video)
4. `[x]` Live chat for spectators ("sweat my session")
5. `[x]` Session stats overlay: current profit, hours played
6. `[x]` Privacy controls: friends-only, public, or invisible

**RISK LEVEL**: MEDIUM — LiveKit integration complexity, needs thorough testing

---

### 4.4 — Venue Reviews & Ratings `[x]`

**What to build**:
1. `[x]` 5-star rating system per venue
2. `[x]` Rating categories: Dealers, Atmosphere, Food/Drinks, Waitlist Speed, Game Selection
3. `[x]` Written reviews with character limit
4. `[x]` Upvote/downvote on reviews
5. `[x]` "Verified Player" badge (if user has bankroll session at that venue)
6. `[ ]` Review moderation in Horses admin panel
7. `[x]` Database: `venue_reviews` table with foreign keys to venues + profiles
8. `[x]` Aggregate ratings displayed on venue cards in Poker Near Me

**RISK LEVEL**: LOW — new feature, new table, plugs into existing venue pages

---

## TIER 5: Infrastructure & Tech Debt (SAFE ITEMS ONLY)

> **User Decision**: Implement ONLY if safe. If HIGH RISK for damaging existing code or pages, DO NOT BUILD.

### 5.1 — TypeScript Migration `[—]`

> **RISK ASSESSMENT: 🔴 HIGH RISK** — Migrating 64 pages + 46 API directories + 27 src modules from JS to TS is extremely high risk for a production platform. Type errors could cascade across the entire codebase. **SKIPPED per user's safety directive.**

**Alternative (safe)**: New files only written in TypeScript going forward. No retroactive migration.

---

### 5.2 — Component Library Extraction `[—]`

> **RISK ASSESSMENT: 🔴 HIGH RISK** — Extracting components into a separate package changes every import path across the entire codebase. One wrong path = broken pages in production. **SKIPPED per user's safety directive.**

**Alternative (safe)**: Create a Storybook catalog pointing at existing components in-place. No file moves.

---

### 5.3 — Database Query Optimization `[ ]`

> **RISK ASSESSMENT: 🟢 LOW RISK** — Read-only analysis + adding indexes. Does not change application code.

**What to do**:
1. `[ ]` Use Supabase MCP to audit slow queries
2. `[ ]` Identify missing indexes on high-traffic tables
3. `[ ]` Add indexes via safe SQL migrations
4. `[ ]` Audit N+1 query patterns in API routes
5. `[ ]` Implement query result caching where appropriate

**SAFE TO BUILD**: ✅ Yes

---

### 5.4 — Cron Job Consolidation `[ ]`

> **RISK ASSESSMENT: 🟡 MEDIUM RISK** — Consolidating crons requires careful testing. Individual job changes are safe; mass restructuring is not.

**Safe approach**:
1. `[ ]` Audit which crons are actually firing successfully (read-only check)
2. `[ ]` Identify dead/broken crons and disable them
3. `[ ]` Add health monitoring dashboard (read-only, new page)
4. `[—]` ~~Mass consolidation~~ — TOO RISKY, skip

**SAFE TO BUILD**: ✅ Audit + monitoring only. No mass restructuring.

---

### 5.5 — Monorepo Migration `[—]`

> **RISK ASSESSMENT: 🔴 HIGH RISK** — Restructuring the entire repository breaks every file path, import, deployment config, and CI/CD pipeline. **SKIPPED per user's safety directive.**

---

## TIER 6: Moonshots (POST-LAUNCH)

> **User Decision**: ALL deferred to post-launch.

### 6.1 — Voice AI Poker Coach `[—]` (Post-Launch)
### 6.2 — AR Table Overlay `[—]` (Post-Launch)
### 6.3 — Blockchain Hand Verification `[—]` (Post-Launch)
### 6.4 — Native Mobile Apps `[—]` (Post-Launch)

---

## Priority Execution Order

| Order | Item | Tier | Risk | Est. Effort |
|-------|------|------|------|-------------|
| 1 | E2E Test Suite (Playwright) | 1.1 | Low | 1-2 days |
| 2 | Bundle Size Splitting | 1.2 | Low | 1-2 days |
| 3 | Sentry Monitoring Pipeline | 1.3 | Low | 1 day |
| 4 | PWA Push Notifications (FULL) | 1.4 | Medium | 3-5 days |
| 5 | VIP Paywall Audit | 2.2 | Low | 2-3 days |
| 6 | Commander Stripe Subscription | 2.3 | Medium | 2-3 days |
| 7 | Database Query Optimization | 5.3 | Low | 1-2 days |
| 8 | Cron Job Audit | 5.4 | Low | 1 day |
| 9 | Shareable Hand Cards | 4.1 | Low | 2-3 days |
| 10 | Venue Reviews & Ratings | 4.4 | Low | 2-3 days |
| 11 | Referral & Crew System | 4.2 | Low | 3-5 days |
| 12 | AI Hand History Reader | 3.1 | Low | 3-5 days |
| 13 | Live Game ETA Enhancement | 3.2 | Low | 2-3 days |
| 14 | Player Tendency Profiling | 3.3 | Low | 2-3 days |
| 15 | Live Session Broadcasting | 4.3 | Medium | 3-5 days |
| 16 | Jarvis Post-Session Debrief | 3.4 | Low | 2-3 days (after Club Arena) |

---

## Decisions Log

| Date | Decision | Context |
|------|----------|---------|
| 2026-03-29 | Skip affiliate engine (2.1) | Not doing affiliate at this time |
| 2026-03-29 | Skip sponsored tournaments (2.4) | Deferred to post-launch |
| 2026-03-29 | Skip TypeScript migration (5.1) | High risk — new files only TS going forward |
| 2026-03-29 | Skip component extraction (5.2) | High risk — too many import path changes |
| 2026-03-29 | Skip monorepo migration (5.5) | High risk — breaks entire project structure |
| 2026-03-29 | All of Tier 6 post-launch | Voice AI, AR, Blockchain, Native Apps |
| 2026-03-29 | Jarvis debrief blocked by Club Arena | Build 3.4 after Club Arena is functional |
| 2026-03-29 | No auto-fixing of code via automation | Only monitoring/alerting is automated |

---

## How to Use This Document

1. **Agent**: Read this skill before starting any new feature work to check prioritization
2. **Agent**: Update status markers (`[ ]` → `[/]` → `[x]`) as work progresses
3. **Agent**: Check "Decisions Log" before proposing anything that was already decided against
4. **User**: Reference by saying "check the roadmap" or "what's next on the roadmap"
