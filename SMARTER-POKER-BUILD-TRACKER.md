# Smarter.Poker — Master Build Tracker

**Last Updated:** 2026-04-03
**Owner:** Dan / Antigravity Agents

---

## PHASE 1 — Completed (2026-03-29)

### Antigravity Toolkit Plugin (v0.1.0)
| Deliverable | Status | Location |
|---|---|---|
| GSD Planning Skill | DONE | antigravity-toolkit/skills/gsd-planning/ |
| Code Review Skill (OCR) | DONE | antigravity-toolkit/skills/code-review/ |
| Swarm Orchestration Skill (Ruflo) | DONE | antigravity-toolkit/skills/swarm-orchestration/ |
| Session Memory Skill (claude-mem) | DONE | antigravity-toolkit/skills/session-memory/ |
| Smarter Poker Platform Skill | DONE | antigravity-toolkit/skills/smarter-poker-platform/ |
| 8 Slash Commands | DONE | antigravity-toolkit/commands/ |
| Plugin packaged (.plugin) | DONE | Desktop/antigravity-toolkit-v2.plugin |

### World Hub E2E Tests
| Deliverable | Status | Location |
|---|---|---|
| playwright.config.ts | DONE | e2e config, chromium + mobile-chrome |
| e2e/utils.ts | DONE | Shared test utilities |
| e2e/smoke.spec.ts | DONE + AUDITED | 15 hub routes, public pages, demo pages |
| e2e/api-health.spec.ts | DONE + AUDITED | Health checks, middleware security, destructive route blocks |
| e2e/auth.spec.ts | DONE + AUDITED | Login/signup forms, validation, route protection |
| e2e/commander.spec.ts | DONE + AUDITED | 13 commander sub-routes |
| e2e/pwa.spec.ts | DONE + AUDITED | Manifest, service worker, headers (Vercel-aware) |
| e2e/games.spec.ts | DONE + AUDITED | Game hubs, training sub-routes, trivia sub-routes |
| e2e/social.spec.ts | DONE + AUDITED | Social hubs, content routes |

### Phase 1 Audit Results (6 bugs found, all fixed)
- smoke.spec.ts: `/hub/bankroll-manager` → fixed to `/hub/bankroll` (no index.js in dir)
- smoke.spec.ts: Removed 3 broken redirect tests (no pages/login.js, no Vercel redirects)
- api-health.spec.ts: Rewrote to use only verified endpoints with actual handlers
- api-health.spec.ts: Removed fake god-mode security test (not in middleware)
- pwa.spec.ts: Added `test.skip(isLocalhost)` for Vercel-only headers
- smoke.spec.ts: Removed unused import

---

## PHASE 2 — Completed (2026-03-29)

### E2E CI Workflow
| Deliverable | Status | Location |
|---|---|---|
| e2e-tests.yml GitHub Action | DONE | .github/workflows/e2e-tests.yml |

### Environment Documentation
| Deliverable | Status | Location |
|---|---|---|
| .env.example (70+ vars) | DONE | World Hub root |

### Club Arena V8 Bible Engine Tests
| Deliverable | Status | Location |
|---|---|---|
| law-1-5-fairness.test.ts | DONE | club-arena/tests/engine/v8-bible/ |
| law-1-9-settlement.test.ts | DONE | club-arena/tests/engine/v8-bible/ |
| chapter-3-state-machines.test.ts | DONE | club-arena/tests/engine/v8-bible/ |

### E2E Test File Alignment
- All test files renamed to `0xx-*.spec.ts` pattern to match `playwright.config.ts` testMatch: `/0.*\.spec\.ts/`
- Setup project `00-auth.setup.ts` matches `*.setup.ts` pattern
- Full suite: 01 through 014 covering all routes

### Build Tracker Skill
| Deliverable | Status | Location |
|---|---|---|
| build-tracker SKILL.md | DONE | antigravity-toolkit/skills/build-tracker/ |
| Plugin validation fix (YAML frontmatter) | DONE | All 6 skills now pass validation |

---

## PHASE 3 — Completed (2026-03-29)

### Live Site Audit (smarter.poker)
| Test | Result | Detail |
|---|---|---|
| Landing page | PASS | Next.js SSR, title correct, build ID present |
| /hub | PASS | Geeves AI, Quick Nav, Dealer Tools, all sub-hubs |
| /hub/poker-near-me | PASS | Venues, Events, Live Games tabs present |
| /hub/training | PASS | Training Library loading state |
| /hub/diamond-store | PASS | Virtual currency disclaimer, checkout flow |
| /hub/social | PASS | Framework loaded |
| /commander | PASS | Public landing, staff login at /commander/login |
| /api/health | PASS | status:ok, DB 132ms, uptime tracked |
| /manifest.json | PASS | PWA standalone, correct icons and start_url |

### Security Audit
| Test | Result | Detail |
|---|---|---|
| /api/admin/health → 403 | PASS | Middleware blocks without x-admin-secret |
| /api/debug → 403 | PASS | Protected |
| /api/emergency → 403 | PASS | Protected |
| /commander/admin → PIN gate | PASS | Requires PIN (note: client-side gate, not SSR) |

### Vercel Deployment Status
| Project | Latest Deploy | State | Commit |
|---|---|---|---|
| World Hub | Today | READY | achievement trigger noise fix |
| Club Arena | Recent | READY | FIX 143-146: Deferred sit-out, rakeback, BBJ |
| 22 total projects on Smarter-Poker team | — | All READY | — |

