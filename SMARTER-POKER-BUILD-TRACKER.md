# Smarter.Poker — Master Build Tracker

**Last Updated:** 2026-03-29
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

## FUTURE PHASES (Not Yet Started)
- **Phase 5: Commander SSR Auth** — Move PIN validation from client-side overlay to getServerSideProps
- **Phase 6: Cron Monitoring Automation** — Set up scheduled task to monitor cron health and alert on regressions
- **Phase 7: Club Arena E2E Expansion** — Game flow, poker hands, V8 Bible compliance E2E tests
- **Phase 8: Cross-Orb Health Dashboard** — Unified monitoring across all 22 Vercel projects
- **Phase 9: Performance Baseline** — Lighthouse scores, Core Web Vitals, API latency benchmarks
- **Phase 10: Infrastructure Hardening** — Shared TypeScript types package, database migration safety tooling, Supabase RPC audit