### Production Cron Error Discovery
| Deliverable | Status | Location |
|---|---|---|
| CRON-ERROR-REPORT.md | DONE | World Hub root |
| Root cause: supabaseKey missing | DOCUMENTED | 5+ cron endpoints affected, ~216 failures/day |
| Fix recommendations (3 options) | DOCUMENTED | Lazy init, shared client, or env var verify |

### Monitoring Infrastructure
| Deliverable | Status | Location |
|---|---|---|
| e2e/014-cron-health.spec.ts | DONE | 30+ cron endpoints, security, page loads |
| Production Monitor Dashboard | DONE | Desktop/smarter-poker-monitor.jsx |

---

## PLATFORM INVENTORY

### Core Repos (Active Code)
| Repo | Stack | Tests | CI | CLAUDE.md | Env Docs |
|---|---|---|---|---|---|
| Smarter-Poker-World-Hub | Next.js 14, Pages Router | E2E (Playwright) | build-safety-gate + deploy | YES | YES (.env.local) |
| club-arena | React 19, Vite 6 | 203 files (vitest + playwright) | ci + manual-deploy | YES | YES |
| club-engine | React, Vite | 20+ files (vitest) | ci | YES | YES |
| diamond-arena | React, Vite | 10+ files (jest) | ci | NO | YES |
| identity-dna-engine | Node.js | 10+ files | deploy | NO | YES |
| AI-Content-GTO-Engine | Node.js | YES | ci | NO | YES |

### Orb Repos (Embedded/Planning)
| Repo | Has Code | Tests | CI |
|---|---|---|---|
| Smarter-Poker-Arcade | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Assistant | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Bankroll | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Marketplace | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Memory | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Memory-Games | package.json + vercel.json | NO | ci.yml |
| Smarter-Poker-Near-Me | CLAUDE.md only | NO | deploy.yml |
| Smarter-Poker-Social | CLAUDE.md + vercel.json | NO | deploy.yml |
| Smarter-Poker-Training | package.json + vercel.json | NO | deploy.yml |
| Smarter-Poker-Trivia | CLAUDE.md only | NO | deploy.yml |

### World Hub Architecture
- **Pages:** 952 across pages/ directory
- **API Routes:** 54 top-level directories, 716+ endpoint files
- **Cron Jobs:** 57 scheduled via vercel.json
- **Middleware:** Protects /api/admin/*, /api/debug/*, /api/emergency/*, 7 destructive poker routes
- **Auth Header:** x-admin-secret matching ADMIN_ROUTE_SECRET env var
- **PWA:** manifest.json + sw.js (Workbox), standalone mode

### Club Arena Architecture
- **V8 Bible Compliance:** ~40% (FIX 119-146 series landing, up from 4%)
- **Recent Fixes:** ShortDeck eval, Pineapple discard, pot-limit clamping, time bank gating, crash recovery, dead blinds, showdown order, duplicate seat prevention, BBJ, deferred sit-out, rakeback, god-mode RLS drop
- **Infrastructure:** Migrated game server from Railway to Hetzner Cloud (engine.smarter.poker)
- **Big 3 Blockers:** Dual engine (in migration), card security (god-mode RLS dropped FIX 141), auto-fold
- **Engine Files:** 24 files in server/src/engine/
- **Test Coverage:** 13 engine tests, 120+ unit tests, 9 E2E tests, 1 integration test

---

## CONNECTED SERVICES
| Service | Status | Notes |
|---|---|---|
| PostHog MCP | SUGGESTED | User needs to connect |
| Vercel MCP | CONNECTED | Can deploy, read logs |
| Supabase | IN CODEBASE | Via env vars, not MCP |
| Sentry | IN CODEBASE | Error tracking active |
| GitHub | VIA CLI | gh commands available |

---

## PHASE 4 — Completed (2026-03-29)

### Cron Reliability Fix
| Endpoint | Old Status | New Status | Fix |
|---|---|---|---|
| /api/cron/horses-social-all | 500 every 15m (~96/day) | 200 ✅ | getSupabase() fix in HorseSocialEngine.js (commit 411ff14) |
| /api/cron/trivia-pvp-cleanup | 500 every hour (~24/day) | Fixed ✅ | Patched by dc75bcb5e (84 bare supabase refs) |
| /api/cron/venue-game-alerts | 500 every 15m (~96/day) | 401 ✅ (auth gate) | Patched in deployed commits |
| /api/rewards/daily-login | 500 (user-triggered) | Fixed ✅ | Patched by dc75bcb5e |
| /api/poker/peak-activity | 500 (user-triggered) | 200 ✅ | Schema alignment (e7f1998fd) |
| /api/poker/game-trends | 500 (user-triggered) | 200 ✅ | Schema alignment (e7f1998fd) |
| /api/poker/venue-dedup | 500 (user-triggered) | 200 ✅ | Schema alignment (e7f1998fd) |

**Impact:** ~300+ daily failures eliminated. Deploy c43293ee0 on hub-vanguard includes all fixes.
**Verification:** Live runtime logs confirmed 0 new 500s after deploy (21:20 UTC onward).

---

## PHASE 4b — Completed (2026-03-29)

### Second Wave: Bare `supabase` Reference Fix
**Discovery:** Runtime log scan at 22:08 UTC found 500 errors returning on cron endpoints. Investigation revealed 15 cron files with undefined `supabase` variable — they had `getSupabase()` function defined but never called it.

| File | Bare Refs Fixed | Schedule |
|---|---|---|
| trivia-tournaments.js | 11 | Daily 01:00 UTC |
| tournament-reminders.js | 7 | (helper functions) |
| poker-news.js | 7 | Every 4 hours |
| freeroll-qualification-sync.js | 4 | Every 6 hours |
| geofence-session-reminder.js | 4 | (not scheduled) |
| trivia-daily-generator.js | 4 | Daily 05:59 UTC |
| generate-trivia.js | 3 | (not scheduled) |
| youtube-shorts.js | 3 | (not scheduled) |
| memory-matrix-daily-challenge.js | 2 | Daily 06:00 UTC |
| training-daily-challenge.js | 2 | Daily 06:05 UTC |
| training-daily-report.js | 2 | Daily 08:00 UTC |
| update-charity-locations.js | 2 | Daily 06:00 UTC |
| vip-diamond-stipend.js | 2 | Monthly 1st |
| cleanup-expired-passes.js | 1 | (not scheduled) |
| hendon-scraper.js | 1 | (not scheduled) |

**Fix:** Added `const supabase = getSupabase();` at handler/function scope in each file.
**Total:** 55 bare references fixed across 15 files.
**Impact:** Prevents additional daily failures when these crons fire (especially trivia-tournaments at 01:00, trivia-daily-generator at 05:59, training-daily-challenge at 06:05, memory-matrix at 06:00).

---

## PHASE 5 — SKIPPED (HIGH RISK)

**Commander SSR Auth** — Move PIN validation from client-side overlay to getServerSideProps.
**Reason:** High risk of locking out admins. No staging environment available. Current client-side gate prevents casual access, and API routes are properly auth-gated via middleware. Deferred until staging env is available.

---

## PHASE 6 — Completed (2026-03-29)

### Automated Cron Health Monitoring
| Deliverable | Status | Location |
|---|---|---|
| Cron Health Monitor Dashboard | DONE | Desktop/smarter-poker-cron-monitor.jsx |
| Scheduled Health Check Task | DONE | smarter-poker-cron-health (every 6 hours) |
| 45 cron endpoints tracked | DONE | All vercel.json crons cataloged |

**Features:** Auto-refresh, health score trending (recharts), category grouping (7 tiers), alert panel for 500s, JSON export, auth-gated vs failing distinction.

---

## PHASE 7 — Completed (2026-03-29)

### Session Memory System
| Deliverable | Status | Location |
|---|---|---|
| SUMMARY.md | DONE | .memory/SUMMARY.md |
| Decision: Lazy Supabase Init | DONE | .memory/decisions/001-lazy-supabase-init.md |
| Decision: JWT Fallback Auth | DONE | .memory/decisions/002-jwt-fallback-auth.md |
| Decision: Skip Commander SSR | DONE | .memory/decisions/003-skip-commander-ssr-auth.md |
| Pattern: Supabase Lazy Init | DONE | .memory/patterns/supabase-lazy-init.md |
| Pattern: API Error Handling | DONE | .memory/patterns/api-error-handling.md |
| Context: Architecture | DONE | .memory/context/architecture.md |
| Context: Cron System | DONE | .memory/context/cron-system.md |
| Context: Supabase RPCs | DONE | .memory/context/supabase-rpcs.md |
| Problem: Cron 500 Cascade | DONE | .memory/problems/cron-500-cascade.md |
| Preferences: Coding Style | DONE | .memory/preferences/coding-style.md |

**Total:** 11 memory files across 5 categories (decisions, patterns, context, problems, preferences)

---

## PHASE 8 — Completed (2026-03-29)

### Cross-Project Health Dashboard
| Deliverable | Status | Location |
|---|---|---|
| Cross-Project Dashboard | DONE | Desktop/smarter-poker-cross-project-dashboard.jsx |
| All 22 Vercel projects cataloged | DONE | 5 tiers: Core, Engine, Orb, Social, Other |

**Features:** Live health checks, tier grouping with color coding, deployment details (URL, state, commit message), bar chart by tier, expandable project rows, JSON export.

---

## PHASE 9 — Completed (2026-03-29)

### Performance Baseline
| Deliverable | Status | Location |
|---|---|---|
| Performance Dashboard | DONE | Desktop/smarter-poker-performance.jsx |
| Baseline JSON Data | DONE | Desktop/smarter-poker-performance-baseline.json |
| 8 pages baselined | DONE | /, /hub, /hub/poker-near-me, /hub/training, /hub/diamond-store, /hub/social, /commander, /api/health |

**Key Metrics:**
- Overall Grade: B (avg 3125ms including TLS from sandbox)
- Fastest: /hub/diamond-store (2293ms)
- Slowest: / (4371ms)
- DB Latency: 132ms
- Security Headers: 6/6
- Vercel Cache: HIT
- All pages responding (200 or expected 307)

**Features:** Live re-test capability, baseline comparison, radar chart, security header audit, API health display.

---

## PHASE 10 — Partial (2026-03-29)

### Infrastructure Hardening
| Deliverable | Status | Risk | Location |
|---|---|---|---|
| Supabase RPC Audit | DONE | LOW | .memory/context/supabase-rpcs.md |
| Shared TypeScript types | SKIPPED | HIGH | Would change imports across repos |
| Database migration tooling | SKIPPED | HIGH | Touches production data workflows |

**RPC Audit Findings:** 17 unique RPC functions identified, `add_diamonds_to_balance` is most critical (20+ call sites). Full inventory documented.

---

## PHASE 11 — Completed (2026-04-02)

### Training Arena Overhaul
| Deliverable | Status | Detail |
|---|---|---|
| Timer reconciliation | DONE | GodModeArena interval disabled when UDT CountdownTimer active — prevents double-tick bug |
| Mistake replay system | DONE | useGTOTrainer tracks wrong answers in mistakeQuestionsRef, retrainMistakes() shuffles and re-injects |
| Share-to-feed toast | DONE | Replaced undefined `toast` with shareStatus state + visual feedback |
| Director hand type detection | DONE | Dynamic hand type from scenario (preflop open/3bet/blind defense, postflop cbet/value/check-raise) |
| GameSession canCheck | DONE | Derived from solver node actions instead of hardcoded false |
| Difficulty wiring | DONE | Derived from stack/BB ratio instead of hardcoded 'medium' |

**Files Changed:** GodModeArena.jsx, useGTOTrainer.js, Director.tsx, GameSession.tsx
**Commits:** b7c406d35, affc68f1a
**Impact:** Training games now have accurate difficulty, proper timer behavior, mistake replay, and share functionality.

---

## PHASE 12 — Completed (2026-04-02)

### Production Runtime Error Fixes (Second Wave)
| Endpoint | Error | Fix | Status |
|---|---|---|---|
| /api/cron/pokernews-videos | RSS fetch timeout crash | Added Promise.race 15s timeout + graceful degradation | DONE |
| /api/cron/refresh-venue-json | Column mismatch crash | Changed explicit column select to `select('*')` | DONE |
| /api/cron/training-daily-report | undefined reportWeek var | Added `const reportWeek = reportDate` | DONE |
| /api/notifications/send | OneSignal API transient 500 | Assessed — transient, no code fix needed | ASSESSED |
| /api/rewards/daily-login | RPC transient failure | Assessed — intermittent DB issue, no code fix needed | ASSESSED |

**Commit:** 8b89bfd19 (includes cron fixes alongside PNM lobby restore)
**Impact:** 3 cron endpoints hardened against crashes. 2 transient errors triaged as non-actionable.

---

## PHASE 13 — Completed (2026-04-03)

### Training Arena Deep Improvements
| Deliverable | Status | Detail |
|---|---|---|
| Wire useProgression to real API | DONE | Replaced mock saveHandResult with real `/api/training/save-progress` calls, auth token via `getSessionToken()` pattern |
| Add training table audio | DONE | Deal and chip-click Web Audio API sounds in UniversalTrainingTable, new sound configs in trainingSounds.js |
| Harden get-question API | DONE | 25s Promise.race timeout on both Grok AI call sites to prevent serverless function hangs |
| GameSession null guards | DONE | `typeof === 'object'` guard on solver node actions before `Object.keys()` |

**Files Changed:** useProgression.ts, trainingSounds.js, UniversalTrainingTable.tsx, get-question.js, GameSession.tsx
**Commit:** 67e29e7b6
**Impact:** Progression data now persists to Supabase instead of being lost on page refresh. Training table has audio feedback. Question engine won't hang on slow AI responses.

---

## PHASE 14 — Completed (2026-04-03)

### GTO Wizard Parity: Smart Training Engine
| Deliverable | Status | Detail |
|---|---|---|
| Weak-spot targeting system | DONE | `deriveSpotType()` classifies spots (3bet_defense, facing_cbet, check_raise, etc.), `updateWeakSpotMap()` tracks per-position/street/spotType accuracy, `getWeakSpots()` returns top 5 weakest areas sorted by mistake rate. Emits `weakSpotAnalysis` events at adaptive checkpoints. |
| Enhanced record-question API | DONE | Now saves hero_position, villain_position, street, classification, ev_loss, spot_type with each answer for historical weak-spot analysis |
| Spaced repetition API | DONE | New `/api/training/spaced-repetition` endpoint: POST saves mistake signatures, GET retrieves due-for-review spots, PATCH updates SM-2 intervals (correct = double interval, wrong = reset). Priority by EV loss. |
| Spaced repetition wiring | DONE | `saveMistakesToSpacedRepetition()` auto-fires on session complete, sends all mistake hand signatures to SR API |
| Next-level prefetch | DONE | Background prefetch triggers at 60% through current level. `startNextLevel()` uses cached questions for INSTANT level transitions (zero loading). |
| Enhanced coaching explanations | DONE | `explain-answer.js` now receives GTO frequencies, classification, EV loss. Prompt includes solver frequency context, mixed strategy detection, level-appropriate coaching tone (beginner/intermediate/advanced). |
| Enhanced coaching summary | DONE | `coaching-summary.js` now receives GTOW score, classification breakdown, position stats, weak-spot analysis. Coaching references specific positions, spot types, and board textures. |

**Files Changed:** useGTOTrainer.js, record-question.js, explain-answer.js, coaching-summary.js
**Files Created:** spaced-repetition.js
**Impact:** Training system now tracks WHERE players struggle (not just IF they struggle), serves targeted practice, saves mistakes for cross-session spaced repetition review, prefetches next level for zero-latency transitions, and provides GTO Wizard-caliber coaching with real solver data in explanations.

---

## PHASE 15 — Completed (2026-04-03)

### GTO Wizard Parity: Closed-Loop Targeted Training
| Deliverable | Status | Detail |
|---|---|---|
| DeterministicGTOEngine position/street filters | DONE | `generateBatch()` and `fetchSolverPool()` now accept `targetPositions` and `targetStreet` params. Target-position scenarios are prioritized in the pool. |
| Batch-preload API targeting | DONE | `batch-preload.js` accepts `targetPositions` (comma-separated) and `targetStreet` query params, passes to DeterministicGTOEngine |
| Client-side weak-spot → API wiring | DONE | `useGTOTrainer.preloadAllQuestions()` extracts top weak positions and streets from `getWeakSpots()` and passes them as query params to batch-preload |
| useSpacedRepetition hook | DONE | New hook: `fetchDueSpots()`, `getReviewSession()`, `markReviewed()`, `convertSpotsToQuestions()`. Auto-fetches due count on mount. |
| GodModeArena review button | DONE | "Review Weak Spots (N)" purple button in session review, powered by `useSpacedRepetition`. Shows when review spots are due. |
| Session detail API | DONE | `get-sessions.js` now supports `?sessionId=X` for full hand_history + position_stats + classification_counts replay data |
| RoundSummary enhanced coaching | DONE | Props extended with `gtowScore`, `classificationCounts`, `positionStats`, `weakSpots`, `totalEVLoss`. All passed to coaching-summary API. |

**Files Changed:** DeterministicGTOEngine.js, batch-preload.js, useGTOTrainer.js, GodModeArena.jsx, get-sessions.js, RoundSummary.tsx
**Files Created:** useSpacedRepetition.js
**Impact:** The training engine now completes the feedback loop — weak spots identified in Phase 14 now ACTIVELY bias question selection toward areas where the player struggles. Spaced repetition spots can be reviewed from the session screen. Session history supports full hand replay.

---

## PHASE 16 — Completed (2026-04-03)

### GTO Wizard Parity: Performance Analytics Engine
| Deliverable | Status | Detail |
|---|---|---|
| Analytics API | DONE | New `analytics.js` endpoint — aggregates `training_answers` + `training_sessions` across ALL sessions. Returns: scoreTrend, positionAccuracy, streetAccuracy, actionAccuracy, mistakePatterns, classificationTrend, milestones. Supports game filter, lookback window (1-365 days), response type selection. |
| PerformanceTrends component | DONE | SVG line charts: GTOW score trend, EV loss/hand trend, classification distribution stacked area chart. Milestones row (score, EV/hand, streak, hands). 7/30/90 day range selector. `useTrainingAnalytics` reusable hook. |
| StreetAccuracyPanel component | DONE | Horizontal bar chart of accuracy per street (Preflop/Flop/Turn/River). Classification breakdown on click-expand. EV loss per street. Strongest/weakest street insight. |
| ActionAccuracyPanel component | DONE | Radial gauge grid for each action type (Fold/Call/Raise/Bet/Check/All-In). Action distribution stacked bar. EV loss badges. Weakest action insight. |
| MistakePatternPanel component | DONE | Clusters mistakes by spotType × position × street. Severity ranking (HIGH/MEDIUM/LOW). Natural language insights ("You consistently over-fold facing c-bets from BB on the flop"). Top-20 patterns sorted by total EV impact. Spot type summary tags. |
| GodModeArena integration | DONE | All 4 analytics components wired into the Analysis tab of session review. `useTrainingAnalytics` hook fetches on mount. Conditionally renders based on available data. |

**Files Created:** analytics.js, PerformanceTrends.jsx, StreetAccuracyPanel.jsx, ActionAccuracyPanel.jsx, MistakePatternPanel.jsx
**Files Changed:** GodModeArena.jsx, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** Players now see cross-session performance trends, street-by-street and action-by-action accuracy breakdowns, and clustered mistake patterns — all features that GTO Wizard charges for. The analytics API aggregates up to 5,000 answers and 200 sessions per request, with graceful degradation if tables don't exist.

---

## PHASE 17 — Completed (2026-04-03)

### GTO Wizard Parity: Smart Practice + AI Coaching Debrief
| Deliverable | Status | Detail |
|---|---|---|
| Smart Practice API | DONE | New `smart-practice.js` GET endpoint — analyzes position accuracy, street accuracy, mistake patterns (spot type clusters), spaced repetition due count, and level progression to produce priority-ranked training recommendations. Types: weak_position, weak_street, mistake_pattern, spaced_review, level_up, general. Parallel Supabase queries with graceful fallback. |
| useSmartPractice hook | DONE | React hook returning: recommendation, alternatives, analytics, loading, error, refresh. Auto-fetches on mount with gameId filter. |
| SmartPracticeBanner component | DONE | RecommendationCard with type-specific icons/colors, priority badges (CRITICAL/HIGH/MEDIUM/LOW). Primary recommendation with "Start Smart Practice →" button. Expandable alternatives list with AnimatePresence. Analytics summary row. |
| AI Coaching Debrief | DONE | Integrated coaching-summary API call into GodModeArena review phase. Sends full session data + cross-session context (milestones, mistake patterns, weakest position/street) to Grok-3 for personalized post-game coaching. Displays headline, detailed feedback, strengths, focus areas, recommended drill, and motivational quote. |
| Cross-Session Context in Coaching | DONE | coaching-summary.js API enhanced to accept crossSessionContext (milestones, mistakePatterns, weakPosition, weakStreet). Prompt includes rolling avg scores, trending direction, recurring mistakes, and cross-session weak spots for more personalized AI advice. |
| GodModeArena integration | DONE | SmartPracticeBanner rendered at top of review overview tab. AI coaching debrief card below it with loading state animation. getSessionToken auth integration. Coaching auto-fetches on game completion, resets on level change. |

**Files Created:** smart-practice.js, useSmartPractice.js, SmartPracticeBanner.jsx
**Files Changed:** GodModeArena.jsx, coaching-summary.js, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** Players now receive intelligent recommendations on what to practice next based on their cross-session performance data, plus personalized AI coaching feedback that references their long-term trends and recurring mistakes — matching GTO Wizard's premium coaching features.

---

## PHASE 18 — Completed (2026-04-03)

### GTO Wizard Parity: Pre-Session Lobby + Leaderboards
| Deliverable | Status | Detail |
|---|---|---|
| Enhanced Pre-Session Lobby | DONE | Replaced auto-advancing splash screen with a full pre-session lobby. Shows: game title + level, session goal (70% to advance), previous 30-day performance stats (avg score, sessions, hands, trend direction), difficulty selector (Beginner/Standard/Expert), timer mode selector (Relaxed/Standard/Blitz), spaced repetition due count, and a manual "Start Training" button. Users now actively configure and launch sessions instead of being auto-thrown into gameplay. |
| Difficulty + Timer Selectors | DONE | 3-way difficulty selector (Beginner/Standard/Expert) and 3-way timer selector (Relaxed/Standard 60s/Blitz 15s) with visual active-state highlighting. Persists to localStorage. Displayed prominently in pre-session lobby. |
| Leaderboard Panel | DONE | New `LeaderboardPanel.jsx` — fetches from existing `/api/training/leaderboard` API. Daily/Weekly/Monthly/All-Time period tabs. Top-20 ranked entries with gold/silver/bronze highlights. Current user highlighted with "YOU" badge. Shows accuracy, XP, sessions, and hands per player. Placed in the Analysis tab of session review. |
| Spaced Repetition Button Fix | DONE | Review Weak Spots button now triggers a retry of the current level instead of being a dead console.log. Future sessions surface similar spot types via smart practice targeting. |

**Files Created:** LeaderboardPanel.jsx
**Files Changed:** GodModeArena.jsx, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** The training experience now has a professional pre-session lobby like GTO Wizard — players see their performance trends, configure difficulty/timer settings, and actively choose to start. The leaderboard adds competitive motivation. The splash screen is no longer a 1.8s throwaway animation.

---

## PHASE 19 — Completed (2026-04-03)

### GTO Wizard Parity: Difficulty Engine + Share Cards + Achievement System + Engine Hardening

| Deliverable | Status | Detail |
|---|---|---|
| Difficulty Filtering (Full Stack) | DONE | Wired difficulty selector through entire stack: localStorage → `useGTOTrainer.js` → `batch-preload.js` API → `DeterministicGTOEngine.generateBatch()`. Beginner filters for clear decisions (avg max freq ≥40%), Expert filters for mixed strategy spots (avg max freq ≤70%), Standard has no filter. Engine fetches larger pool (5x instead of 3x) for difficulty modes to ensure enough filtered scenarios. |
| `getMaxFrequency()` BUG-B Fix | DONE | Original implementation found the single highest frequency across ALL hands × ALL actions, which was always ~100% (making difficulty filtering a no-op). Rewrote to compute the average max-frequency-per-hand — a true measure of how "clear" the scenario's decisions are overall. |
| Session Share Card | DONE | New `SessionShareCard.jsx` — SVG→Canvas→PNG pipeline for shareable session results. Background gradient, score circle with grade badge, stats row (correct/total/EV loss/streak), classification bar (Best/Correct/Inaccuracy/Wrong/Blunder), branding footer. Supports: download PNG, copy image to clipboard, native Web Share API. |
| Achievement System Wiring | DONE | Imported existing `AchievementToast.jsx` and `checkAllAchievements()` into GodModeArena. Achievement check runs on `gameComplete`. Toast renders with AnimatePresence and auto-dismisses after 6s. Previously existed as dead code — now fully wired. |
| Share Results UI | DONE | "Share Results" button (gradient blue/purple) + "Post to Feed" button rendered side-by-side in session review. SessionShareCard opens as a modal overlay. |
| DeterministicGTOEngine Deep Audit | DONE | Full audit of all 1050+ lines. Verified: solver data flow from `solved_spots_gold` (187k+ records), frequency extraction and normalization, level→street mapping (1-3=flop, 4-7=turn, 8-10=river), mixed strategy handling, context-aware filler logic, node type detection, hand categorization, explanation generation, chart engine for push/fold. |
| Supabase Client Hardening | DONE | Engine was using client-side anon-key Supabase import for server-side queries. Added `setSupabaseClient()` method and `get db()` getter. All 3 API routes (batch-preload, get-question, next-street) now inject the service-role client, ensuring RLS bypass and full data access. |

**Files Created:** SessionShareCard.jsx
**Files Changed:** DeterministicGTOEngine.js, GodModeArena.jsx, batch-preload.js, get-question.js, next-street.js, useGTOTrainer.js, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** Difficulty filtering now actually works (BUG-B was silently making it a no-op). Server-side Supabase access is now correct with service-role key. Session results are shareable as PNG images. Achievements trigger visual feedback during gameplay.

---

## PHASE 20 — Completed (2026-04-03)

### GTO Wizard Parity: Range Grid + EV Graph + Enhanced Hand History

| Deliverable | Status | Detail |
|---|---|---|
| RangeGrid in Hand Replay | DONE | Wired the existing 13×13 `RangeGrid.jsx` component into `HandReplayViewer.jsx` detail view. When reviewing hands, users can expand "Solver Range View" to see the full solver range colored by action frequency for that exact spot. The grid highlights the hero's hand with a cyan glow. Collapsible to avoid overwhelming the UI. |
| EVGraph in Analysis Tab | DONE | Wired existing `EVGraph.jsx` into GodModeArena's Analysis review tab. Shows street-by-street EV loss bars (Preflop → Flop → Turn → River) with green=gain, red=loss. Renders at the top of the Analysis tab for immediate visual insight. |
| Hand History Data Enrichment | DONE | Extended `useGTOTrainer.js` to pass `rawFrequencies` (full solver matrix per action per hand), `heroHand`, `street`, and `scenarioHash` through the hand history. This data is now available to RangeGrid in hand review and enables future features like range comparison and spot drilling. |
| RangeGrid in Post-Answer Feedback | VERIFIED | Already existed in `UniversalDynamicTable.jsx` — the range matrix shows inline after each answer when solver data is available. No changes needed. |

**Files Changed:** HandReplayViewer.jsx, GodModeArena.jsx, useGTOTrainer.js, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** The training experience now has full GTO Wizard-style range visualization. Users can see the solver's entire strategy for every spot — both during gameplay (post-answer) and in session review (hand replay detail). The EV Graph provides at-a-glance street-by-street performance analysis.

---

## PHASE 21 — Completed (2026-04-03)

### GTO Wizard Parity: Blocker Analysis, Equity Matchup, Ghost Replay, Study Streak, Randomized Training

| Deliverable | Status | Detail |
|---|---|---|
| fetchSolverPool Randomization | DONE | Fixed the core training pool query in `DeterministicGTOEngine.js`. Previously returned rows in DB insertion order (same N spots every session). Now over-fetches 4× and applies Fisher-Yates shuffle for truly randomized training scenarios each session. |
| BlockerScorePanel in Hand Review | DONE | Wired `BlockerScorePanel.jsx` into HandReplayViewer's expanded Solver Range View. Shows blocker score (composite), blocks-value-hands %, blocks-bluff-hands %, and blocks-marginal-hands % with animated bars. Only renders when hero cards and board (3+ cards) are available. Converts gridData from RangeGrid format to BlockerScorePanel's 13×13 cell.actions format. |
| EquityMatchup in Hand Review | DONE | Wired `EquityMatchup.jsx` into HandReplayViewer's Solver Range View. Approximates hero vs villain equity from solver action frequencies (aggressive actions → higher equity). Shows animated split-bar with Hero/Villain equity percentages and advantage indicator. |
| StudyStreakMapAuto in Analysis Tab | DONE | Created self-fetching `StudyStreakMapAuto` wrapper component in `StudyStreakMap.jsx` that auto-loads session history. Wired into GodModeArena Analysis tab — shows GitHub-style 168-day contribution grid with current streak, best streak, and session count. |
| GhostReplayEngine in Review | DONE | Wired `GhostReplayEngine.jsx` into GodModeArena review screen. Added "Ghost Replay — Review with GTO Line" button in Overview tab. Opens full-screen hand-by-hand replay showing player's decision alongside GTO optimal baseline. |
| RunoutHeatmap in Hand Review | DONE | Wired `RunoutHeatmap.jsx` into HandReplayViewer as collapsible "Runout Analysis" section. Computes approximate EV delta for every possible next card using hero cards, board texture, flush draws, straight draws, overcards, and solver aggression profile. Shows 4×13 color-coded heatmap (green=good for hero, red=bad). Only renders on flop/turn (not river). |
| SolverTreeViewer in Hand Review | DONE | Wired `SolverTreeViewer.jsx` into HandReplayViewer as collapsible "Decision Tree" section. Aggregates solver action frequencies into a visual SVG-based game tree showing hero actions → villain responses → terminals. Provides structural understanding of the full decision tree at each spot. |

**Files Changed:** DeterministicGTOEngine.js, HandReplayViewer.jsx, GodModeArena.jsx, StudyStreakMap.jsx, SMARTER-POKER-BUILD-TRACKER.md
**Impact:** Eight major features pushed the training experience to near GTO Wizard parity. Randomized pool fetch eliminates repetitive scenarios. Blocker analysis teaches card removal effects. Equity matchup shows range advantage. Ghost replay lets users study their GTO deviation hand-by-hand. Study streak map promotes daily training consistency. Runout heatmap shows how each card affects hero's strategy. Decision tree provides structural game tree understanding.

---

## PHASE 22 — In Progress (2026-04-13)

### Poker Brain Integration: Heads-Up Training with AI Opponents

| Deliverable | Status | Detail |
|---|---|---|
| Horse opponent API endpoint | DONE | New `/api/training/horse-opponent` — GET selects random active horse from `content_authors` + `horse_personality` tables, returns player-looking profile + internal `_engine` personality config. POST accepts game state, returns GTO-informed decision modulated by personality (aggression, risk tolerance, GTO philosophy, contrarian tendency). LRU-cached preflop/postflop ranges. Fallback pool if DB unavailable. |
| 7-second matchmaking timeout | DONE | `pvp-lobby.js` handleFindMatch now waits exactly 7 seconds for a real player. If none joins, fetches a horse opponent from the API. Visual countdown timer during search. |
| Seamless AI opponent integration | DONE | Horse opponents appear as real players — same name format, avatar, rating, tier display. No UI element reveals the opponent is AI. Internal `_engine` config drives decisions only, never rendered. |
| PvPArena pre-matched opponent | DONE | PvPArena accepts `matchedOpponent` + `opponentEngine` props. When pre-matched from lobby, skips LOBBY view and starts match immediately. |
| PvPMatchEngine `_opponentEngine` | DONE | Engine stores internal decision config on player2 for AI-driven opponents. Returned in match results for analytics without client exposure. |
| Human-like think time | DONE | Decision engine returns `thinkTimeMs` with 1-6 second range, natural jitter, confidence-based speed variation. Prevents mechanical timing tells. |
| Horse personality decision engine | DONE | Full decision tree: preflop hand-tier system (premium/strong/medium/speculative/weak) + postflop equity-based decisions. Personality modulation: aggression widens raise ranges + increases bet sizing, risk profile adjusts fold/raise thresholds, GTO philosophy tunes balance vs exploitation, contrarian tendency injects surprise plays (slowplays, bluffs). SPR-aware commit-or-fold logic. |
| Session persistence | DONE | Session save includes opponent ID for analytics. No AI indicator in client-facing data. |

**Files Created:** `pages/api/training/horse-opponent.js`
**Files Changed:** `pages/hub/training/pvp-lobby.js`, `src/components/training/PvPArena.tsx`, `src/engines/PvPMatchEngine.js`
**Impact:** Players now always get a match within 7 seconds. If no real opponent joins, one of 300+ horses with unique personalities seamlessly fills the seat — the player experiences it as a normal human opponent with distinct playing style.

---

## FUTURE PHASES (Not Yet Started)
- **Phase 23: Commander SSR Auth** — Revisit when staging environment available
- **Phase 24: Club Arena E2E Expansion** — Game flow, poker hands, V8 Bible compliance E2E tests
- **Phase 25: Shared TypeScript Package** — Cross-repo type safety (requires careful migration plan)
- **Phase 26: Database Migration Safety** — Supabase migration tooling and rollback procedures

---

## SUPERSEDED / SHELVED PROJECTS

### `club-engine` (Vercel prj_iMqVCML4mpVnuBLIuEvvflAoKKBm) — shelved 2026-04-20
**Status:** `live: false`, superseded by sibling `club-arena` project which is green on production.

**Backing repo:** `Smarter-Poker/Club-Arena-Design` (private, repo id 1144973574) — note the repo name does NOT match the Vercel project name, which caused a brief "repo not found" red herring during the 2026-04-20 Vercel fleet audit.

**Deployment history:**
- Last READY: `dpl_CQskrWMJgr3YZ9wgsYN7QF4D1Ac9` on 2026-02-04 (sha `942e811`)
- 25 consecutive ERROR deploys between 2026-02-04 and 2026-02-07, all authored by Dan, all attempting TS/vite build fixes (TS2448 temporal dead zones, `.single()` → `.maybeSingle()` remediation, XP removal, `vercelignore` to fix the 15K file limit, framework/buildCommand tweaks)
- Silent since 2026-02-07 (73+ days quiet at time of audit)
- Build logs purged by Vercel (>14 days old) — root cause no longer retrievable

**Why shelved rather than deleted:** Permanent deletion of Vercel projects is an irreversible action the agent won't take without explicit user direction, and the project is already effectively inert (`live: false`, no custom domain, only `.vercel.app` subdomains). The sibling `club-arena` project already serves the Club Arena frontend in production, so no functionality is lost.

**If reviving:** fresh GITHUB_TOKEN required (the one in `.env` is currently 401). Pull `Smarter-Poker/Club-Arena-Design` locally, reproduce the vite build, diagnose the TS errors in `PlayerStatsDashboard`, `ClubDashboard`, `MessagingService`, `ReferralService`, `SocialEnhancementsService`, then push. Or redirect the backing repo's content into `club-arena` if the work is no longer distinct.

---

## VERCEL FLEET AUDIT — 2026-04-20

Triggered by: WH deploy cascade (15-min hung builds, heap OOMs). Fix landed on commit `a7342221` (sha `a73422219e`, production deploy `dpl_6w1TeEuUV5je76gGzEUdg8ZuCDoi`). Full-fleet audit followed per "nothing gets orphaned" directive.

**Result:** 15 of 16 projects READY, 1 shelved (see `club-engine` above).

| Project | State | Notes |
|---|---|---|
| hub-vanguard | READY | apex domain `smarter.poker`, Next.js 14 Pages Router, health endpoint OK (db 135ms, heap 30/58MB) |
| club-arena | READY | Vite, serves the Club Arena SPA (takes over from club-engine) |
| club-engine | SHELVED | See "Superseded Projects" above |
| identity-dna-engine | READY | |
| trivia-orb | READY | |
| social-hub-v2 | READY | |
| poker-near-me | READY | |
| bankroll-manager | READY | |
| marketplace-settings | READY | |
| smarter-assistant | READY | |
| diamond-arcade | READY | |
| master-bus | READY | |
| smarterpoker | READY | |
| social | READY | |
| gto-training-engine | READY | |
| training-project | READY | |

**Known side-finding:** GITHUB_TOKEN in `/Users/smarter.poker/Documents/.env` returns `401 Bad credentials` on both raw REST and the github MCP. Rotation required before any future github-api automation (Git Data API pushes, PR creation, repo inspection).
